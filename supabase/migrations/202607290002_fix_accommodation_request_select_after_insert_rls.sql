drop policy if exists "Accommodation requests can be read by owners and admins" on public.accommodation_requests;
create policy "Accommodation requests can be read by owners and admins"
on public.accommodation_requests
for select
to authenticated
using (
    public.is_admin_or_management(auth.uid())
    or technician_id = auth.uid()
);

notify pgrst, 'reload schema';
