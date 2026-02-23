-- Master data for admin-managed customer + project info (single source)
create table if not exists public.master_customers (
    id uuid primary key default gen_random_uuid(),
    name text,
    pic_name text not null,
    project_name text not null,
    location text not null,
    phone text not null,
    email text,
    user_id uuid references public.profiles(id) on delete set null,
    address text not null,
    created_at timestamptz not null default now()
);

-- Backward-compatible migration for existing schema/data
alter table public.master_customers
add column if not exists name text,
add column if not exists pic_name text,
add column if not exists project_name text,
add column if not exists location text,
add column if not exists email text,
add column if not exists user_id uuid references public.profiles(id) on delete set null;

update public.master_customers
set pic_name = coalesce(pic_name, name)
where pic_name is null;

update public.master_customers
set name = coalesce(name, pic_name)
where name is null;

update public.master_customers
set project_name = coalesce(project_name, name)
where project_name is null;

update public.master_customers
set location = coalesce(location, '')
where location is null;

-- Optional legacy table: keep only if you still separate project records
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

-- Additional master tables for Master Data page
create table if not exists public.master_roles (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    created_at timestamptz not null default now()
);

-- Ensure default roles exist
insert into public.master_roles (name)
values ('admin'), ('customer'), ('technician')
on conflict (name) do nothing;

-- Optional table (currently not used in UI)
create table if not exists public.master_floors (
    id uuid primary key default gen_random_uuid(),
    location_name text not null,
    floor_name text not null,
    created_at timestamptz not null default now()
);

create table if not exists public.master_ac_brands (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    created_at timestamptz not null default now()
);

create table if not exists public.master_ac_types (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    created_at timestamptz not null default now()
);

create table if not exists public.master_ac_pks (
    id uuid primary key default gen_random_uuid(),
    label text not null unique,
    created_at timestamptz not null default now()
);

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

-- Profiles extension for user master data (first name, last name, phone, email)
alter table public.profiles
add column if not exists first_name text,
add column if not exists last_name text,
add column if not exists phone text,
add column if not exists email text,
add column if not exists role text default 'customer',
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();

-- Keep full_name in sync if older schema still has full_name column
do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'profiles'
          and column_name = 'full_name'
    ) then
        execute $q$
            update public.profiles
            set first_name = split_part(coalesce(full_name, ''), ' ', 1)
            where first_name is null and coalesce(full_name, '') <> ''
        $q$;

        execute $q$
            update public.profiles
            set last_name = nullif(trim(replace(coalesce(full_name, ''), split_part(coalesce(full_name, ''), ' ', 1), '')), '')
            where last_name is null and coalesce(full_name, '') <> ''
        $q$;
    end if;
end $$;

-- Backfill profiles from auth.users (for existing auth accounts, including current admin)
insert into public.profiles (id, email, first_name, last_name, phone, role, created_at)
select
    u.id,
    u.email,
    coalesce(u.raw_user_meta_data->>'first_name', ''),
    coalesce(u.raw_user_meta_data->>'last_name', ''),
    coalesce(u.raw_user_meta_data->>'phone', ''),
    coalesce(u.raw_user_meta_data->>'role', 'customer'),
    coalesce(u.created_at, now())
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- Auto-sync new auth users into profiles
create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, email, first_name, last_name, phone, role, created_at)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'first_name', ''),
        coalesce(new.raw_user_meta_data->>'last_name', ''),
        coalesce(new.raw_user_meta_data->>'phone', ''),
        coalesce(new.raw_user_meta_data->>'role', 'customer'),
        coalesce(new.created_at, now())
    )
    on conflict (id) do update
    set
        email = excluded.email,
        first_name = coalesce(nullif(excluded.first_name, ''), public.profiles.first_name),
        last_name = coalesce(nullif(excluded.last_name, ''), public.profiles.last_name),
        phone = coalesce(nullif(excluded.phone, ''), public.profiles.phone),
        role = coalesce(excluded.role, public.profiles.role);

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_auth_user_created();

-- Enforce role from master_roles table
do $$
begin
    if not exists (
        select 1
        from information_schema.table_constraints
        where constraint_name = 'profiles_role_master_roles_fkey'
          and table_schema = 'public'
          and table_name = 'profiles'
    ) then
        alter table public.profiles
        add constraint profiles_role_master_roles_fkey
        foreign key (role) references public.master_roles(name);
    end if;
end $$;

-- Optional: baseline RLS examples (adjust per your auth model)
alter table public.master_customers enable row level security;
alter table public.master_projects enable row level security;
alter table public.master_roles enable row level security;
alter table public.master_floors enable row level security;
alter table public.master_ac_brands enable row level security;
alter table public.master_ac_types enable row level security;
alter table public.master_ac_pks enable row level security;
alter table public.requests enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "admin can read profiles" on public.profiles;
create policy "admin can read profiles"
on public.profiles for select
to authenticated
using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
));

drop policy if exists "admin can write profiles" on public.profiles;
create policy "admin can write profiles"
on public.profiles for all
to authenticated
using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
))
with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
));

drop policy if exists "user can read own profile" on public.profiles;
create policy "user can read own profile"
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "user can update own profile" on public.profiles;
create policy "user can update own profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

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

