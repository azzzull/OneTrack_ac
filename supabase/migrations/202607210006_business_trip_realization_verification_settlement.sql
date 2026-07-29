alter table public.business_trips
drop constraint if exists business_trips_status_check;

alter table public.business_trips
add constraint business_trips_status_check check (
    status in (
        'draft',
        'submitted',
        'pending_approval',
        'rejected',
        'approved',
        'advance_disbursed',
        'in_progress',
        'realization_draft',
        'realization_submitted',
        'realization_revision_required',
        'realization_verified',
        'pending_refund',
        'pending_additional_payment',
        'completed',
        'cancelled'
    )
);

alter table public.business_trips
add column if not exists realization_revision_note text,
add column if not exists realization_reviewed_at timestamptz,
add column if not exists realization_reviewed_by uuid references public.profiles(id) on delete set null,
add column if not exists total_realization_amount numeric(14,2) not null default 0 check (total_realization_amount >= 0),
add column if not exists settlement_difference numeric(14,2) not null default 0,
add column if not exists settlement_status text not null default 'none' check (
    settlement_status in ('none', 'not_required', 'pending_refund', 'pending_additional_payment', 'completed')
),
add column if not exists settlement_completed_at timestamptz,
add column if not exists settlement_completed_by uuid references public.profiles(id) on delete set null,
add column if not exists completed_by uuid references public.profiles(id) on delete set null;

alter table public.business_trip_agenda_realizations
add column if not exists realized_amount numeric(14,2) not null default 0 check (realized_amount >= 0);

alter table public.business_trip_agenda_realizations
drop constraint if exists business_trip_agenda_realizations_status_check;

alter table public.business_trip_agenda_realizations
add constraint business_trip_agenda_realizations_status_check check (
    status in ('draft', 'submitted', 'revision_required', 'verified')
);

create index if not exists business_trips_realization_submitted_at_idx
on public.business_trips (realization_submitted_at asc)
where status = 'realization_submitted';

create index if not exists business_trips_completed_at_idx
on public.business_trips (completed_at desc)
where completed_at is not null;

create table if not exists public.business_trip_settlements (
    id uuid primary key default gen_random_uuid(),
    business_trip_id uuid not null references public.business_trips(id) on delete cascade,
    type text not null check (type in ('refund', 'additional_payment')),
    amount numeric(14,2) not null check (amount > 0),
    payment_method text not null check (payment_method in ('cash', 'transfer', 'other')),
    account_label text,
    reference_number text,
    transaction_date timestamptz not null default now(),
    notes text,
    processed_by uuid not null references public.profiles(id) on delete restrict,
    created_at timestamptz not null default now(),
    constraint business_trip_settlements_trip_type_unique unique (business_trip_id, type)
);

create index if not exists business_trip_settlements_business_trip_id_idx
on public.business_trip_settlements (business_trip_id);

alter table public.business_trip_settlements enable row level security;

drop policy if exists "Business trip settlements can be read by trip access" on public.business_trip_settlements;
create policy "Business trip settlements can be read by trip access"
on public.business_trip_settlements
for select
to authenticated
using (public.can_access_business_trip(business_trip_id, auth.uid()));

drop policy if exists "Admins and management can insert business trip settlements" on public.business_trip_settlements;
create policy "Admins and management can insert business trip settlements"
on public.business_trip_settlements
for insert
to authenticated
with check (
    public.is_admin_or_management(auth.uid())
    and processed_by = auth.uid()
);

create or replace function public.is_valid_business_trip_transition(
    p_from_status text,
    p_to_status text
)
returns boolean
language sql
immutable
as $$
    select (p_from_status, p_to_status) in (
        ('draft', 'submitted'),
        ('submitted', 'pending_approval'),
        ('pending_approval', 'approved'),
        ('pending_approval', 'rejected'),
        ('rejected', 'pending_approval'),
        ('approved', 'advance_disbursed'),
        ('approved', 'in_progress'),
        ('advance_disbursed', 'in_progress'),
        ('in_progress', 'realization_draft'),
        ('in_progress', 'realization_submitted'),
        ('realization_draft', 'realization_submitted'),
        ('realization_submitted', 'realization_revision_required'),
        ('realization_revision_required', 'realization_draft'),
        ('realization_revision_required', 'realization_submitted'),
        ('realization_submitted', 'realization_verified'),
        ('realization_verified', 'pending_refund'),
        ('realization_verified', 'pending_additional_payment'),
        ('realization_verified', 'completed'),
        ('pending_refund', 'completed'),
        ('pending_additional_payment', 'completed')
    );
