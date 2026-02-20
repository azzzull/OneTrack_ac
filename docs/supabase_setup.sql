-- Master data for admin-managed customers and projects
create table if not exists public.master_customers (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    phone text not null,
    address text not null,
    created_at timestamptz not null default now()
);

create table if not exists public.master_projects (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid not null references public.master_customers(id) on delete cascade,
    project_name text not null,
    location text not null,
    phone text not null,
    address text not null,
    created_at timestamptz not null default now()
);

create index if not exists master_projects_customer_id_idx
    on public.master_projects(customer_id);

-- Requests transaction table (used by dashboard, requests list, and new job form)
create table if not exists public.requests (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed')),
    location text,
    customer_name text,
    customer_phone text,
    address text,
    ac_brand text,
    ac_type text,
    ac_capacity_pk text,
    room_location text,
    serial_number text,
    serial_scan_photo_url text,
    trouble_description text,
    replaced_parts text,
    reconditioned_parts text,
    before_photo_url text,
    progress_photo_url text,
    after_photo_url text,
    created_by uuid references auth.users(id),
    customer_id uuid references public.master_customers(id),
    project_id uuid references public.master_projects(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists requests_status_idx
    on public.requests(status);

create index if not exists requests_created_at_idx
    on public.requests(created_at desc);

-- Extend existing requests (safe for existing databases)
alter table public.requests
add column if not exists customer_id uuid references public.master_customers(id),
add column if not exists project_id uuid references public.master_projects(id);

create index if not exists requests_customer_id_idx
    on public.requests(customer_id);

create index if not exists requests_project_id_idx
    on public.requests(project_id);

-- Optional: baseline RLS examples (adjust per your auth model)
alter table public.master_customers enable row level security;
alter table public.master_projects enable row level security;

drop policy if exists "admin can read customers" on public.master_customers;
create policy "admin can read customers"
on public.master_customers for select
to authenticated
using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
));

drop policy if exists "admin can write customers" on public.master_customers;
create policy "admin can write customers"
on public.master_customers for all
to authenticated
using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
))
with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
));

drop policy if exists "admin can read projects" on public.master_projects;
create policy "admin can read projects"
on public.master_projects for select
to authenticated
using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
));

drop policy if exists "admin can write projects" on public.master_projects;
create policy "admin can write projects"
on public.master_projects for all
to authenticated
using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
))
with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
));