drop policy if exists "admin can read roles" on public.master_roles;
create policy "admin can read roles"
on public.master_roles for select
to authenticated
using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
));

drop policy if exists "admin can write roles" on public.master_roles;
create policy "admin can write roles"
on public.master_roles for all
to authenticated
using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
))
with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
));

drop policy if exists "admin can read floors" on public.master_floors;
create policy "admin can read floors"
on public.master_floors for select
to authenticated
using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
));

drop policy if exists "admin can write floors" on public.master_floors;
create policy "admin can write floors"
on public.master_floors for all
to authenticated
using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
))
with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
));

drop policy if exists "admin can read ac brands" on public.master_ac_brands;
create policy "admin can read ac brands"
on public.master_ac_brands for select
to authenticated
using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
));

drop policy if exists "admin can write ac brands" on public.master_ac_brands;
create policy "admin can write ac brands"
on public.master_ac_brands for all
to authenticated
using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
))
with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
));

drop policy if exists "admin can read ac types" on public.master_ac_types;
create policy "admin can read ac types"
on public.master_ac_types for select
to authenticated
using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
));

drop policy if exists "admin can write ac types" on public.master_ac_types;
create policy "admin can write ac types"
on public.master_ac_types for all
to authenticated
using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
))
with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
));

drop policy if exists "admin can read ac pks" on public.master_ac_pks;
create policy "admin can read ac pks"
on public.master_ac_pks for select
to authenticated
using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
));

drop policy if exists "admin can write ac pks" on public.master_ac_pks;
create policy "admin can write ac pks"
on public.master_ac_pks for all
to authenticated
using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
))
with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
));

drop policy if exists "admin can read requests" on public.requests;
create policy "admin can read requests"
on public.requests for select
to authenticated
using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
));

drop policy if exists "admin can write requests" on public.requests;
create policy "admin can write requests"
on public.requests for all
to authenticated
using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
))
with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
));

-- ============================================================
-- RLS recursion fix:
-- Avoid querying public.profiles directly inside profile policy.
-- Use SECURITY DEFINER helper that bypasses RLS safely.
-- ============================================================

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role = 'admin'
    );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Recreate profiles policies without recursive self-query
drop policy if exists "admin can read profiles" on public.profiles;
drop policy if exists "admin can write profiles" on public.profiles;
drop policy if exists "user can read own profile" on public.profiles;
drop policy if exists "user can update own profile" on public.profiles;
drop policy if exists "profiles read own or admin" on public.profiles;
drop policy if exists "profiles update own or admin" on public.profiles;
drop policy if exists "profiles insert admin" on public.profiles;
drop policy if exists "profiles delete admin" on public.profiles;

create policy "profiles read own or admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

create policy "profiles update own or admin"
on public.profiles for update
to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

create policy "profiles insert admin"
on public.profiles for insert
to authenticated
with check (public.is_admin());

create policy "profiles delete admin"
on public.profiles for delete
to authenticated
using (public.is_admin());

-- Recreate all admin policies to use helper function (non-recursive)
drop policy if exists "admin can read customers" on public.master_customers;
drop policy if exists "admin can write customers" on public.master_customers;
create policy "admin can read customers"
on public.master_customers for select
to authenticated
using (public.is_admin());
create policy "admin can write customers"
on public.master_customers for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin can read projects" on public.master_projects;
drop policy if exists "admin can write projects" on public.master_projects;
create policy "admin can read projects"
on public.master_projects for select
to authenticated
using (public.is_admin());
create policy "admin can write projects"
on public.master_projects for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin can read roles" on public.master_roles;
drop policy if exists "admin can write roles" on public.master_roles;
create policy "admin can read roles"
on public.master_roles for select
to authenticated
using (public.is_admin());
create policy "admin can write roles"
on public.master_roles for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin can read floors" on public.master_floors;
drop policy if exists "admin can write floors" on public.master_floors;
create policy "admin can read floors"
on public.master_floors for select
to authenticated
using (public.is_admin());
create policy "admin can write floors"
on public.master_floors for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin can read ac brands" on public.master_ac_brands;
drop policy if exists "admin can write ac brands" on public.master_ac_brands;
create policy "admin can read ac brands"
on public.master_ac_brands for select
to authenticated
using (public.is_admin());
create policy "admin can write ac brands"
on public.master_ac_brands for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin can read ac types" on public.master_ac_types;
drop policy if exists "admin can write ac types" on public.master_ac_types;
create policy "admin can read ac types"
on public.master_ac_types for select
to authenticated
using (public.is_admin());
create policy "admin can write ac types"
on public.master_ac_types for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin can read ac pks" on public.master_ac_pks;
drop policy if exists "admin can write ac pks" on public.master_ac_pks;
create policy "admin can read ac pks"
on public.master_ac_pks for select
to authenticated
using (public.is_admin());
create policy "admin can write ac pks"
on public.master_ac_pks for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin can read requests" on public.requests;
drop policy if exists "admin can write requests" on public.requests;
create policy "admin can read requests"
on public.requests for select
to authenticated
using (public.is_admin());
create policy "admin can write requests"
on public.requests for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