$$;

create or replace function public.calculate_business_trip_settlement(
    p_business_trip_id uuid
)
returns table (
    business_trip_id uuid,
    requested_amount numeric,
    disbursed_amount numeric,
    total_realization_amount numeric,
    settlement_difference numeric,
    settlement_status text
)
language sql
security definer
set search_path = public
as $$
    with totals as (
        select
            bt.id,
            coalesce(bt.requested_amount, 0)::numeric(14,2) as requested_amount,
            coalesce(sum(distinct d.amount), 0)::numeric(14,2) as disbursed_amount,
            coalesce(sum(r.realized_amount), 0)::numeric(14,2) as total_realization_amount
        from public.business_trips bt
        left join public.business_trip_advance_disbursements d
          on d.business_trip_id = bt.id
        left join public.business_trip_agenda_realizations r
          on r.business_trip_id = bt.id
        where bt.id = p_business_trip_id
          and public.can_access_business_trip(bt.id, auth.uid())
        group by bt.id, bt.requested_amount
    )
    select
        id,
        requested_amount,
        disbursed_amount,
        total_realization_amount,
        (disbursed_amount - total_realization_amount)::numeric(14,2),
        case
            when (disbursed_amount - total_realization_amount) > 0 then 'pending_refund'
            when (disbursed_amount - total_realization_amount) < 0 then 'pending_additional_payment'
            else 'not_required'
        end
    from totals;
$$;

create or replace function public.save_business_trip_realization_draft(
    p_business_trip_id uuid,
    p_realizations jsonb default '[]'::jsonb
)
returns public.business_trips
language plpgsql
security definer
set search_path = public
as $$
declare
    v_trip public.business_trips%rowtype;
    v_actor_id uuid := auth.uid();
    v_item jsonb;
    v_agenda_id uuid;
    v_result text;
    v_realized_amount numeric(14,2);
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
        raise exception 'Anda tidak dapat mengubah laporan realisasi ini.';
    end if;

    if v_trip.status not in ('in_progress', 'realization_draft', 'realization_revision_required') then
        raise exception 'Status Business Trip sudah berubah.';
    end if;

    for v_item in select * from jsonb_array_elements(coalesce(p_realizations, '[]'::jsonb))
    loop
        v_agenda_id := (v_item ->> 'agenda_id')::uuid;
        v_result := left(coalesce(v_item ->> 'result', ''), 5000);
        v_realized_amount := greatest(coalesce(nullif(v_item ->> 'realized_amount', '')::numeric, 0), 0);

        if not exists (
            select 1
            from public.business_trip_agendas a
            where a.id = v_agenda_id
              and a.business_trip_id = p_business_trip_id
        ) then
            raise exception 'Agenda realisasi tidak valid.';
        end if;

        insert into public.business_trip_agenda_realizations (
            agenda_id,
            business_trip_id,
            result,
            realized_amount,
            status,
            created_by,
            updated_by
        )
        values (
            v_agenda_id,
            p_business_trip_id,
            v_result,
            v_realized_amount,
            'draft',
            v_actor_id,
            v_actor_id
        )
        on conflict (agenda_id)
        do update set
            result = excluded.result,
            realized_amount = excluded.realized_amount,
            status = 'draft',
            updated_by = v_actor_id,
            updated_at = now();
    end loop;

    update public.business_trips
    set
        status = 'realization_draft',
        realization_revision_note = case when status = 'realization_revision_required' then realization_revision_note else null end,
        updated_at = now(),
        updated_by = v_actor_id
    where id = p_business_trip_id
      and status in ('in_progress', 'realization_draft', 'realization_revision_required')
    returning * into v_trip;

    return v_trip;
