create or replace function public.ensure_business_trip_accommodation(
    p_business_trip_id uuid
)
returns public.accommodation_requests
language plpgsql
security definer
set search_path = public
as $$
declare
    v_trip public.business_trips%rowtype;
    v_accommodation public.accommodation_requests%rowtype;
    v_request_title text;
begin
    select *
    into v_trip
    from public.business_trips
    where id = p_business_trip_id
    for update;

    if not found then
        raise exception 'Business Trip tidak ditemukan.';
    end if;

    if coalesce(v_trip.requested_amount, 0) <= 0 then
        return null;
    end if;

    v_request_title := v_trip.business_trip_no || ' - ' || coalesce(v_trip.title, 'Business Trip');

    select *
    into v_accommodation
    from public.accommodation_requests
    where business_trip_id = p_business_trip_id
       or (
            source_module = 'business_trip'
            and source_id = p_business_trip_id
       )
    order by
        case when business_trip_id = p_business_trip_id then 0 else 1 end,
        created_at asc
    limit 1
    for update;

    if found then
        if v_accommodation.status = 'pending'
            or (
                v_accommodation.status = 'approved'
                and nullif(trim(coalesce(v_accommodation.transfer_proof_url, '')), '') is null
            )
        then
            update public.accommodation_requests
            set
                technician_id = v_trip.requester_id,
                project_id = v_trip.project_id,
                request_title = v_request_title,
                purpose = coalesce(v_trip.title, v_request_title),
                requested_amount = v_trip.requested_amount,
                approved_amount = null,
                status = 'pending',
                reviewed_by = null,
                reviewed_at = null,
                rejection_reason = null,
                transfer_proof_url = null,
                source_module = 'business_trip',
                source_id = v_trip.id,
                business_trip_id = v_trip.id,
                business_trip_no = v_trip.business_trip_no,
                updated_at = now()
            where id = v_accommodation.id
            returning * into v_accommodation;
        else
            update public.accommodation_requests
            set
                source_module = coalesce(source_module, 'business_trip'),
                source_id = coalesce(source_id, v_trip.id),
                business_trip_id = coalesce(business_trip_id, v_trip.id),
                business_trip_no = coalesce(business_trip_no, v_trip.business_trip_no),
                updated_at = now()
            where id = v_accommodation.id
            returning * into v_accommodation;
        end if;

        update public.business_trips
        set accommodation_request_id = v_accommodation.id,
            updated_at = now()
        where id = p_business_trip_id
          and accommodation_request_id is distinct from v_accommodation.id;

        return v_accommodation;
    end if;

    insert into public.accommodation_requests (
        technician_id,
        project_id,
        request_title,
        purpose,
        requested_amount,
        approved_amount,
        status,
        reviewed_by,
        reviewed_at,
        notes,
        source_module,
        source_id,
        business_trip_id,
        business_trip_no
    )
    values (
        v_trip.requester_id,
        v_trip.project_id,
        v_request_title,
        coalesce(v_trip.title, v_request_title),
        v_trip.requested_amount,
        null,
        'pending',
        null,
        null,
        'Auto-created from approved Business Trip',
        'business_trip',
        v_trip.id,
        v_trip.id,
        v_trip.business_trip_no
    )
    returning * into v_accommodation;

    update public.business_trips
    set accommodation_request_id = v_accommodation.id,
        updated_at = now()
    where id = p_business_trip_id;

    return v_accommodation;
end;
$$;

create or replace function public.approve_business_trip_request(
    p_business_trip_id uuid,
    p_note text default null
)
returns public.business_trips
language plpgsql
security definer
set search_path = public
as $$
declare
    v_trip public.business_trips%rowtype;
    v_actor_id uuid := auth.uid();
    v_now timestamptz := now();
    v_from_status text;
begin
    if v_actor_id is null then
        raise exception 'Sesi login tidak valid.';
    end if;

    if not public.is_admin_or_management(v_actor_id) then
        raise exception 'Anda tidak memiliki akses approval Business Trip.';
    end if;

    select *
    into v_trip
    from public.business_trips
    where id = p_business_trip_id
    for update;

    if not found then
        raise exception 'Business Trip tidak ditemukan.';
    end if;

    if v_trip.requester_id = v_actor_id then
        raise exception 'Pemohon tidak dapat menyetujui pengajuannya sendiri.';
    end if;

    if v_trip.status not in ('submitted', 'pending_approval') then
        raise exception 'Pengajuan sudah diproses.';
    end if;

    v_from_status := v_trip.status;

    update public.business_trips
    set
        status = 'approved',
        approved_at = v_now,
        approved_by = v_actor_id,
        rejected_at = null,
        rejected_by = null,
        rejection_reason = null,
        updated_at = v_now,
        updated_by = v_actor_id
    where id = p_business_trip_id
      and status in ('submitted', 'pending_approval')
    returning * into v_trip;

    if not found then
        raise exception 'Pengajuan sudah diproses.';
    end if;

    if coalesce(v_trip.requested_amount, 0) > 0 then
        perform public.ensure_business_trip_accommodation(p_business_trip_id);
        select *
        into v_trip
        from public.business_trips
        where id = p_business_trip_id;
    end if;

    insert into public.business_trip_status_history (
        business_trip_id,
        from_status,
        to_status,
        action,
        notes,
        acted_by,
        acted_at
    )
    values (
        p_business_trip_id,
        v_from_status,
        'approved',
        'APPROVED',
        nullif(trim(coalesce(p_note, '')), ''),
        v_actor_id,
        v_now
    );

    return v_trip;
