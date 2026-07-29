create or replace function public.is_business_trip_requester(p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.profiles p
        where p.id = p_user_id
          and p.role in ('technician', 'admin', 'management')
    );
$$;

create table if not exists public.business_trip_number_sequences (
    sequence_date date primary key,
    last_sequence integer not null default 0 check (last_sequence >= 0),
    updated_at timestamptz not null default now()
);

create or replace function public.generate_business_trip_no(p_created_at timestamptz default now())
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_date date := (p_created_at at time zone 'Asia/Jakarta')::date;
    v_sequence integer;
begin
    insert into public.business_trip_number_sequences (sequence_date, last_sequence)
    values (v_date, 1)
    on conflict (sequence_date)
    do update set
        last_sequence = public.business_trip_number_sequences.last_sequence + 1,
        updated_at = now()
    returning last_sequence into v_sequence;


    return 'BT-' || to_char(v_date, 'YYMMDD') || lpad(v_sequence::text, 2, '0');
end;
$$;

create table if not exists public.business_trips (
    id uuid primary key default gen_random_uuid(),
    business_trip_no text not null default public.generate_business_trip_no(now()),
    requester_id uuid not null references public.profiles(id) on delete cascade,
    date_mode text not null default 'single' check (date_mode in ('single', 'range')),
    trip_date date,
    trip_start_date date,
    trip_end_date date,
    title text,
    project_id uuid references public.master_projects(id) on delete set null,
    initiator_type text not null default 'self' check (initiator_type in ('self', 'management', 'other')),
    initiator_name text,
    status text not null default 'draft' check (
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
            'completed',
            'cancelled'
        )
    ),
    rejection_reason text,
    requested_amount numeric(14,2) not null default 0 check (requested_amount >= 0),
    accommodation_request_id uuid,
    submitted_at timestamptz,
    approved_at timestamptz,
    approved_by uuid references public.profiles(id) on delete set null,
    rejected_at timestamptz,
    rejected_by uuid references public.profiles(id) on delete set null,
    advance_disbursed_at timestamptz,
    started_at timestamptz,
    realization_submitted_at timestamptz,
    realization_verified_at timestamptz,
    realization_verified_by uuid references public.profiles(id) on delete set null,
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles(id) on delete set null,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles(id) on delete set null,
    constraint business_trips_no_unique unique (business_trip_no),
    constraint business_trips_single_date_check check (
        (date_mode = 'single' and (trip_start_date is null or trip_end_date is null))
        or (date_mode = 'range' and (trip_date is null or trip_start_date <= trip_end_date))
    ),
    constraint business_trips_submitted_required_fields check (
        status = 'draft'
        or (
            coalesce(trim(title), '') <> ''
            and project_id is not null
            and coalesce(trim(initiator_name), '') <> ''
            and (
                (date_mode = 'single' and trip_date is not null)
                or (date_mode = 'range' and trip_start_date is not null and trip_end_date is not null)
            )
        )
    )
);

do $$
begin
    if exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = 'accommodation_requests'
    ) then
        alter table public.business_trips
        add constraint business_trips_accommodation_request_id_fkey
        foreign key (accommodation_request_id)
        references public.accommodation_requests(id)
        on delete set null;
    end if;
exception
    when duplicate_object then null;
end;
$$;

alter table public.accommodation_requests
add column if not exists business_trip_id uuid references public.business_trips(id) on delete set null;

create unique index if not exists accommodation_requests_business_trip_id_unique_idx
on public.accommodation_requests (business_trip_id)
where business_trip_id is not null;

create table if not exists public.business_trip_agendas (
    id uuid primary key default gen_random_uuid(),
    business_trip_id uuid not null references public.business_trips(id) on delete cascade,
    sequence_no integer not null check (sequence_no > 0),
    title text not null,
    objective text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint business_trip_agendas_sequence_unique unique (business_trip_id, sequence_no)
);

create table if not exists public.business_trip_agenda_realizations (
    id uuid primary key default gen_random_uuid(),
    agenda_id uuid not null references public.business_trip_agendas(id) on delete cascade,
    result text,
    submitted_at timestamptz,
    verified_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint business_trip_agenda_realizations_agenda_unique unique (agenda_id)
);

