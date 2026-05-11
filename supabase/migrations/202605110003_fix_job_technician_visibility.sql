-- Break RLS recursion between requests and job_technicians by using security-definer helpers.
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
        exists (
            select 1
            from public.profiles p
            where p.id = p_user_id
              and p.role = 'admin'
        )
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

create or replace function public.get_technician_job_ids(p_technician_id uuid)
returns table (job_id uuid)
language sql
security definer
set search_path = public
as $$
    select distinct jt.job_id
    from public.job_technicians jt
    where jt.technician_id = p_technician_id
    order by jt.job_id;
$$;

grant execute on function public.can_access_request_job(uuid, uuid) to authenticated;
grant execute on function public.get_technician_job_ids(uuid) to authenticated;

alter table public.requests enable row level security;

drop policy if exists "Admins can read requests" on public.requests;
create policy "Admins can read requests"
on public.requests
for select
to authenticated
using (public.can_access_request_job(id, auth.uid()));

drop policy if exists "Request owners and assigned technicians can read requests" on public.requests;
create policy "Request owners and assigned technicians can read requests"
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
    exists (
        select 1
        from public.profiles
        where profiles.id = auth.uid()
          and profiles.role = 'admin'
    )
    or created_by = auth.uid()
);
