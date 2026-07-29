create or replace function public.can_submit_own_accommodation_request(
    p_user_id uuid default auth.uid()
)
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
    );
$$;

grant execute on function public.can_submit_own_accommodation_request(uuid) to authenticated;

drop policy if exists "Internal technicians can create own accommodation requests" on public.accommodation_requests;
drop policy if exists "Technicians can create own accommodation requests" on public.accommodation_requests;

create policy "Technicians can create own accommodation requests"
on public.accommodation_requests
for insert
to authenticated
with check (
    technician_id = auth.uid()
    and status = 'pending'
    and public.can_submit_own_accommodation_request(auth.uid())
);

notify pgrst, 'reload schema';
