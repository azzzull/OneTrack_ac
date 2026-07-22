create index if not exists business_trips_submitted_at_idx
on public.business_trips (submitted_at asc);

drop policy if exists "Admins and management can manage business trips" on public.business_trips;
drop policy if exists "Admins and management can manage business trip agendas" on public.business_trip_agendas;

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

create or replace function public.reject_business_trip_request(
    p_business_trip_id uuid,
    p_rejection_reason text
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
    v_reason text := trim(coalesce(p_rejection_reason, ''));
    v_from_status text;
begin
    if v_actor_id is null then
        raise exception 'Sesi login tidak valid.';
    end if;

    if not public.is_admin_or_management(v_actor_id) then
        raise exception 'Anda tidak memiliki akses approval Business Trip.';
    end if;

    if char_length(v_reason) < 10 then
        raise exception 'Alasan penolakan wajib diisi minimal 10 karakter.';
    end if;

    if char_length(v_reason) > 1000 then
        raise exception 'Alasan penolakan maksimal 1000 karakter.';
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
        raise exception 'Pemohon tidak dapat menolak pengajuannya sendiri.';
    end if;

    if v_trip.status not in ('submitted', 'pending_approval') then
        raise exception 'Pengajuan sudah diproses.';
    end if;

    v_from_status := v_trip.status;

    update public.business_trips
    set
        status = 'rejected',
        rejected_at = v_now,
        rejected_by = v_actor_id,
        rejection_reason = v_reason,
        approved_at = null,
        approved_by = null,
        updated_at = v_now,
        updated_by = v_actor_id
    where id = p_business_trip_id
      and status in ('submitted', 'pending_approval')
    returning * into v_trip;

    if not found then
        raise exception 'Pengajuan sudah diproses.';
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
        'rejected',
        'REJECTED',
        v_reason,
        v_actor_id,
        v_now
    );

    return v_trip;
end;
$$;

create or replace function public.get_business_trip_approval_counts(
    p_start_date timestamptz,
    p_end_date_exclusive timestamptz
)
returns table(status text, total bigint)
language sql
security definer
set search_path = public
as $$
    select
        case
            when bt.status in ('submitted', 'pending_approval') then 'pending_approval'
            else bt.status
        end as status,
        count(*)::bigint as total
    from public.business_trips bt
    where public.is_admin_or_management(auth.uid())
      and bt.requester_id <> auth.uid()
      and bt.status in ('submitted', 'pending_approval', 'approved', 'rejected')
      and (p_start_date is null or bt.created_at >= p_start_date)
      and (p_end_date_exclusive is null or bt.created_at < p_end_date_exclusive)
    group by 1;
$$;

grant execute on function public.approve_business_trip_request(uuid, text) to authenticated;
grant execute on function public.reject_business_trip_request(uuid, text) to authenticated;
grant execute on function public.get_business_trip_approval_counts(timestamptz, timestamptz) to authenticated;

notify pgrst, 'reload schema';
