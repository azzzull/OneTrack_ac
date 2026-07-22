alter table public.business_trips
add column if not exists advance_disbursed_by uuid references public.profiles(id) on delete set null;

alter table public.accommodation_requests
add column if not exists source_module text,
add column if not exists source_id uuid,
add column if not exists business_trip_no text;

alter table public.accommodation_requests
add column if not exists business_trip_id uuid references public.business_trips(id) on delete set null;

create unique index if not exists accommodation_requests_business_trip_id_unique_idx
on public.accommodation_requests (business_trip_id)
where business_trip_id is not null;

create index if not exists business_trips_approved_at_idx
on public.business_trips (approved_at asc)
where status = 'approved';

create table if not exists public.business_trip_advance_disbursements (
    id uuid primary key default gen_random_uuid(),
    business_trip_id uuid not null references public.business_trips(id) on delete cascade,
    accommodation_request_id uuid not null references public.accommodation_requests(id) on delete restrict,
    amount numeric(14,2) not null check (amount > 0),
    payment_method text not null check (payment_method in ('cash', 'transfer', 'other')),
    reference_number text,
    notes text,
    disbursed_at timestamptz not null default now(),
    disbursed_by uuid not null references public.profiles(id) on delete restrict,
    created_at timestamptz not null default now(),
    constraint business_trip_advance_disbursements_trip_unique unique (business_trip_id),
    constraint business_trip_advance_disbursements_accommodation_unique unique (accommodation_request_id)
);

create index if not exists business_trip_advance_disbursements_disbursed_at_idx
on public.business_trip_advance_disbursements (disbursed_at desc);

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

    select *
    into v_accommodation
    from public.accommodation_requests
    where business_trip_id = p_business_trip_id
    for update;

    if found then
        update public.business_trips
        set accommodation_request_id = v_accommodation.id
        where id = p_business_trip_id
          and accommodation_request_id is distinct from v_accommodation.id;

        return v_accommodation;
    end if;

    v_request_title := v_trip.business_trip_no || ' - ' || coalesce(v_trip.title, 'Business Trip');

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
        v_trip.requested_amount,
        'approved',
        auth.uid(),
        now(),
        'Auto-created from approved Business Trip',
        'business_trip',
        v_trip.id,
        v_trip.id,
        v_trip.business_trip_no
    )
    returning * into v_accommodation;

    update public.business_trips
    set accommodation_request_id = v_accommodation.id
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
        select * into v_trip from public.business_trips where id = p_business_trip_id;
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
declare
    v_trip public.business_trips%rowtype;
    v_accommodation public.accommodation_requests%rowtype;
    v_actor_id uuid := auth.uid();
    v_now timestamptz := now();
    v_method text := lower(trim(coalesce(p_payment_method, '')));
begin
    if v_actor_id is null then
        raise exception 'Sesi login tidak valid.';
    end if;

    if not public.is_admin_or_management(v_actor_id) then
        raise exception 'Anda tidak memiliki akses pencairan Business Trip.';
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
        raise exception 'Pemohon tidak dapat mencairkan uang muka pengajuannya sendiri.';
    end if;

    if v_trip.status <> 'approved' then
        if v_trip.status = 'advance_disbursed' then
            raise exception 'Uang muka sudah dicairkan.';
        end if;
        raise exception 'Status Business Trip sudah berubah.';
    end if;

    if coalesce(v_trip.requested_amount, 0) <= 0 then
        raise exception 'Business Trip ini tidak mengajukan uang muka akomodasi.';
    end if;

    if p_amount is null or p_amount <= 0 then
        raise exception 'Nominal pencairan tidak valid.';
    end if;

    if p_amount <> v_trip.requested_amount then
        raise exception 'Nominal pencairan harus sama dengan Requested Amount.';
    end if;

    if v_method not in ('cash', 'transfer', 'other') then
        raise exception 'Metode pembayaran tidak valid.';
    end if;

    select *
    into v_accommodation
    from public.accommodation_requests
    where business_trip_id = p_business_trip_id
    for update;

    if not found then
        v_accommodation := public.ensure_business_trip_accommodation(p_business_trip_id);
    end if;

    if v_accommodation.id is null then
        raise exception 'Pengajuan Akomodasi tidak tersedia.';
    end if;

    if v_accommodation.status <> 'approved' then
        raise exception 'Pengajuan Akomodasi belum siap dicairkan.';
    end if;

    insert into public.business_trip_advance_disbursements (
        business_trip_id,
        accommodation_request_id,
        amount,
        payment_method,
        reference_number,
        notes,
        disbursed_at,
        disbursed_by
    )
    values (
        p_business_trip_id,
        v_accommodation.id,
        p_amount,
        v_method,
        nullif(trim(coalesce(p_reference_number, '')), ''),
        nullif(trim(coalesce(p_notes, '')), ''),
        v_now,
        v_actor_id
    );

    update public.accommodation_requests
    set
        status = 'realization_process',
        reviewed_by = coalesce(reviewed_by, v_actor_id),
        reviewed_at = coalesce(reviewed_at, v_now),
        updated_at = v_now
    where id = v_accommodation.id;

    update public.business_trips
    set
        status = 'advance_disbursed',
        advance_disbursed_at = v_now,
        advance_disbursed_by = v_actor_id,
        updated_at = v_now,
        updated_by = v_actor_id
    where id = p_business_trip_id
      and status = 'approved'
    returning * into v_trip;

    if not found then
        raise exception 'Uang muka sudah dicairkan.';
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
        'approved',
        'advance_disbursed',
        'ADVANCE_DISBURSED',
        concat_ws(
            ' | ',
            'amount=' || p_amount::text,
            'method=' || v_method,
            case
                when nullif(trim(coalesce(p_reference_number, '')), '') is not null
                then 'ref=' || nullif(trim(coalesce(p_reference_number, '')), '')
                else null
            end
        ),
        v_actor_id,
        v_now
    );

    return v_trip;
exception
    when unique_violation then
        raise exception 'Uang muka sudah dicairkan.';
end;
$$;

grant execute on function public.ensure_business_trip_accommodation(uuid) to authenticated;
grant execute on function public.disburse_business_trip_advance(uuid, numeric, text, text, text) to authenticated;

alter table public.business_trip_advance_disbursements enable row level security;

drop policy if exists "Business trip disbursements can be read by trip access" on public.business_trip_advance_disbursements;
create policy "Business trip disbursements can be read by trip access"
on public.business_trip_advance_disbursements
for select
to authenticated
using (public.can_access_business_trip(business_trip_id, auth.uid()));

drop policy if exists "Admins and management can insert business trip disbursements" on public.business_trip_advance_disbursements;
create policy "Admins and management can insert business trip disbursements"
on public.business_trip_advance_disbursements
for insert
to authenticated
with check (
    public.is_admin_or_management(auth.uid())
    and disbursed_by = auth.uid()
);

notify pgrst, 'reload schema';
