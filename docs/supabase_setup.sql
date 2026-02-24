-- Master data for admin-managed customer + project info (single source)
create table if not exists public.master_customers (
    id uuid primary key default gen_random_uuid(),
    name text,
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
add column if not exists location text,
add column if not exists email text,
add column if not exists user_id uuid references public.profiles(id) on delete set null;

update public.master_customers
set name = coalesce(name, email, 'Customer')
where name is null;

update public.master_customers
set location = coalesce(location, '')
where location is null;

-- Project should live in master_projects (one customer can have many projects)

-- Optional legacy table: keep only if you still separate project records
create table if not exists public.master_projects (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid not null references public.master_customers(id) on delete cascade,
    project_name text not null,
    location text not null,
    pic_name text,
    phone text not null,
    address text not null,
    created_at timestamptz not null default now()
);

alter table public.master_projects
add column if not exists pic_name text;

create index if not exists master_projects_customer_id_idx
    on public.master_projects(customer_id);

-- Legacy migration: move old single project data from customer row into master_projects
do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'master_customers'
          and column_name = 'project_name'
    ) then
        insert into public.master_projects (
            customer_id,
            project_name,
            location,
            phone,
            address,
            pic_name
        )
        select
            c.id,
            c.project_name,
            c.location,
            c.phone,
            c.address,
            c.name
        from public.master_customers c
        where coalesce(c.project_name, '') <> ''
          and not exists (
                select 1
                from public.master_projects p
                where p.customer_id = c.id
                  and p.project_name = c.project_name
          );
    end if;
end $$;

alter table public.master_customers
drop column if exists project_name;

alter table public.master_customers
drop column if exists pic_name;

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
    technician_name text,
    technician_id uuid references public.profiles(id),
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
add column if not exists project_id uuid references public.master_projects(id),
add column if not exists technician_name text,
add column if not exists technician_id uuid references public.profiles(id);

create index if not exists requests_customer_id_idx
    on public.requests(customer_id);

create index if not exists requests_project_id_idx
    on public.requests(project_id);

create index if not exists requests_technician_id_idx
    on public.requests(technician_id);

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

-- Keep customer master data synchronized when profile changes
create or replace function public.sync_customer_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    next_display_name text;
    prev_display_name text;
begin
    next_display_name := trim(
        concat_ws(' ', coalesce(new.first_name, ''), coalesce(new.last_name, ''))
    );
    if next_display_name = '' then
        next_display_name := coalesce(new.email, old.email, '');
    end if;

    prev_display_name := trim(
        concat_ws(' ', coalesce(old.first_name, ''), coalesce(old.last_name, ''))
    );
    if prev_display_name = '' then
        prev_display_name := coalesce(old.email, new.email, '');
    end if;

    update public.master_customers
    set
        user_id = coalesce(user_id, new.id),
        name = next_display_name,
        email = coalesce(new.email, email)
    where user_id = new.id
       or (
            old.email is not null
            and old.email <> ''
            and lower(email) = lower(old.email)
       )
       or (
            new.email is not null
            and new.email <> ''
            and lower(email) = lower(new.email)
       );

    -- Keep project PIC synchronized for rows that still use default customer name.
    update public.master_projects mp
    set pic_name = next_display_name
    from public.master_customers c
    where mp.customer_id = c.id
      and (
            c.user_id = new.id
            or (
                new.email is not null
                and new.email <> ''
                and c.email is not null
                and lower(c.email) = lower(new.email)
            )
          )
      and (
            mp.pic_name is null
            or mp.pic_name = ''
            or mp.pic_name = prev_display_name
          );

    return new;
end;
$$;

drop trigger if exists on_profile_synced_to_customer on public.profiles;
create trigger on_profile_synced_to_customer
after update of first_name, last_name, email on public.profiles
for each row execute function public.sync_customer_from_profile();

-- One-time backfill to align existing customer rows with current profile values
update public.master_customers c
set
    user_id = coalesce(c.user_id, p.id),
    name = trim(concat_ws(' ', coalesce(p.first_name, ''), coalesce(p.last_name, ''))),
    email = coalesce(p.email, c.email)
from public.profiles p
where (
        c.user_id = p.id
        or (
            c.email is not null
            and p.email is not null
            and lower(p.email) = lower(c.email)
        )
      )
  and p.role = 'customer';

update public.master_customers
set
    name = coalesce(nullif(name, ''), email, 'Customer')
where coalesce(nullif(name, '')) is null
   or name = '';

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
drop policy if exists "technician can read customers" on public.master_customers;
drop policy if exists "customer can read own customers" on public.master_customers;
create policy "admin can read customers"
on public.master_customers for select
to authenticated
using (public.is_admin());
create policy "admin can write customers"
on public.master_customers for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
create policy "technician can read customers"
on public.master_customers for select
to authenticated
using (public.is_technician());
create policy "customer can read own customers"
on public.master_customers for select
to authenticated
using (
    public.is_customer()
    and id = any(public.current_user_customer_ids())
);