create table if not exists public.business_trip_agenda_photos (
    id uuid primary key default gen_random_uuid(),
    business_trip_id uuid not null references public.business_trips(id) on delete cascade,
    agenda_id uuid not null references public.business_trip_agendas(id) on delete cascade,
    storage_path text not null unique,
    original_file_name text,
    file_name text,
    mime_type text,
    file_size bigint check (file_size is null or file_size > 0),
    uploaded_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now()
);

create or replace function public.validate_business_trip_agenda_photo()
returns trigger
language plpgsql
as $$
begin
    if not exists (
        select 1
        from public.business_trip_agendas a
        where a.id = new.agenda_id
          and a.business_trip_id = new.business_trip_id
    ) then
        raise exception 'Foto agenda harus terkait agenda dan Business Trip yang sama.';
    end if;
    return new;
end;
$$;

drop trigger if exists business_trip_agenda_photos_validate on public.business_trip_agenda_photos;
create trigger business_trip_agenda_photos_validate
before insert or update on public.business_trip_agenda_photos
for each row execute function public.validate_business_trip_agenda_photo();

create table if not exists public.business_trip_status_history (
    id uuid primary key default gen_random_uuid(),
    business_trip_id uuid not null references public.business_trips(id) on delete cascade,
    from_status text,
    to_status text not null,
    action text not null,
    notes text,
    acted_by uuid references public.profiles(id) on delete set null,
    acted_at timestamptz not null default now()
);

create index if not exists business_trips_requester_id_idx on public.business_trips (requester_id);
create index if not exists business_trips_project_id_idx on public.business_trips (project_id);
create index if not exists business_trips_status_idx on public.business_trips (status);
create index if not exists business_trips_created_at_idx on public.business_trips (created_at desc);
create index if not exists business_trips_trip_date_idx on public.business_trips (trip_date, trip_start_date, trip_end_date);
create index if not exists business_trip_agendas_business_trip_id_idx on public.business_trip_agendas (business_trip_id);
create index if not exists business_trip_agenda_realizations_agenda_id_idx on public.business_trip_agenda_realizations (agenda_id);
create index if not exists business_trip_agenda_photos_business_trip_id_idx on public.business_trip_agenda_photos (business_trip_id);
create index if not exists business_trip_agenda_photos_agenda_id_idx on public.business_trip_agenda_photos (agenda_id);
create index if not exists business_trip_status_history_business_trip_id_idx on public.business_trip_status_history (business_trip_id);

create or replace function public.can_access_business_trip(
    p_business_trip_id uuid,
    p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
as $$
    select
        public.is_admin_or_management(p_user_id)
        or exists (
            select 1
            from public.business_trips bt
            where bt.id = p_business_trip_id
              and bt.requester_id = p_user_id
        );
$$;

create or replace function public.can_edit_business_trip_draft(
    p_business_trip_id uuid,
    p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.business_trips bt
        where bt.id = p_business_trip_id
          and bt.requester_id = p_user_id
          and bt.status in ('draft', 'rejected')
    );
$$;

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
        ('advance_disbursed', 'in_progress'),
        ('in_progress', 'realization_draft'),
        ('in_progress', 'realization_submitted'),
        ('realization_draft', 'realization_submitted'),
        ('realization_submitted', 'completed')
    );
$$;

create or replace function public.transition_business_trip_status(
    p_business_trip_id uuid,
    p_to_status text,
    p_action text,
    p_notes text default null,
    p_rejection_reason text default null
)
returns public.business_trips
language plpgsql
security definer
set search_path = public
as $$
declare
    v_trip public.business_trips%rowtype;
    v_actor_id uuid := auth.uid();
    v_from_status text;
    v_now timestamptz := now();
