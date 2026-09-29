-- A completed Business Trip is also the terminal settlement state for the
-- accommodation it created. This additionally repairs completed zero-difference
-- settlements, which previously did not transition the accommodation itself.
create or replace function public.sync_completed_business_trip_accommodation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if new.status = 'completed'
       and old.status is distinct from new.status then
        update public.accommodation_requests
        set status = 'realized', updated_at = now()
        where (
            id = new.accommodation_request_id
            or business_trip_id = new.id
            or (
                source_module = 'business_trip'
                and source_id = new.id
            )
        )
          and status in (
              'approved',
              'realization_process',
              'partial_realized'
          );
    end if;

    return new;
end;
$$;

drop trigger if exists business_trips_sync_completed_accommodation
    on public.business_trips;
create trigger business_trips_sync_completed_accommodation
after update of status on public.business_trips
for each row execute function public.sync_completed_business_trip_accommodation();

update public.accommodation_requests as accommodation
set status = 'realized', updated_at = now()
from public.business_trips as trip
where (
        trip.accommodation_request_id = accommodation.id
        or accommodation.business_trip_id = trip.id
        or (
            accommodation.source_module = 'business_trip'
            and accommodation.source_id = trip.id
        )
    )
  and trip.status = 'completed'
  and accommodation.status in (
      'approved',
      'realization_process',
      'partial_realized'
  );

-- A technician may only have one active accommodation request at a time.
-- Rejected requests are terminal and do not require settlement, while realized
-- requests are fully completed. All other statuses still need action.
create or replace function public.validate_active_accommodation_submission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    -- Accommodation created by an approved Business Trip is guarded by the
    -- Business Trip submission rule below, not by the manual-request rule.
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
          and lower(coalesce(prior_request.status, 'pending')) not in (
              'realized',
              'rejected'
          )
    ) then
        raise exception
            'Pengajuan akomodasi sebelumnya belum direalisasikan atau diselesaikan.';
    end if;

    return new;
end;
$$;

drop trigger if exists accommodation_requests_validate_active_submission
    on public.accommodation_requests;
create trigger accommodation_requests_validate_active_submission
before insert on public.accommodation_requests
for each row execute function public.validate_active_accommodation_submission();

-- Keep the existing submission validation intact, then prevent a new Business
-- Trip from being submitted while an earlier trip still has active
-- accommodation. The check is server-side and transaction-locked so it also
-- applies to simultaneous submissions and clients that bypass the UI.
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