end;
$$;

create or replace function public.disburse_business_trip_advance(
    p_business_trip_id uuid,
    p_amount numeric,
    p_payment_method text,
    p_reference_number text default null,
    p_notes text default null
)
returns public.business_trips
language plpgsql
security definer
set search_path = public
as $$
begin
    raise exception 'Pencairan Business Trip diproses melalui modul Accommodation.';
end;
$$;

create or replace function public.start_business_trip(
    p_business_trip_id uuid
)
returns public.business_trips
language plpgsql
security definer
set search_path = public
as $$
declare
    v_trip public.business_trips%rowtype;
    v_accommodation public.accommodation_requests%rowtype;
    v_actor_id uuid := auth.uid();
    v_now timestamptz := now();
    v_from_status text;
begin
    if v_actor_id is null then
        raise exception 'Sesi login tidak valid.';
    end if;

    select *
    into v_trip
    from public.business_trips
    where id = p_business_trip_id
    for update;

    if not found then
        raise exception 'Business Trip tidak ditemukan.';
    end if;

    if v_trip.requester_id <> v_actor_id then
        raise exception 'Anda tidak dapat memulai Business Trip ini.';
    end if;

    if coalesce(v_trip.requested_amount, 0) <= 0 then
        if v_trip.status <> 'approved' then
            raise exception 'Status Business Trip sudah berubah.';
        end if;
    elsif v_trip.status = 'advance_disbursed' then
        null;
    else
        if v_trip.status <> 'approved' then
            raise exception 'Status Business Trip sudah berubah.';
        end if;

        select *
        into v_accommodation
        from public.accommodation_requests
        where business_trip_id = p_business_trip_id
        for update;

        if not found then
            raise exception 'Pengajuan Akomodasi belum tersedia.';
        end if;

        if v_accommodation.status = 'rejected' then
            raise exception 'Pengajuan Akomodasi ditolak.';
        end if;

        if v_accommodation.status = 'pending' then
            raise exception 'Pengajuan Akomodasi belum disetujui.';
        end if;

        if v_accommodation.status not in (
            'approved',
            'realization_process',
            'partial_realized',
            'realized'
        ) then
            raise exception 'Status Akomodasi belum siap.';
        end if;

        if v_accommodation.status = 'approved'
            and (
                v_accommodation.approved_amount is null
                or nullif(trim(coalesce(v_accommodation.transfer_proof_url, '')), '') is null
            )
        then
            raise exception 'Pembayaran Akomodasi belum selesai.';
        end if;
    end if;

    v_from_status := v_trip.status;

    update public.business_trips
    set
        status = 'in_progress',
        started_at = v_now,
        updated_at = v_now,
        updated_by = v_actor_id
    where id = p_business_trip_id
      and status in ('approved', 'advance_disbursed')
    returning * into v_trip;

    if not found then
        raise exception 'Status Business Trip sudah berubah.';
    end if;

    insert into public.business_trip_status_history (
        business_trip_id,
        from_status,
        to_status,
        action,
        acted_by,
        acted_at
    )
    values (
        p_business_trip_id,
        v_from_status,
        'in_progress',
        'STARTED',
        v_actor_id,
        v_now
    );

    return v_trip;
end;
$$;

update public.accommodation_requests ar
set
    status = 'pending',
    approved_amount = null,
    reviewed_by = null,
    reviewed_at = null,
    rejection_reason = null,
    transfer_proof_url = null,
    source_module = 'business_trip',
    source_id = coalesce(ar.source_id, ar.business_trip_id),
    updated_at = now()
where (ar.business_trip_id is not null or ar.source_module = 'business_trip')
  and ar.status = 'approved'
  and nullif(trim(coalesce(ar.transfer_proof_url, '')), '') is null
  and not exists (
      select 1
      from public.business_trip_advance_disbursements btd
      where btd.accommodation_request_id = ar.id
  );

grant execute on function public.approve_business_trip_request(uuid, text) to authenticated;
grant execute on function public.disburse_business_trip_advance(uuid, numeric, text, text, text) to authenticated;
grant execute on function public.start_business_trip(uuid) to authenticated;

notify pgrst, 'reload schema';