begin
    select *
    into v_trip
    from public.business_trips
    where id = p_business_trip_id
    for update;

    if not found then
        raise exception 'Business Trip tidak ditemukan.';
    end if;

    if not public.is_valid_business_trip_transition(v_trip.status, p_to_status) then
        raise exception 'Transisi status tidak valid: % -> %', v_trip.status, p_to_status;
    end if;
    v_from_status := v_trip.status;

    if p_to_status in ('approved', 'rejected', 'advance_disbursed', 'completed') then
        if not public.is_admin_or_management(v_actor_id) then
            raise exception 'Anda tidak memiliki akses untuk aksi ini.';
        end if;
        if v_trip.requester_id = v_actor_id then
            raise exception 'Requester tidak dapat approve atau memproses pengajuannya sendiri.';
        end if;
    elsif v_trip.requester_id <> v_actor_id then
        raise exception 'Hanya requester yang dapat melakukan aksi ini.';
    end if;

    update public.business_trips
    set
        status = p_to_status,
        submitted_at = case when p_to_status in ('submitted', 'pending_approval') then v_now else submitted_at end,
        approved_at = case when p_to_status = 'approved' then v_now else approved_at end,
        approved_by = case when p_to_status = 'approved' then v_actor_id else approved_by end,
        rejected_at = case when p_to_status = 'rejected' then v_now else rejected_at end,
        rejected_by = case when p_to_status = 'rejected' then v_actor_id else rejected_by end,
        rejection_reason = case
            when p_to_status = 'rejected' then p_rejection_reason
            when p_to_status in ('submitted', 'pending_approval', 'approved') then null
            else rejection_reason
        end,
        advance_disbursed_at = case when p_to_status = 'advance_disbursed' then v_now else advance_disbursed_at end,
        started_at = case when p_to_status = 'in_progress' then v_now else started_at end,
        realization_submitted_at = case when p_to_status = 'realization_submitted' then v_now else realization_submitted_at end,
        realization_verified_at = case when p_to_status = 'completed' then v_now else realization_verified_at end,
        realization_verified_by = case when p_to_status = 'completed' then v_actor_id else realization_verified_by end,
        completed_at = case when p_to_status = 'completed' then v_now else completed_at end,
        updated_by = v_actor_id
    where id = p_business_trip_id
    returning * into v_trip;

    insert into public.business_trip_status_history (
        business_trip_id,
        from_status,
        to_status,
        action,
        notes,
        acted_by
    )
    values (
        p_business_trip_id,
        v_from_status,
        p_to_status,
        p_action,
        p_notes,
        v_actor_id
    );

    return v_trip;
end;
$$;

create or replace function public.business_trip_set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    new.updated_by = coalesce(new.updated_by, auth.uid());
    return new;
end;
$$;

drop trigger if exists business_trips_touch_updated_at on public.business_trips;
create trigger business_trips_touch_updated_at
before update on public.business_trips
for each row execute function public.business_trip_set_updated_at();

drop trigger if exists business_trip_agendas_touch_updated_at on public.business_trip_agendas;
create trigger business_trip_agendas_touch_updated_at
before update on public.business_trip_agendas
for each row execute function public.touch_updated_at();

drop trigger if exists business_trip_agenda_realizations_touch_updated_at on public.business_trip_agenda_realizations;
create trigger business_trip_agenda_realizations_touch_updated_at
before update on public.business_trip_agenda_realizations
for each row execute function public.touch_updated_at();

grant execute on function public.is_business_trip_requester(uuid) to authenticated;
grant execute on function public.generate_business_trip_no(timestamptz) to authenticated;
grant execute on function public.can_access_business_trip(uuid, uuid) to authenticated;
grant execute on function public.can_edit_business_trip_draft(uuid, uuid) to authenticated;
grant execute on function public.is_valid_business_trip_transition(text, text) to authenticated;
grant execute on function public.transition_business_trip_status(uuid, text, text, text, text) to authenticated;

alter table public.business_trips enable row level security;
alter table public.business_trip_agendas enable row level security;
alter table public.business_trip_agenda_realizations enable row level security;
alter table public.business_trip_agenda_photos enable row level security;
alter table public.business_trip_status_history enable row level security;

drop policy if exists "Business trips can be read by owners and admins" on public.business_trips;
create policy "Business trips can be read by owners and admins"
on public.business_trips
for select
to authenticated
using (public.can_access_business_trip(id, auth.uid()));

drop policy if exists "Allowed users can create own business trip drafts" on public.business_trips;
create policy "Allowed users can create own business trip drafts"
on public.business_trips
for insert
to authenticated
with check (
    requester_id = auth.uid()
    and status = 'draft'
    and requested_amount >= 0
    and public.is_business_trip_requester(auth.uid())
);

