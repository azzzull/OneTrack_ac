drop policy if exists "Internal technicians can create own accommodation requests" on public.accommodation_requests;
create policy "Technicians can create own accommodation requests"
on public.accommodation_requests
for insert
to authenticated
with check (
    technician_id = auth.uid()
    and status = 'pending'
    and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'technician'
    )
);

notify pgrst, 'reload schema';