drop policy if exists "admin can read projects" on public.master_projects;
drop policy if exists "admin can write projects" on public.master_projects;
drop policy if exists "technician can read projects" on public.master_projects;
drop policy if exists "customer can read own projects" on public.master_projects;
create policy "admin can read projects"
on public.master_projects for select
to authenticated
using (public.is_admin());
create policy "admin can write projects"
on public.master_projects for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
create policy "technician can read projects"
on public.master_projects for select
to authenticated
using (public.is_technician());
create policy "customer can read own projects"
on public.master_projects for select
to authenticated
using (
    public.is_customer()
    and customer_id = any(public.current_user_customer_ids())
);

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
drop policy if exists "technician can read ac brands" on public.master_ac_brands;
drop policy if exists "customer can read ac brands" on public.master_ac_brands;
create policy "admin can read ac brands"
on public.master_ac_brands for select
to authenticated
using (public.is_admin());
create policy "admin can write ac brands"
on public.master_ac_brands for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
create policy "technician can read ac brands"
on public.master_ac_brands for select
to authenticated
using (public.is_technician());
create policy "customer can read ac brands"
on public.master_ac_brands for select
to authenticated
using (public.is_customer());

drop policy if exists "admin can read ac types" on public.master_ac_types;
drop policy if exists "admin can write ac types" on public.master_ac_types;
drop policy if exists "technician can read ac types" on public.master_ac_types;
drop policy if exists "customer can read ac types" on public.master_ac_types;
create policy "admin can read ac types"
on public.master_ac_types for select
to authenticated
using (public.is_admin());
create policy "admin can write ac types"
on public.master_ac_types for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
create policy "technician can read ac types"
on public.master_ac_types for select
to authenticated
using (public.is_technician());
create policy "customer can read ac types"
on public.master_ac_types for select
to authenticated
using (public.is_customer());

drop policy if exists "admin can read ac pks" on public.master_ac_pks;
drop policy if exists "admin can write ac pks" on public.master_ac_pks;
drop policy if exists "technician can read ac pks" on public.master_ac_pks;
drop policy if exists "customer can read ac pks" on public.master_ac_pks;
create policy "admin can read ac pks"
on public.master_ac_pks for select
to authenticated
using (public.is_admin());
create policy "admin can write ac pks"
on public.master_ac_pks for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
create policy "technician can read ac pks"
on public.master_ac_pks for select
to authenticated
using (public.is_technician());
create policy "customer can read ac pks"
on public.master_ac_pks for select
to authenticated
using (public.is_customer());

drop policy if exists "admin can read requests" on public.requests;
drop policy if exists "admin can write requests" on public.requests;
drop policy if exists "technician can read requests" on public.requests;
drop policy if exists "technician can update requests" on public.requests;
drop policy if exists "customer can read own requests" on public.requests;
drop policy if exists "customer can insert own requests" on public.requests;

create or replace function public.is_technician()
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
          and role = 'technician'
    );
$$;

revoke all on function public.is_technician() from public;
grant execute on function public.is_technician() to authenticated;

create or replace function public.is_customer()
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
          and role = 'customer'
    );
$$;

revoke all on function public.is_customer() from public;
grant execute on function public.is_customer() to authenticated;

create or replace function public.current_user_customer_ids()
returns uuid[]
language sql
security definer
set search_path = public
stable
as $$
    select coalesce(array_agg(c.id), '{}'::uuid[])
    from public.master_customers c
    left join public.profiles p on p.id = auth.uid()
    where c.user_id = auth.uid()
       or (p.email is not null and c.email = p.email);
$$;

revoke all on function public.current_user_customer_ids() from public;
grant execute on function public.current_user_customer_ids() to authenticated;

create policy "admin can read requests"
on public.requests for select
to authenticated
using (public.is_admin());

create policy "admin can write requests"
on public.requests for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "technician can read requests"
on public.requests for select
to authenticated
using (
    public.is_technician()
    and status in ('pending', 'in_progress', 'completed')
);

create policy "technician can update requests"
on public.requests for update
to authenticated
using (
    public.is_technician()
    and (
        (status = 'pending' and (technician_id is null or technician_id = auth.uid()))
        or technician_id = auth.uid()
    )
)
with check (
    public.is_technician()
    and status in ('pending', 'in_progress', 'completed')
    and technician_id = auth.uid()
);

create policy "customer can read own requests"
on public.requests for select
to authenticated
using (
    public.is_customer()
    and customer_id = any(public.current_user_customer_ids())
);

create policy "customer can insert own requests"
on public.requests for insert
to authenticated
with check (
    public.is_customer()
    and customer_id = any(public.current_user_customer_ids())
    and created_by = auth.uid()
    and status = 'pending'
);

-- ============================================================
-- Storage policy for request photos (bucket: job-photos)
-- Technicians/admin/customers can upload to their own folder:
-- <auth.uid()>/requests/<before|progress|after>/<file>
-- ============================================================

insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', true)
on conflict (id) do nothing;

drop policy if exists "job photos read public/authenticated" on storage.objects;
create policy "job photos read public/authenticated"
on storage.objects for select
to public
using (bucket_id = 'job-photos');

drop policy if exists "job photos insert own folder" on storage.objects;
create policy "job photos insert own folder"
on storage.objects for insert
to authenticated
with check (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "job photos update own folder" on storage.objects;
create policy "job photos update own folder"
on storage.objects for update
to authenticated
using (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "job photos delete own folder" on storage.objects;
create policy "job photos delete own folder"
on storage.objects for delete
to authenticated
using (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
);