drop policy if exists "Requesters can update own editable business trips" on public.business_trips;
create policy "Requesters can update own editable business trips"
on public.business_trips
for update
to authenticated
using (public.can_edit_business_trip_draft(id, auth.uid()))
with check (
    requester_id = auth.uid()
    and status in ('draft', 'rejected')
    and requested_amount >= 0
);

drop policy if exists "Admins and management can manage business trips" on public.business_trips;
-- Admin/management status changes are intentionally handled by SECURITY DEFINER RPCs, not direct table updates.

drop policy if exists "Business trip agendas can be read by trip access" on public.business_trip_agendas;
create policy "Business trip agendas can be read by trip access"
on public.business_trip_agendas
for select
to authenticated
using (public.can_access_business_trip(business_trip_id, auth.uid()));

drop policy if exists "Requesters can manage agendas on editable trips" on public.business_trip_agendas;
create policy "Requesters can manage agendas on editable trips"
on public.business_trip_agendas
for all
to authenticated
using (public.can_edit_business_trip_draft(business_trip_id, auth.uid()))
with check (public.can_edit_business_trip_draft(business_trip_id, auth.uid()));

drop policy if exists "Admins and management can manage business trip agendas" on public.business_trip_agendas;
create policy "Admins and management can manage business trip agendas"
on public.business_trip_agendas
for all
to authenticated
using (public.is_admin_or_management(auth.uid()))
with check (public.is_admin_or_management(auth.uid()));

drop policy if exists "Agenda realizations can be read by trip access" on public.business_trip_agenda_realizations;
create policy "Agenda realizations can be read by trip access"
on public.business_trip_agenda_realizations
for select
to authenticated
using (
    exists (
        select 1
        from public.business_trip_agendas a
        where a.id = agenda_id
          and public.can_access_business_trip(a.business_trip_id, auth.uid())
    )
);

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
          and bt.status in ('in_progress', 'realization_draft')
    )
)
with check (
    exists (
        select 1
        from public.business_trip_agendas a
        join public.business_trips bt on bt.id = a.business_trip_id
        where a.id = agenda_id
          and bt.requester_id = auth.uid()
          and bt.status in ('in_progress', 'realization_draft')
    )
);

drop policy if exists "Agenda photos can be read by trip access" on public.business_trip_agenda_photos;
create policy "Agenda photos can be read by trip access"
on public.business_trip_agenda_photos
for select
to authenticated
using (public.can_access_business_trip(business_trip_id, auth.uid()));

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
          and bt.status in ('in_progress', 'realization_draft')
    )
);

drop policy if exists "Business trip history can be read by trip access" on public.business_trip_status_history;
create policy "Business trip history can be read by trip access"
on public.business_trip_status_history
for select
to authenticated
using (public.can_access_business_trip(business_trip_id, auth.uid()));

drop policy if exists "Admins and management can insert business trip history" on public.business_trip_status_history;
create policy "Admins and management can insert business trip history"
on public.business_trip_status_history
for insert
to authenticated
with check (public.is_admin_or_management(auth.uid()));

insert into storage.buckets (id, name, public)
values ('business-trip-evidence', 'business-trip-evidence', false)
on conflict (id) do update set public = false;

drop policy if exists "Business trip photo read access" on storage.objects;
create policy "Business trip photo read access"
on storage.objects
for select
to authenticated
using (bucket_id = 'business-trip-evidence');

drop policy if exists "Business trip photo upload by authenticated users" on storage.objects;
create policy "Business trip photo upload by authenticated users"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'business-trip-evidence'
    and name like 'business-trips/%/agendas/%'
);

comment on table public.business_trips is 'Business Trip main requests. Integrated with Supabase service layer.';
comment on column public.business_trips.requested_amount is 'Accommodation requested amount from Business Trip UI. Zero means no accommodation request.';
comment on column public.accommodation_requests.business_trip_id is 'Optional link when an accommodation request is generated from Business Trip.';
comment on table public.business_trip_agenda_photos is 'Metadata only. File path strategy: business-trips/{business_trip_id}/agendas/{agenda_id}/{uuid}.{ext}.';

notify pgrst, 'reload schema';
