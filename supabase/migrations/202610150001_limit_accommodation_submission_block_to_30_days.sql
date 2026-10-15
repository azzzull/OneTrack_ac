-- Grandfather outstanding accommodation requests that were already more than
-- 30 days old when this migration is deployed. This is a one-time exemption:
-- every accommodation submitted after the migration continues to block a new
-- submission until it is fully realized or rejected.
alter table public.accommodation_requests
add column if not exists blocks_next_accommodation_submission boolean not null default true;

update public.accommodation_requests
set blocks_next_accommodation_submission = false
where coalesce(requested_at, created_at) < current_timestamp - interval '30 days';

create or replace function public.validate_active_accommodation_submission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    -- Accommodation created by an approved Business Trip is guarded by the
    -- Business Trip submission rule. Manual requests remain limited to one
    -- open settlement for each technician, except for legacy requests that
    -- were exempted once when this migration was deployed.
    if new.business_trip_id is not null
       or lower(coalesce(new.source_module, '')) = 'business_trip' then
        return new;
    end if;

    perform pg_advisory_xact_lock(
        hashtextextended(new.technician_id::text, 0)
    );

    if exists (
        select 1
        from public.accommodation_requests as prior_request
        where prior_request.technician_id = new.technician_id
          and prior_request.id is distinct from new.id
          and prior_request.blocks_next_accommodation_submission
          and not (
              lower(coalesce(prior_request.status, 'pending')) = 'rejected'
              or (
                  lower(coalesce(prior_request.status, 'pending')) = 'realized'
                  and (
                      exists (
                          select 1
                          from public.business_trips as trip
                          where trip.status = 'completed'
                            and (
                                trip.id = prior_request.business_trip_id
                                or (
                                    lower(coalesce(prior_request.source_module, '')) = 'business_trip'
                                    and prior_request.source_id = trip.id
                                )
                            )
                      )
                      or (
                          coalesce(prior_request.approved_amount, 0) > 0
                          and coalesce((
                              select sum(realization.amount)
                              from public.accommodation_realizations as realization
                              where realization.accommodation_request_id = prior_request.id
                          ), 0) >= prior_request.approved_amount
                      )
                  )
              )
          )
    ) then
        raise exception
            'Pengajuan akomodasi sebelumnya belum direalisasikan sepenuhnya.';
    end if;

    return new;
end;
$$;

create or replace function public.submit_business_trip_request(
    p_business_trip_id uuid,
    p_date_mode text,
    p_trip_date date,
    p_trip_start_date date,
    p_trip_end_date date,
    p_title text,
    p_project_id uuid,
    p_initiator_type text,
    p_initiator_name text,
    p_requested_amount numeric,
    p_agendas jsonb default '[]'::jsonb
)
returns public.business_trips
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_trip public.business_trips%rowtype;
    v_agenda_count integer;
    v_invalid_agenda_count integer;
    v_to_status text;
    v_action text;
begin
    v_trip := public.save_business_trip_draft(
        p_business_trip_id,
        p_date_mode,
        p_trip_date,
        p_trip_start_date,
        p_trip_end_date,
        p_title,
        p_project_id,
        p_initiator_type,
        p_initiator_name,
        p_requested_amount,
        p_agendas
    );

    perform pg_advisory_xact_lock(
        hashtextextended(v_trip.requester_id::text, 1)
    );

    if exists (
        select 1
        from public.accommodation_requests as accommodation
        join public.business_trips as prior_trip
          on prior_trip.id = accommodation.business_trip_id
            or (
                accommodation.source_module = 'business_trip'
                and accommodation.source_id = prior_trip.id
            )
        where prior_trip.requester_id = v_trip.requester_id
          and prior_trip.id <> p_business_trip_id
          and accommodation.blocks_next_accommodation_submission
          and lower(coalesce(accommodation.status, 'pending')) not in (
              'realized',
              'rejected'
          )
    ) then
        raise exception
            'Business Trip sebelumnya masih memiliki akomodasi yang belum direalisasikan atau diselesaikan.';
    end if;

    if coalesce(trim(v_trip.title), '') = '' then
        raise exception 'Judul Business Trip wajib diisi.';
    end if;
    if v_trip.project_id is null then
        raise exception 'Project wajib dipilih.';
    end if;
    if coalesce(trim(v_trip.initiator_name), '') = '' then
        raise exception 'Nama inisiator wajib diisi.';
    end if;
    if v_trip.date_mode = 'single' and v_trip.trip_date is null then
        raise exception 'Tanggal Business Trip wajib diisi.';
    end if;
    if v_trip.date_mode = 'range'
       and (v_trip.trip_start_date is null or v_trip.trip_end_date is null) then
        raise exception 'Tanggal Business Trip wajib diisi.';
    end if;

    select count(*)
    into v_agenda_count
    from public.business_trip_agendas
    where business_trip_id = p_business_trip_id;

    select count(*)
    into v_invalid_agenda_count
    from public.business_trip_agendas
    where business_trip_id = p_business_trip_id
      and (
          coalesce(trim(title), '') = ''
          or coalesce(trim(objective), '') = ''
      );

    if v_agenda_count = 0 then
        raise exception 'Minimal satu agenda wajib ditambahkan.';
    end if;
    if v_invalid_agenda_count > 0 then
        raise exception 'Nama dan tujuan setiap agenda wajib diisi.';
    end if;

    if v_trip.status = 'rejected' then
        v_to_status := 'pending_approval';
        v_action := 'resubmit';
    else
        v_to_status := 'submitted';
        v_action := 'submit';
    end if;

    return public.transition_business_trip_status(
        p_business_trip_id,
        v_to_status,
        v_action,
        null,
        null
    );
end;
$$;

grant execute on function public.submit_business_trip_request(
    uuid, text, date, date, date, text, uuid, text, text, numeric, jsonb
) to authenticated;

notify pgrst, 'reload schema';
