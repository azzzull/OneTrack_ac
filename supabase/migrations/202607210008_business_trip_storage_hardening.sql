update storage.buckets
set public = false
where id = 'business-trip-evidence';

drop policy if exists "Business trip photo read access" on storage.objects;
create policy "Business trip photo read access"
on storage.objects
for select
to authenticated
using (
    bucket_id = 'business-trip-evidence'
    and exists (
        select 1
        from public.business_trip_agenda_photos photo
        where photo.storage_path = storage.objects.name
          and public.can_access_business_trip(photo.business_trip_id, auth.uid())
    )
);

drop policy if exists "Business trip photo upload by authenticated users" on storage.objects;
create policy "Business trip photo upload by requester during realization"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'business-trip-evidence'
    and (storage.foldername(name))[1] = 'business-trips'
    and (storage.foldername(name))[3] = 'agendas'
    and exists (
        select 1
        from public.business_trips trip
        join public.business_trip_agendas agenda
          on agenda.business_trip_id = trip.id
        where trip.id::text = (storage.foldername(name))[2]
          and agenda.id::text = (storage.foldername(name))[4]
          and trip.requester_id = auth.uid()
          and trip.status in (
              'in_progress',
              'realization_draft',
              'realization_revision_required'
          )
    )
);

drop policy if exists "Business trip photo delete by requester during realization" on storage.objects;
create policy "Business trip photo delete by requester during realization"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'business-trip-evidence'
    and exists (
        select 1
        from public.business_trip_agenda_photos photo
        join public.business_trips trip on trip.id = photo.business_trip_id
        where photo.storage_path = storage.objects.name
          and photo.uploaded_by = auth.uid()
          and trip.requester_id = auth.uid()
          and trip.status in (
              'in_progress',
              'realization_draft',
              'realization_revision_required'
          )
    )
);

notify pgrst, 'reload schema';
