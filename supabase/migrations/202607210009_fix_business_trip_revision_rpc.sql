create or replace function public.request_business_trip_realization_revision(
    p_business_trip_id uuid,
    p_revision_note text
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
begin
    if v_actor_id is null then
        raise exception 'Sesi login tidak valid.';
    end if;
    if not public.is_admin_or_management(v_actor_id) then
        raise exception 'Anda tidak memiliki akses meminta revisi realisasi.';
    end if;
    if nullif(trim(p_revision_note), '') is null then
        raise exception 'Catatan revisi wajib diisi.';
    end if;

    select *
    into v_trip
    from public.business_trips
    where id = p_business_trip_id
    for update;

    if not found then
        raise exception 'Business Trip tidak ditemukan.';
    end if;

    if v_trip.status <> 'realization_submitted' then
        raise exception 'Laporan realisasi belum siap direvisi.';
    end if;

    update public.business_trip_agenda_realizations
    set
        status = 'revision_required',
        updated_by = v_actor_id,
        updated_at = v_now
    where business_trip_id = p_business_trip_id;

    update public.business_trips
    set
        status = 'realization_revision_required',
        realization_revision_note = left(trim(p_revision_note), 1000),
        realization_reviewed_at = v_now,
        realization_reviewed_by = v_actor_id,
        updated_at = v_now,
        updated_by = v_actor_id
    where id = p_business_trip_id
      and status = 'realization_submitted'
    returning * into v_trip;

    if not found then
        raise exception 'Laporan sudah diproses.';
    end if;

    insert into public.business_trip_status_history (
        business_trip_id, from_status, to_status, action, notes, acted_by, acted_at
    )
    values (
        p_business_trip_id,
        'realization_submitted',
        'realization_revision_required',
        'REALIZATION_REVISION_REQUESTED',
        left(trim(p_revision_note), 1000),
        v_actor_id,
        v_now
    );

    return v_trip;
end;
$$;

grant execute on function public.request_business_trip_realization_revision(uuid, text) to authenticated;

notify pgrst, 'reload schema';
