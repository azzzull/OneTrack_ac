-- Allow technician to create new requests/jobs.
-- More resilient for legacy rows/frontend payload.
-- Run this in Supabase SQL Editor.

create or replace function public.has_role(target_role text)
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
          and lower(coalesce(role, '')) = lower(target_role)
    )
    or lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '')) = lower(target_role)
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = lower(target_role);
$$;

revoke all on function public.has_role(text) from public;
grant execute on function public.has_role(text) to authenticated;

drop policy if exists "technician can insert requests" on public.requests;

create policy "technician can insert requests"
on public.requests for insert
to authenticated
with check (
    public.has_role('technician')
    and coalesce(created_by, auth.uid()) = auth.uid()
    and coalesce(technician_id, auth.uid()) = auth.uid()
    and status in ('pending', 'in_progress', 'completed')
);

create or replace function public.auto_assign_request_technician()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_name text;
    v_creator_is_technician boolean;
begin
    -- Always keep creator as current authenticated user.
    new.created_by := coalesce(new.created_by, auth.uid());

    select exists (
        select 1
        from public.profiles p
        where p.id = new.created_by
          and lower(coalesce(p.role, '')) = 'technician'
    )
    into v_creator_is_technician;

    -- If creator is technician, auto-assign job to creator id.
    if v_creator_is_technician or public.has_role('technician') then
        new.technician_id := coalesce(new.technician_id, new.created_by, auth.uid());

        if coalesce(new.technician_name, '') = '' then
            select
                coalesce(
                    nullif(trim(concat_ws(' ', first_name, last_name)), ''),
                    nullif(name, ''),
                    nullif(email, ''),
                    'Teknisi'
                )
            into v_name
            from public.profiles
            where id = new.technician_id;

            new.technician_name := coalesce(v_name, 'Teknisi');
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists before_insert_requests_auto_assign on public.requests;
create trigger before_insert_requests_auto_assign
before insert on public.requests
for each row execute function public.auto_assign_request_technician();

-- Backfill old rows: if created by technician and technician_id is empty, assign it.
update public.requests r
set
    technician_id = r.created_by,
    technician_name = coalesce(
        nullif(r.technician_name, ''),
        nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
        nullif(p.name, ''),
        nullif(p.email, ''),
        'Teknisi'
    )
from public.profiles p
where r.technician_id is null
  and r.created_by = p.id
  and lower(coalesce(p.role, '')) = 'technician';
