-- Allow an administrator to temporarily suspend the accommodation settlement
-- gate while historical requests are being reconciled. The default stays on
-- so the existing rule remains unchanged until an admin deliberately switches
-- it off.
create table if not exists public.accommodation_submission_settings (
    id smallint primary key default 1 check (id = 1),
    enabled boolean not null default true,
    note text,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles(id) on delete set null
);

alter table public.accommodation_submission_settings
    enable row level security;

insert into public.accommodation_submission_settings (id, enabled)
values (1, true)
on conflict (id) do nothing;

create or replace function public.is_accommodation_submission_block_enabled()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select coalesce(
        (
            select setting.enabled
            from public.accommodation_submission_settings as setting
            where setting.id = 1
        ),
        true
    );
$$;

create or replace function public.get_accommodation_submission_block_setting()
returns table (
    enabled boolean,
    note text,
    updated_at timestamptz,
    updated_by uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if not exists (
        select 1
        from public.profiles as profile
        where profile.id = auth.uid()
          and profile.role = 'admin'
    ) then
        raise exception 'Hanya admin yang dapat melihat pengaturan ini.'
            using errcode = '42501';
    end if;

    return query
    select
        setting.enabled,
        setting.note,
        setting.updated_at,
        setting.updated_by
    from public.accommodation_submission_settings as setting
    where setting.id = 1;
end;
$$;

create or replace function public.set_accommodation_submission_block_setting(
    p_enabled boolean,
    p_note text default null
)
returns table (
    enabled boolean,
    note text,
    updated_at timestamptz,
    updated_by uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if not exists (
        select 1
        from public.profiles as profile
        where profile.id = auth.uid()
          and profile.role = 'admin'
    ) then
        raise exception 'Hanya admin yang dapat mengubah pengaturan ini.'
            using errcode = '42501';
    end if;

    return query
    with saved as (
        insert into public.accommodation_submission_settings as setting (
            id,
            enabled,
            note,
            updated_at,
            updated_by
        )
        values (
            1,
            coalesce(p_enabled, true),
            nullif(trim(p_note), ''),
            now(),
            auth.uid()
        )
        on conflict (id) do update
        set enabled = excluded.enabled,
            note = excluded.note,
            updated_at = excluded.updated_at,
            updated_by = excluded.updated_by
        returning
            setting.enabled,
            setting.note,
            setting.updated_at,
            setting.updated_by
    )
    select saved.enabled, saved.note, saved.updated_at, saved.updated_by
    from saved;
end;
$$;

revoke all on function public.is_accommodation_submission_block_enabled()
    from public;
revoke all on function public.get_accommodation_submission_block_setting()
    from public;
revoke all on function public.set_accommodation_submission_block_setting(
    boolean,
    text
) from public;

grant execute on function public.get_accommodation_submission_block_setting()
    to authenticated;
grant execute on function public.set_accommodation_submission_block_setting(
    boolean,
    text
) to authenticated;

create or replace function public.validate_active_accommodation_submission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_blocking_request public.accommodation_requests%rowtype;
begin
    -- Accommodation created by an approved Business Trip is guarded by the
    -- Business Trip submission rule below.
    if new.business_trip_id is not null
       or lower(coalesce(new.source_module, '')) = 'business_trip' then
        return new;
    end if;

    if not public.is_accommodation_submission_block_enabled() then
        return new;
    end if;

    perform pg_advisory_xact_lock(
        hashtextextended(new.technician_id::text, 0)
    );

    select prior_request.*
    into v_blocking_request
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
    order by coalesce(prior_request.requested_at, prior_request.created_at) asc
    limit 1;

    if found then
        raise exception
            'Pengajuan akomodasi "%" yang diajukan pada % belum direalisasikan sepenuhnya. Selesaikan realisasi pengajuan tersebut sebelum membuat pengajuan baru.',
            coalesce(v_blocking_request.request_title, 'sebelumnya'),
            to_char(
                coalesce(
                    v_blocking_request.requested_at,
                    v_blocking_request.created_at
                ) at time zone 'Asia/Jakarta',
                'DD/MM/YYYY'
            );
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
    v_blocking_accommodation public.accommodation_requests%rowtype;
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

    if public.is_accommodation_submission_block_enabled() then
        select accommodation.*
        into v_blocking_accommodation
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
        order by coalesce(accommodation.requested_at, accommodation.created_at) asc
        limit 1;

        if found then
            raise exception
                'Business Trip belum dapat diajukan karena akomodasi "%" yang diajukan pada % belum direalisasikan atau diselesaikan.',
                coalesce(v_blocking_accommodation.request_title, 'sebelumnya'),
                to_char(
                    coalesce(
                        v_blocking_accommodation.requested_at,
                        v_blocking_accommodation.created_at
                    ) at time zone 'Asia/Jakarta',
                    'DD/MM/YYYY'
                );
        end if;
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
