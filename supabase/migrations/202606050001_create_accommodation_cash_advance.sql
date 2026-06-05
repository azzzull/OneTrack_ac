insert into public.master_roles (name)
values ('management')
on conflict (name) do nothing;

create or replace function public.is_management(p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.profiles p
        where p.id = p_user_id
          and p.role = 'management'
    );
$$;

create or replace function public.is_admin_or_management(p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.profiles p
        where p.id = p_user_id
          and p.role in ('admin', 'management')
    );
$$;

create or replace function public.is_internal_technician(p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.profiles p
        where p.id = p_user_id
          and p.role = 'technician'
          and p.technician_type = 'internal'
    );
$$;

create table if not exists public.accommodation_requests (
    id uuid primary key default gen_random_uuid(),
    technician_id uuid not null references public.profiles(id) on delete cascade,
    customer_id uuid references public.master_customers(id) on delete set null,
    project_id uuid references public.master_projects(id) on delete set null,
    request_title text not null,
    purpose text not null,
    job_scope text,
    requested_amount numeric(14,2) not null check (requested_amount > 0),
    approved_amount numeric(14,2) check (approved_amount is null or approved_amount > 0),
    status text not null default 'pending' check (
        status in (
            'pending',
            'approved',
            'rejected',
            'realization_process',
            'partial_realized',
            'realized'
        )
    ),
    notes text,
    transfer_proof_url text,
    reviewed_by uuid references public.profiles(id) on delete set null,
    reviewed_at timestamptz,
    rejection_reason text,
    requested_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.accommodation_realizations (
    id uuid primary key default gen_random_uuid(),
    accommodation_request_id uuid not null references public.accommodation_requests(id) on delete cascade,
    receipt_photo_url text not null,
    amount numeric(14,2) not null check (amount > 0),
    description text,
    transaction_date date not null,
    created_by uuid not null references public.profiles(id) on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists accommodation_requests_technician_id_idx
on public.accommodation_requests (technician_id);

create index if not exists accommodation_requests_status_idx
on public.accommodation_requests (status);

create index if not exists accommodation_requests_customer_id_idx
on public.accommodation_requests (customer_id);

create index if not exists accommodation_realizations_request_id_idx
on public.accommodation_realizations (accommodation_request_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists accommodation_requests_touch_updated_at on public.accommodation_requests;
create trigger accommodation_requests_touch_updated_at
before update on public.accommodation_requests
for each row execute function public.touch_updated_at();

drop trigger if exists accommodation_realizations_touch_updated_at on public.accommodation_realizations;
create trigger accommodation_realizations_touch_updated_at
before update on public.accommodation_realizations
for each row execute function public.touch_updated_at();

create or replace function public.refresh_accommodation_status(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_approved_amount numeric(14,2);
    v_total_realized numeric(14,2);
    v_current_status text;
begin
    select approved_amount, status
    into v_approved_amount, v_current_status
    from public.accommodation_requests
    where id = p_request_id;

    if v_approved_amount is null or v_current_status in ('pending', 'rejected') then
        return;
    end if;

    select coalesce(sum(amount), 0)
    into v_total_realized
    from public.accommodation_realizations
    where accommodation_request_id = p_request_id;

    if v_total_realized = 0 then
        update public.accommodation_requests
        set status = 'approved'
        where id = p_request_id;
    elsif v_total_realized < v_approved_amount then
        update public.accommodation_requests
        set status = 'partial_realized'
        where id = p_request_id;
    else
        update public.accommodation_requests
        set status = 'realized'
        where id = p_request_id;
    end if;
end;
$$;

create or replace function public.validate_accommodation_realization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_status text;
    v_approved_amount numeric(14,2);
    v_existing_total numeric(14,2);
begin
    select status, approved_amount
    into v_status, v_approved_amount
    from public.accommodation_requests
    where id = new.accommodation_request_id;

    if v_status not in ('approved', 'realization_process', 'partial_realized') then
        raise exception 'Realisasi hanya boleh dibuat untuk pengajuan yang sudah approved.';
    end if;

    if v_approved_amount is null then
        raise exception 'Approved amount belum tersedia.';
    end if;

    select coalesce(sum(amount), 0)
    into v_existing_total
    from public.accommodation_realizations
    where accommodation_request_id = new.accommodation_request_id
      and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

    if v_existing_total + new.amount > v_approved_amount then
        raise exception 'Total realisasi tidak boleh melebihi approved amount.';
    end if;

    return new;
end;
$$;

drop trigger if exists accommodation_realizations_validate on public.accommodation_realizations;
create trigger accommodation_realizations_validate
before insert or update on public.accommodation_realizations
for each row execute function public.validate_accommodation_realization();

create or replace function public.after_accommodation_realization_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_request_id uuid;
begin
    if tg_op = 'DELETE' then
        v_request_id := old.accommodation_request_id;
        perform public.refresh_accommodation_status(v_request_id);
        return old;
    end if;

    v_request_id := new.accommodation_request_id;
    perform public.refresh_accommodation_status(v_request_id);
    return new;
end;
$$;

drop trigger if exists accommodation_realizations_after_change on public.accommodation_realizations;
create trigger accommodation_realizations_after_change
after insert or update or delete on public.accommodation_realizations
for each row execute function public.after_accommodation_realization_change();

create or replace function public.can_access_accommodation_request(
    p_request_id uuid,
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
            from public.accommodation_requests ar
            join public.profiles p on p.id = p_user_id
            where ar.id = p_request_id
              and ar.technician_id = p_user_id
              and p.role = 'technician'
              and p.technician_type = 'internal'
        );
$$;

grant execute on function public.is_management(uuid) to authenticated;
grant execute on function public.is_admin_or_management(uuid) to authenticated;
grant execute on function public.is_internal_technician(uuid) to authenticated;
grant execute on function public.can_access_accommodation_request(uuid, uuid) to authenticated;
grant execute on function public.refresh_accommodation_status(uuid) to authenticated;

alter table public.accommodation_requests enable row level security;
alter table public.accommodation_realizations enable row level security;

drop policy if exists "Accommodation requests can be read by owners and admins" on public.accommodation_requests;
create policy "Accommodation requests can be read by owners and admins"
on public.accommodation_requests
for select
to authenticated
using (public.can_access_accommodation_request(id, auth.uid()));

drop policy if exists "Internal technicians can create own accommodation requests" on public.accommodation_requests;
create policy "Internal technicians can create own accommodation requests"
on public.accommodation_requests
for insert
to authenticated
with check (
    technician_id = auth.uid()
    and status = 'pending'
    and public.is_internal_technician(auth.uid())
);

drop policy if exists "Management can approve accommodation requests" on public.accommodation_requests;
create policy "Management can approve accommodation requests"
on public.accommodation_requests
for update
to authenticated
using (public.is_management(auth.uid()))
with check (public.is_management(auth.uid()));

drop policy if exists "Accommodation realizations can be read by request access" on public.accommodation_realizations;
create policy "Accommodation realizations can be read by request access"
on public.accommodation_realizations
for select
to authenticated
using (public.can_access_accommodation_request(accommodation_request_id, auth.uid()));

drop policy if exists "Internal technicians can create own accommodation realizations" on public.accommodation_realizations;
create policy "Internal technicians can create own accommodation realizations"
on public.accommodation_realizations
for insert
to authenticated
with check (
    created_by = auth.uid()
    and public.is_internal_technician(auth.uid())
    and exists (
        select 1
        from public.accommodation_requests ar
        where ar.id = accommodation_request_id
          and ar.technician_id = auth.uid()
          and ar.status in ('approved', 'realization_process', 'partial_realized')
    )
);

drop policy if exists "Management can manage accommodation realizations" on public.accommodation_realizations;
create policy "Management can manage accommodation realizations"
on public.accommodation_realizations
for all
to authenticated
using (public.is_management(auth.uid()))
with check (public.is_management(auth.uid()));

insert into storage.buckets (id, name, public)
values ('accommodation-proofs', 'accommodation-proofs', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Accommodation proof read access" on storage.objects;
create policy "Accommodation proof read access"
on storage.objects
for select
to authenticated
using (bucket_id = 'accommodation-proofs');

drop policy if exists "Accommodation transfer proof upload by management" on storage.objects;
create policy "Accommodation transfer proof upload by management"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'accommodation-proofs'
    and name like 'transfer-proofs/%'
    and public.is_management(auth.uid())
);

drop policy if exists "Accommodation receipt upload by internal technicians" on storage.objects;
create policy "Accommodation receipt upload by internal technicians"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'accommodation-proofs'
    and name like 'receipts/%'
    and public.is_internal_technician(auth.uid())
);

drop policy if exists "Accommodation proof update by owners" on storage.objects;
create policy "Accommodation proof update by owners"
on storage.objects
for update
to authenticated
using (
    bucket_id = 'accommodation-proofs'
    and (public.is_management(auth.uid()) or public.is_internal_technician(auth.uid()))
)
with check (
    bucket_id = 'accommodation-proofs'
    and (public.is_management(auth.uid()) or public.is_internal_technician(auth.uid()))
);

create or replace function public.can_access_request_job(
    p_job_id uuid,
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
            from public.requests r
            where r.id = p_job_id
              and r.created_by = p_user_id
        )
        or exists (
            select 1
            from public.requests r
            where r.id = p_job_id
              and r.technician_id = p_user_id
        )
        or exists (
            select 1
            from public.job_technicians jt
            where jt.job_id = p_job_id
              and jt.technician_id = p_user_id
        );
$$;

drop policy if exists "Admins can read requests" on public.requests;
create policy "Admins can read requests"
on public.requests
for select
to authenticated
using (public.can_access_request_job(id, auth.uid()));

drop policy if exists "Admins and request owners can update requests" on public.requests;
create policy "Admins and request owners can update requests"
on public.requests
for update
to authenticated
using (public.can_access_request_job(id, auth.uid()))
with check (public.can_access_request_job(id, auth.uid()));

drop policy if exists "Admins and request owners can delete requests" on public.requests;
create policy "Admins and request owners can delete requests"
on public.requests
for delete
to authenticated
using (
    public.is_admin_or_management(auth.uid())
    or created_by = auth.uid()
    or technician_id = auth.uid()
);
