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

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create table if not exists public.reimbursements (
    id uuid primary key default gen_random_uuid(),
    requester_id uuid not null references public.profiles(id) on delete cascade,
    transaction_date date not null,
    claim_amount numeric(14,2) not null check (claim_amount > 0),
    approved_amount numeric(14,2) check (approved_amount is null or approved_amount > 0),
    description text not null,
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    rejection_reason text,
    approval_note text,
    approved_by uuid references public.profiles(id) on delete set null,
    approved_at timestamptz,
    transfer_proof_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.reimbursement_attachments (
    id uuid primary key default gen_random_uuid(),
    reimbursement_id uuid not null references public.reimbursements(id) on delete cascade,
    file_url text not null,
    file_type text,
    uploaded_by uuid not null references public.profiles(id) on delete cascade,
    created_at timestamptz not null default now()
);

create index if not exists reimbursements_requester_id_idx
on public.reimbursements (requester_id);

create index if not exists reimbursements_status_idx
on public.reimbursements (status);

create index if not exists reimbursements_transaction_date_idx
on public.reimbursements (transaction_date);

create index if not exists reimbursement_attachments_reimbursement_id_idx
on public.reimbursement_attachments (reimbursement_id);

create or replace function public.is_reimbursement_requester(p_user_id uuid default auth.uid())
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

create or replace function public.can_access_reimbursement(
    p_reimbursement_id uuid,
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
            from public.reimbursements r
            where r.id = p_reimbursement_id
              and r.requester_id = p_user_id
        );
$$;

grant execute on function public.is_reimbursement_requester(uuid) to authenticated;
grant execute on function public.can_access_reimbursement(uuid, uuid) to authenticated;
grant execute on function public.is_admin_or_management(uuid) to authenticated;

create or replace function public.validate_reimbursement_update()
returns trigger
language plpgsql
as $$
begin
    if new.requester_id <> old.requester_id
        or new.transaction_date <> old.transaction_date
        or new.claim_amount <> old.claim_amount
        or new.description <> old.description
        or new.created_at <> old.created_at then
        raise exception 'Data pengajuan reimburse tidak boleh diubah setelah submit.';
    end if;

    if new.status = 'approved' then
        if new.approved_amount is null or new.approved_amount <= 0 then
            raise exception 'Nominal disetujui wajib lebih dari 0.';
        end if;
        if coalesce(new.transfer_proof_url, '') = '' then
            raise exception 'Bukti transfer wajib diupload.';
        end if;
        if new.approved_by is null or new.approved_at is null then
            raise exception 'Data approval tidak lengkap.';
        end if;
    elsif new.status = 'rejected' then
        if coalesce(new.rejection_reason, '') = '' then
            raise exception 'Alasan penolakan wajib diisi.';
        end if;
        if new.approved_by is null or new.approved_at is null then
            raise exception 'Data penolakan tidak lengkap.';
        end if;
    elsif new.status <> 'pending' then
        raise exception 'Status reimburse tidak valid.';
    end if;

    return new;
end;
$$;

drop trigger if exists reimbursements_validate_update on public.reimbursements;
create trigger reimbursements_validate_update
before update on public.reimbursements
for each row execute function public.validate_reimbursement_update();

drop trigger if exists reimbursements_touch_updated_at on public.reimbursements;
create trigger reimbursements_touch_updated_at
before update on public.reimbursements
for each row execute function public.touch_updated_at();

alter table public.reimbursements enable row level security;
alter table public.reimbursement_attachments enable row level security;

drop policy if exists "Reimbursements can be read by owners and admins" on public.reimbursements;
create policy "Reimbursements can be read by owners and admins"
on public.reimbursements
for select
to authenticated
using (public.can_access_reimbursement(id, auth.uid()));

drop policy if exists "Allowed users can create own reimbursements" on public.reimbursements;
create policy "Allowed users can create own reimbursements"
on public.reimbursements
for insert
to authenticated
with check (
    requester_id = auth.uid()
    and status = 'pending'
    and approved_amount is null
    and approved_by is null
    and approved_at is null
    and transfer_proof_url is null
    and public.is_reimbursement_requester(auth.uid())
);

drop policy if exists "Admins and management can review reimbursements" on public.reimbursements;
create policy "Admins and management can review reimbursements"
on public.reimbursements
for update
to authenticated
using (public.is_admin_or_management(auth.uid()))
with check (public.is_admin_or_management(auth.uid()));

drop policy if exists "Reimbursement attachments can be read by reimbursement access" on public.reimbursement_attachments;
create policy "Reimbursement attachments can be read by reimbursement access"
on public.reimbursement_attachments
for select
to authenticated
using (public.can_access_reimbursement(reimbursement_id, auth.uid()));

drop policy if exists "Requesters can upload own reimbursement attachments" on public.reimbursement_attachments;
create policy "Requesters can upload own reimbursement attachments"
on public.reimbursement_attachments
for insert
to authenticated
with check (
    uploaded_by = auth.uid()
    and exists (
        select 1
        from public.reimbursements r
        where r.id = reimbursement_id
          and r.requester_id = auth.uid()
          and r.status = 'pending'
    )
);

drop policy if exists "Admins and management can manage reimbursement attachments" on public.reimbursement_attachments;
create policy "Admins and management can manage reimbursement attachments"
on public.reimbursement_attachments
for all
to authenticated
using (public.is_admin_or_management(auth.uid()))
with check (public.is_admin_or_management(auth.uid()));

insert into storage.buckets (id, name, public)
values ('reimbursements', 'reimbursements', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Reimbursement file read access" on storage.objects;
create policy "Reimbursement file read access"
on storage.objects
for select
to authenticated
using (bucket_id = 'reimbursements');

drop policy if exists "Reimbursement receipt upload by allowed users" on storage.objects;
create policy "Reimbursement receipt upload by allowed users"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'reimbursements'
    and name like 'reimbursements/%/receipts/%'
    and public.is_reimbursement_requester(auth.uid())
);

drop policy if exists "Reimbursement transfer proof upload by reviewers" on storage.objects;
create policy "Reimbursement transfer proof upload by reviewers"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'reimbursements'
    and name like 'reimbursements/%/transfer-proof/%'
    and public.is_admin_or_management(auth.uid())
);

drop policy if exists "Reimbursement file update by allowed users" on storage.objects;
create policy "Reimbursement file update by allowed users"
on storage.objects
for update
to authenticated
using (
    bucket_id = 'reimbursements'
    and (
        public.is_reimbursement_requester(auth.uid())
        or public.is_admin_or_management(auth.uid())
    )
)
with check (
    bucket_id = 'reimbursements'
    and (
        public.is_reimbursement_requester(auth.uid())
        or public.is_admin_or_management(auth.uid())
    )
);

notify pgrst, 'reload schema';
