create or replace function public.create_business_trip_draft()
returns public.business_trips
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor_id uuid := auth.uid();
    v_trip public.business_trips%rowtype;
begin
    if v_actor_id is null then
        raise exception 'User belum terautentikasi.';
    end if;

    if not public.is_business_trip_requester(v_actor_id) then
        raise exception 'Anda tidak memiliki akses membuat Business Trip.';
    end if;

    insert into public.business_trips (
        requester_id,
        created_by,
        updated_by,
        status,
        requested_amount
    ) values (
        v_actor_id,
        v_actor_id,
        v_actor_id,
        'draft',
        0
    )
    returning * into v_trip;

    insert into public.business_trip_status_history (
        business_trip_id,
        from_status,
        to_status,
        action,
        notes,
        acted_by
    ) values (
        v_trip.id,
        null,
        'draft',
        'CREATED',
        'Draft Business Trip dibuat.',
        v_actor_id
    );

    return v_trip;
end;
$$;

grant execute on function public.create_business_trip_draft() to authenticated;
create or replace function public.save_business_trip_draft(
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
set search_path = public
as $$
declare
    v_trip public.business_trips%rowtype;
    v_agenda jsonb;
    v_sequence integer := 0;
begin
    select *
    into v_trip
    from public.business_trips
    where id = p_business_trip_id
    for update;

    if not found then
        raise exception 'Business Trip tidak ditemukan.';
    end if;

    if v_trip.requester_id <> auth.uid() then
        raise exception 'Anda tidak dapat mengubah Business Trip ini.';
    end if;

    if v_trip.status not in ('draft', 'rejected') then
        raise exception 'Business Trip tidak dapat diedit pada status saat ini.';
    end if;

    if p_requested_amount is null or p_requested_amount < 0 then
        raise exception 'Requested Amount tidak valid.';
    end if;

    update public.business_trips
    set
        date_mode = p_date_mode,
        trip_date = case when p_date_mode = 'single' then p_trip_date else null end,
        trip_start_date = case when p_date_mode = 'range' then p_trip_start_date else null end,
        trip_end_date = case when p_date_mode = 'range' then p_trip_end_date else null end,
        title = nullif(trim(coalesce(p_title, '')), ''),
        project_id = p_project_id,
        initiator_type = p_initiator_type,
        initiator_name = nullif(trim(coalesce(p_initiator_name, '')), ''),
        requested_amount = p_requested_amount,
        updated_by = auth.uid()
    where id = p_business_trip_id
    returning * into v_trip;

    delete from public.business_trip_agendas
    where business_trip_id = p_business_trip_id;

    for v_agenda in select * from jsonb_array_elements(coalesce(p_agendas, '[]'::jsonb))
    loop
        v_sequence := v_sequence + 1;
        insert into public.business_trip_agendas (
            business_trip_id,
            sequence_no,
            title,
            objective
        )
        values (
            p_business_trip_id,
            v_sequence,
            trim(coalesce(v_agenda->>'title', '')),
            trim(coalesce(v_agenda->>'objective', ''))
        );
    end loop;

    return v_trip;
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
set search_path = public
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
    if v_trip.date_mode = 'range' and (v_trip.trip_start_date is null or v_trip.trip_end_date is null) then
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
      and (coalesce(trim(title), '') = '' or coalesce(trim(objective), '') = '');

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

create or replace function public.delete_business_trip_draft(p_business_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_status text;
    v_requester_id uuid;
begin
    select status, requester_id
    into v_status, v_requester_id
    from public.business_trips
    where id = p_business_trip_id;

    if not found then
        return;
    end if;
    if v_requester_id <> auth.uid() then
        raise exception 'Anda tidak dapat menghapus draft ini.';
    end if;
    if v_status <> 'draft' then
        raise exception 'Hanya draft yang dapat dihapus.';
    end if;

    delete from public.business_trips where id = p_business_trip_id;
end;
$$;

create or replace function public.get_business_trip_status_counts(
    p_start_date timestamptz,
    p_end_date_exclusive timestamptz
)
returns table(status text, total bigint)
language sql
security definer
set search_path = public
as $$
    select bt.status, count(*)::bigint
    from public.business_trips bt
    where public.can_access_business_trip(bt.id, auth.uid())
      and (p_start_date is null or bt.created_at >= p_start_date)
      and (p_end_date_exclusive is null or bt.created_at < p_end_date_exclusive)
    group by bt.status;
$$;

grant execute on function public.save_business_trip_draft(uuid, text, date, date, date, text, uuid, text, text, numeric, jsonb) to authenticated;
grant execute on function public.submit_business_trip_request(uuid, text, date, date, date, text, uuid, text, text, numeric, jsonb) to authenticated;
grant execute on function public.delete_business_trip_draft(uuid) to authenticated;
grant execute on function public.get_business_trip_status_counts(timestamptz, timestamptz) to authenticated;

notify pgrst, 'reload schema';