end;
$$;

create or replace function public.submit_business_trip_realization(
    p_business_trip_id uuid
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
    v_agenda_count integer;
    v_complete_count integer;
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
        raise exception 'Anda tidak dapat mengirim laporan realisasi ini.';
    end if;

    if v_trip.status not in ('in_progress', 'realization_draft', 'realization_revision_required') then
        raise exception 'Status Business Trip sudah berubah.';
    end if;

    v_from_status := v_trip.status;

    select count(*)
    into v_agenda_count
    from public.business_trip_agendas
    where business_trip_id = p_business_trip_id;

    select count(*)
    into v_complete_count
    from public.business_trip_agendas a
    join public.business_trip_agenda_realizations r
      on r.agenda_id = a.id
     and r.business_trip_id = a.business_trip_id
    where a.business_trip_id = p_business_trip_id
      and coalesce(trim(r.result), '') <> ''
      and coalesce(r.realized_amount, 0) >= 0
      and exists (
          select 1
          from public.business_trip_agenda_photos p
          where p.business_trip_id = a.business_trip_id
            and p.agenda_id = a.id
      );

    if v_agenda_count = 0 or v_complete_count <> v_agenda_count then
        raise exception 'Laporan belum lengkap.';
    end if;

    update public.business_trip_agenda_realizations
    set
        status = 'submitted',
        submitted_at = v_now,
        updated_by = v_actor_id,
        updated_at = v_now
    where business_trip_id = p_business_trip_id;

    update public.business_trips
    set
        status = 'realization_submitted',
        realization_submitted_at = v_now,
        realization_revision_note = null,
        updated_at = v_now,
        updated_by = v_actor_id
    where id = p_business_trip_id
      and status in ('in_progress', 'realization_draft', 'realization_revision_required')
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
        'realization_submitted',
        case when v_from_status = 'realization_revision_required' then 'REALIZATION_RESUBMITTED' else 'REALIZATION_SUBMITTED' end,
        v_actor_id,
        v_now
    );

    return v_trip;
end;
$$;

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
    v_note text := trim(coalesce(p_revision_note, ''));
    v_now timestamptz := now();
begin
    if v_actor_id is null then
        raise exception 'Sesi login tidak valid.';
    end if;
    if not public.is_admin_or_management(v_actor_id) then
        raise exception 'Anda tidak memiliki akses verifikasi realisasi.';
    end if;
    if length(v_note) < 10 then
        raise exception 'Catatan revisi wajib diisi minimal 10 karakter.';
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
        raise exception 'Pemohon tidak dapat memverifikasi pengajuannya sendiri.';
    end if;
    if v_trip.status <> 'realization_submitted' then
        raise exception 'Laporan sudah diproses.';
    end if;

    update public.business_trip_agenda_realizations
    set status = 'revision_required', updated_by = v_actor_id, updated_at = v_now
    where business_trip_id = p_business_trip_id;

    update public.business_trips
    set
        status = 'realization_revision_required',
        realization_revision_note = left(v_note, 1000),
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
        left(v_note, 1000),
        v_actor_id,
        v_now
    );

    return v_trip;
end;
$$;

