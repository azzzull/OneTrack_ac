-- Normalize any legacy job_scope values to master_job_scopes.code before enforcing FK.
update public.requests r
set job_scope = sj.code
from public.master_job_scopes sj
where upper(regexp_replace(trim(coalesce(r.job_scope, '')), '[^A-Za-z0-9]+', '_', 'g')) = sj.code
   or lower(trim(coalesce(r.job_scope, ''))) = lower(sj.label)
   or upper(trim(coalesce(r.job_scope, ''))) = upper(sj.label);

-- Allow requests.job_scope to follow master_job_scopes instead of static check constraint.
alter table public.requests
drop constraint if exists requests_job_scope_check;

alter table public.requests
drop constraint if exists requests_job_scope_fkey;

alter table public.requests
add constraint requests_job_scope_fkey
foreign key (job_scope) references public.master_job_scopes(code)
on delete restrict on update cascade;

-- Provide a security-definer directory for technician selection so RLS on profiles
-- does not hide other technicians from collaboration flows.
create or replace function public.get_technician_directory()
returns table (
    id uuid,
    first_name text,
    last_name text,
    email text,
    technician_type text,
    customer_id uuid,
    role text
)
language sql
security definer
set search_path = public
as $$
    select
        p.id,
        p.first_name,
        p.last_name,
        p.email,
        p.technician_type,
        p.customer_id,
        p.role
    from public.profiles p
    where p.role = 'technician'
    order by p.first_name asc nulls last, p.last_name asc nulls last, p.email asc nulls last;
$$;

grant execute on function public.get_technician_directory() to authenticated;

-- Make request visibility and editing aware of the new job_technicians relation.
alter table public.requests enable row level security;

drop policy if exists "Admins can read requests" on public.requests;
create policy "Admins can read requests"
on public.requests
for select
to authenticated
using (
    exists (
        select 1
        from public.profiles
        where profiles.id = auth.uid()
          and profiles.role = 'admin'
    )
);

drop policy if exists "Request owners and assigned technicians can read requests" on public.requests;
create policy "Request owners and assigned technicians can read requests"
on public.requests
for select
to authenticated
using (
    created_by = auth.uid()
    or technician_id = auth.uid()
    or exists (
        select 1
        from public.job_technicians jt
        where jt.job_id = requests.id
          and jt.technician_id = auth.uid()
    )
);

drop policy if exists "Admins and request owners can update requests" on public.requests;
create policy "Admins and request owners can update requests"
on public.requests
for update
to authenticated
using (
    exists (
        select 1
        from public.profiles
        where profiles.id = auth.uid()
          and profiles.role = 'admin'
    )
    or created_by = auth.uid()
    or technician_id = auth.uid()
    or exists (
        select 1
        from public.job_technicians jt
        where jt.job_id = requests.id
          and jt.technician_id = auth.uid()
    )
)
with check (
    exists (
        select 1
        from public.profiles
        where profiles.id = auth.uid()
          and profiles.role = 'admin'
    )
    or created_by = auth.uid()
    or technician_id = auth.uid()
    or exists (
        select 1
        from public.job_technicians jt
        where jt.job_id = requests.id
          and jt.technician_id = auth.uid()
    )
);

drop policy if exists "Admins and request owners can delete requests" on public.requests;
create policy "Admins and request owners can delete requests"
on public.requests
for delete
to authenticated
using (
    exists (
        select 1
        from public.profiles
        where profiles.id = auth.uid()
          and profiles.role = 'admin'
    )
    or created_by = auth.uid()
    or technician_id = auth.uid()
);