create or replace function public.verify_business_trip_realization(
    p_business_trip_id uuid
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
    v_agenda_count integer;
    v_complete_count integer;
    v_calc record;
    v_next_status text;
begin
    if v_actor_id is null then
        raise exception 'Sesi login tidak valid.';
    end if;
    if not public.is_admin_or_management(v_actor_id) then
        raise exception 'Anda tidak memiliki akses verifikasi realisasi.';
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
        raise exception 'Pemohon tidak dapat memverifikasi pengajuannya sendiri.';
    end if;
    if v_trip.status <> 'realization_submitted' then
        raise exception 'Laporan sudah diproses.';
    end if;

    select count(*)
    into v_agenda_count
    from public.business_trip_agendas
    where business_trip_id = p_business_trip_id;

    select count(*)
    into v_complete_count
    from public.business_trip_agendas a
    join public.business_trip_agenda_realizations r
      on r.agenda_id = a.id
     and r.business_trip_id = a.business_trip_id
    where a.business_trip_id = p_business_trip_id
      and coalesce(trim(r.result), '') <> ''
      and coalesce(r.realized_amount, 0) >= 0
      and exists (
          select 1
          from public.business_trip_agenda_photos p
          where p.business_trip_id = a.business_trip_id
            and p.agenda_id = a.id
      );

    if v_agenda_count = 0 or v_complete_count <> v_agenda_count then
        raise exception 'Laporan belum lengkap.';
    end if;

    select *
    into v_calc
    from public.calculate_business_trip_settlement(p_business_trip_id);

    v_next_status := case
        when v_calc.settlement_difference > 0 then 'pending_refund'
        when v_calc.settlement_difference < 0 then 'pending_additional_payment'
        else 'completed'
    end;

    update public.business_trip_agenda_realizations
    set
        status = 'verified',
        verified_at = v_now,
        updated_by = v_actor_id,
        updated_at = v_now
    where business_trip_id = p_business_trip_id;

    update public.business_trips
    set
        status = v_next_status,
        total_realization_amount = v_calc.total_realization_amount,
        settlement_difference = v_calc.settlement_difference,
        settlement_status = case
            when v_next_status = 'completed' then 'not_required'
            else v_next_status
        end,
        realization_verified_at = v_now,
        realization_verified_by = v_actor_id,
        realization_reviewed_at = v_now,
        realization_reviewed_by = v_actor_id,
        completed_at = case when v_next_status = 'completed' then v_now else completed_at end,
        completed_by = case when v_next_status = 'completed' then v_actor_id else completed_by end,
        settlement_completed_at = case when v_next_status = 'completed' then v_now else settlement_completed_at end,
        settlement_completed_by = case when v_next_status = 'completed' then v_actor_id else settlement_completed_by end,
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
        'realization_verified',
        'REALIZATION_VERIFIED',
        concat_ws(
            ' | ',
            'total=' || v_calc.total_realization_amount::text,
            'disbursed=' || v_calc.disbursed_amount::text,
            'difference=' || v_calc.settlement_difference::text
        ),
        v_actor_id,
        v_now
    );

    insert into public.business_trip_status_history (
        business_trip_id, from_status, to_status, action, notes, acted_by, acted_at
    )
    values (
        p_business_trip_id,
        'realization_verified',
        v_next_status,
        case
            when v_next_status = 'completed' then 'COMPLETED'
            when v_next_status = 'pending_refund' then 'SETTLEMENT_PENDING_REFUND'
            else 'SETTLEMENT_PENDING_ADDITIONAL_PAYMENT'
        end,
        case
            when v_next_status = 'completed' then 'Tidak ada selisih settlement.'
            when v_next_status = 'pending_refund' then 'Menunggu pengembalian sisa uang muka.'
            else 'Menunggu pembayaran kekurangan biaya.'
        end,
        v_actor_id,
        v_now
    );

    return v_trip;
end;
$$;

create or replace function public.record_business_trip_advance_refund(
    p_business_trip_id uuid,
    p_amount numeric,
    p_payment_method text,
    p_transaction_date timestamptz default now(),
    p_account_label text default null,
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
    v_actor_id uuid := auth.uid();
    v_now timestamptz := now();
    v_method text := lower(trim(coalesce(p_payment_method, '')));
    v_expected numeric(14,2);
begin
    if v_actor_id is null then
        raise exception 'Sesi login tidak valid.';
    end if;
    if not public.is_admin_or_management(v_actor_id) then
        raise exception 'Anda tidak memiliki akses settlement Business Trip.';
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
        raise exception 'Pemohon tidak dapat memproses settlement pengajuannya sendiri.';
    end if;
    if v_trip.status <> 'pending_refund' then
        raise exception 'Status Business Trip sudah berubah.';
    end if;
    if v_method not in ('cash', 'transfer', 'other') then
        raise exception 'Metode pembayaran tidak valid.';
    end if;

    v_expected := v_trip.settlement_difference;
    if p_amount is null or p_amount <= 0 or p_amount <> v_expected then
        raise exception 'Nominal pengembalian harus sama dengan sisa settlement.';
    end if;

    insert into public.business_trip_settlements (
        business_trip_id, type, amount, payment_method, account_label,
        reference_number, transaction_date, notes, processed_by
    )
    values (
        p_business_trip_id, 'refund', p_amount, v_method,
        nullif(trim(coalesce(p_account_label, '')), ''),
        nullif(trim(coalesce(p_reference_number, '')), ''),
        coalesce(p_transaction_date, v_now),
        nullif(trim(coalesce(p_notes, '')), ''),
        v_actor_id
    );

    update public.business_trips
    set
        status = 'completed',
        settlement_status = 'completed',
        settlement_completed_at = v_now,
        settlement_completed_by = v_actor_id,
        completed_at = v_now,
        completed_by = v_actor_id,
        updated_at = v_now,
        updated_by = v_actor_id
    where id = p_business_trip_id
      and status = 'pending_refund'
    returning * into v_trip;

    if not found then
        raise exception 'Pengembalian sudah dicatat.';
    end if;

    if v_trip.accommodation_request_id is not null then
        update public.accommodation_requests
        set status = 'realized', updated_at = v_now
        where id = v_trip.accommodation_request_id
          and status in ('approved', 'realization_process', 'partial_realized');
    end if;

    insert into public.business_trip_status_history (
        business_trip_id, from_status, to_status, action, notes, acted_by, acted_at
    )
    values (
        p_business_trip_id,
        'pending_refund',
        'completed',
        'REFUND_RECORDED',
        concat_ws(' | ', 'amount=' || p_amount::text, 'method=' || v_method),
        v_actor_id,
        v_now
    );

    insert into public.business_trip_status_history (
        business_trip_id, from_status, to_status, action, notes, acted_by, acted_at
    )
    values (
        p_business_trip_id,
        'pending_refund',
        'completed',
        'COMPLETED',
        'Settlement pengembalian selesai.',
        v_actor_id,
        v_now
    );

    return v_trip;
exception
    when unique_violation then
        raise exception 'Pengembalian sudah dicatat.';
end;
$$;

create or replace function public.pay_business_trip_realization_shortfall(
    p_business_trip_id uuid,
    p_amount numeric,
    p_payment_method text,
    p_transaction_date timestamptz default now(),
    p_account_label text default null,
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
    v_actor_id uuid := auth.uid();
    v_now timestamptz := now();
    v_method text := lower(trim(coalesce(p_payment_method, '')));
    v_expected numeric(14,2);
begin
    if v_actor_id is null then
        raise exception 'Sesi login tidak valid.';
    end if;
    if not public.is_admin_or_management(v_actor_id) then
        raise exception 'Anda tidak memiliki akses settlement Business Trip.';
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
        raise exception 'Pemohon tidak dapat memproses settlement pengajuannya sendiri.';
    end if;
    if v_trip.status <> 'pending_additional_payment' then
        raise exception 'Status Business Trip sudah berubah.';
    end if;
    if v_method not in ('cash', 'transfer', 'other') then
        raise exception 'Metode pembayaran tidak valid.';
    end if;

    v_expected := abs(v_trip.settlement_difference);
    if p_amount is null or p_amount <= 0 or p_amount <> v_expected then
        raise exception 'Nominal pembayaran harus sama dengan kekurangan settlement.';
    end if;

    insert into public.business_trip_settlements (
        business_trip_id, type, amount, payment_method, account_label,
        reference_number, transaction_date, notes, processed_by
    )
    values (
        p_business_trip_id, 'additional_payment', p_amount, v_method,
        nullif(trim(coalesce(p_account_label, '')), ''),
        nullif(trim(coalesce(p_reference_number, '')), ''),
        coalesce(p_transaction_date, v_now),
        nullif(trim(coalesce(p_notes, '')), ''),
        v_actor_id
    );

    update public.business_trips
    set
        status = 'completed',
        settlement_status = 'completed',
        settlement_completed_at = v_now,
        settlement_completed_by = v_actor_id,
        completed_at = v_now,
        completed_by = v_actor_id,
        updated_at = v_now,
        updated_by = v_actor_id
    where id = p_business_trip_id
      and status = 'pending_additional_payment'
    returning * into v_trip;

    if not found then
        raise exception 'Kekurangan sudah dibayar.';
    end if;

    if v_trip.accommodation_request_id is not null then
        update public.accommodation_requests
        set status = 'realized', updated_at = v_now
        where id = v_trip.accommodation_request_id
          and status in ('approved', 'realization_process', 'partial_realized');
    end if;

    insert into public.business_trip_status_history (
        business_trip_id, from_status, to_status, action, notes, acted_by, acted_at
    )
    values (
        p_business_trip_id,
        'pending_additional_payment',
        'completed',
        'ADDITIONAL_PAYMENT_RECORDED',
        concat_ws(' | ', 'amount=' || p_amount::text, 'method=' || v_method),
        v_actor_id,
        v_now
    );

    insert into public.business_trip_status_history (
        business_trip_id, from_status, to_status, action, notes, acted_by, acted_at
    )
    values (
        p_business_trip_id,
        'pending_additional_payment',
        'completed',
        'COMPLETED',
        'Settlement pembayaran kekurangan selesai.',
        v_actor_id,
        v_now
    );

    return v_trip;
exception
    when unique_violation then
        raise exception 'Kekurangan sudah dibayar.';
end;
$$;

drop policy if exists "Requesters can manage realizations during valid statuses" on public.business_trip_agenda_realizations;
create policy "Requesters can manage realizations during valid statuses"
on public.business_trip_agenda_realizations
for all
to authenticated
using (
    exists (
        select 1
        from public.business_trip_agendas a
        join public.business_trips bt on bt.id = a.business_trip_id
        where a.id = agenda_id
          and bt.requester_id = auth.uid()
          and bt.status in ('in_progress', 'realization_draft', 'realization_revision_required')
    )
)
with check (
    exists (
        select 1
        from public.business_trip_agendas a
        join public.business_trips bt on bt.id = a.business_trip_id
        where a.id = agenda_id
          and bt.requester_id = auth.uid()
          and bt.status in ('in_progress', 'realization_draft', 'realization_revision_required')
    )
);

drop policy if exists "Requesters can create own agenda photos during realization" on public.business_trip_agenda_photos;
create policy "Requesters can create own agenda photos during realization"
on public.business_trip_agenda_photos
for insert
to authenticated
with check (
    uploaded_by = auth.uid()
    and exists (
        select 1
        from public.business_trips bt
        where bt.id = business_trip_id
          and bt.requester_id = auth.uid()
          and bt.status in ('in_progress', 'realization_draft', 'realization_revision_required')
    )
);

drop policy if exists "Requesters can delete own agenda photos during realization" on public.business_trip_agenda_photos;
create policy "Requesters can delete own agenda photos during realization"
on public.business_trip_agenda_photos
for delete
to authenticated
using (
    uploaded_by = auth.uid()
    and exists (
        select 1
        from public.business_trips bt
        where bt.id = business_trip_id
          and bt.requester_id = auth.uid()
          and bt.status in ('in_progress', 'realization_draft', 'realization_revision_required')
    )
);

grant execute on function public.calculate_business_trip_settlement(uuid) to authenticated;
grant execute on function public.request_business_trip_realization_revision(uuid, text) to authenticated;
grant execute on function public.verify_business_trip_realization(uuid) to authenticated;
grant execute on function public.record_business_trip_advance_refund(uuid, numeric, text, timestamptz, text, text, text) to authenticated;
grant execute on function public.pay_business_trip_realization_shortfall(uuid, numeric, text, timestamptz, text, text, text) to authenticated;

comment on table public.business_trip_settlements is 'MVP settlement record for Business Trip refund/additional payment. No general ledger module was available in this codebase audit.';
comment on column public.business_trip_agenda_realizations.realized_amount is 'Actual realized cost per agenda, summed by backend for settlement.';

notify pgrst, 'reload schema';
