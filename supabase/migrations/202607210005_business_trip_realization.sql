alter table public.business_trip_agenda_realizations
add column if not exists business_trip_id uuid references public.business_trips(id) on delete cascade,
add column if not exists status text not null default 'draft' check (status in ('draft', 'submitted')),
add column if not exists created_by uuid references public.profiles(id) on delete set null,
add column if not exists updated_by uuid references public.profiles(id) on delete set null;

alter table public.business_trip_agenda_photos
add column if not exists realization_id uuid references public.business_trip_agenda_realizations(id) on delete set null;

update public.business_trip_agenda_realizations r
set business_trip_id = a.business_trip_id
from public.business_trip_agendas a
where r.agenda_id = a.id
  and r.business_trip_id is null;

alter table public.business_trip_agenda_realizations
drop constraint if exists business_trip_agenda_realizations_trip_required;

alter table public.business_trip_agenda_realizations
add constraint business_trip_agenda_realizations_trip_required
check (business_trip_id is not null);

create index if not exists business_trip_agenda_realizations_business_trip_id_idx
on public.business_trip_agenda_realizations (business_trip_id);

create index if not exists business_trip_agenda_realizations_status_idx
on public.business_trip_agenda_realizations (status);

create index if not exists business_trip_agenda_photos_realization_id_idx
on public.business_trip_agenda_photos (realization_id);

create or replace function public.validate_business_trip_agenda_realization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if not exists (
        select 1
        from public.business_trip_agendas a
        where a.id = new.agenda_id
          and a.business_trip_id = new.business_trip_id
    ) then
        raise exception 'Realisasi agenda harus terkait agenda dan Business Trip yang sama.';
    end if;
    return new;
end;
$$;

drop trigger if exists business_trip_agenda_realizations_validate on public.business_trip_agenda_realizations;
create trigger business_trip_agenda_realizations_validate
before insert or update on public.business_trip_agenda_realizations
for each row execute function public.validate_business_trip_agenda_realization();

create or replace function public.start_business_trip(
    p_business_trip_id uuid
)
returns public.business_trips
language plpgsql
security definer
set search_path = public
as $$
declare
    v_trip public.business_trips%rowtype;
    v_actor_id uuid := auth.uid();
    v_now timestamptz := now();
    v_from_status text;
begin
    if v_actor_id is null then
        raise exception 'Sesi login tidak valid.';
    end if;

    select *
    into v_trip
    from public.business_trips
    where id = p_business_trip_id
    for update;

    if not found then
        raise exception 'Business Trip tidak ditemukan.';
    end if;

    if v_trip.requester_id <> v_actor_id then
        raise exception 'Anda tidak dapat memulai Business Trip ini.';
    end if;

    if coalesce(v_trip.requested_amount, 0) > 0 and v_trip.status <> 'advance_disbursed' then
        raise exception 'Uang muka harus dicairkan sebelum perjalanan dimulai.';
    end if;

    if coalesce(v_trip.requested_amount, 0) <= 0 and v_trip.status <> 'approved' then
        raise exception 'Status Business Trip sudah berubah.';
    end if;

    v_from_status := v_trip.status;

    update public.business_trips
    set
        status = 'in_progress',
        started_at = v_now,
        updated_at = v_now,
        updated_by = v_actor_id
    where id = p_business_trip_id
      and (
          (coalesce(requested_amount, 0) > 0 and status = 'advance_disbursed')
          or (coalesce(requested_amount, 0) <= 0 and status = 'approved')
      )
    returning * into v_trip;

    if not found then
        raise exception 'Status Business Trip sudah berubah.';
    end if;

    insert into public.business_trip_status_history (
        business_trip_id,
        from_status,
        to_status,
        action,
        acted_by,
        acted_at
    )
    values (
        p_business_trip_id,
        v_from_status,
        'in_progress',
        'STARTED',
        v_actor_id,
        v_now
    );

    return v_trip;
end;
$$;

create or replace function public.save_business_trip_realization_draft(
    p_business_trip_id uuid,
    p_realizations jsonb default '[]'::jsonb
)
returns public.business_trips
language plpgsql
security definer
set search_path = public
as $$
declare
    v_trip public.business_trips%rowtype;
    v_actor_id uuid := auth.uid();
    v_item jsonb;
    v_agenda_id uuid;
    v_result text;
begin
    if v_actor_id is null then
        raise exception 'Sesi login tidak valid.';
    end if;

    select *
    into v_trip
    from public.business_trips
    where id = p_business_trip_id
    for update;

    if not found then
        raise exception 'Business Trip tidak ditemukan.';
    end if;

    if v_trip.requester_id <> v_actor_id then
        raise exception 'Anda tidak dapat mengubah laporan realisasi ini.';
    end if;

    if v_trip.status not in ('in_progress', 'realization_draft') then
        raise exception 'Laporan realisasi tidak dapat diedit pada status saat ini.';
    end if;

    for v_item in select * from jsonb_array_elements(coalesce(p_realizations, '[]'::jsonb))
    loop
        v_agenda_id := nullif(v_item->>'agenda_id', '')::uuid;
        v_result := left(trim(coalesce(v_item->>'result', '')), 5000);

        if not exists (
            select 1
            from public.business_trip_agendas a
            where a.id = v_agenda_id
              and a.business_trip_id = p_business_trip_id
        ) then
            raise exception 'Agenda tidak valid.';
        end if;

        insert into public.business_trip_agenda_realizations (
            business_trip_id,
            agenda_id,
            result,
            status,
            created_by,
            updated_by
        )
        values (
            p_business_trip_id,
            v_agenda_id,
            nullif(v_result, ''),
            'draft',
            v_actor_id,
            v_actor_id
        )
        on conflict (agenda_id)
        do update set
            result = excluded.result,
            status = 'draft',
            updated_by = v_actor_id,
            updated_at = now();
    end loop;

    update public.business_trips
    set
        status = 'realization_draft',
        updated_at = now(),
        updated_by = v_actor_id
    where id = p_business_trip_id
      and status in ('in_progress', 'realization_draft')
    returning * into v_trip;

    return v_trip;
end;
$$;

create or replace function public.submit_business_trip_realization(
    p_business_trip_id uuid
)
returns public.business_trips
language plpgsql
security definer
set search_path = public
as $$
declare
    v_trip public.business_trips%rowtype;
    v_actor_id uuid := auth.uid();
    v_now timestamptz := now();
    v_agenda_count integer;
    v_complete_count integer;
    v_from_status text;
begin
    if v_actor_id is null then
        raise exception 'Sesi login tidak valid.';
    end if;

    select *
    into v_trip
    from public.business_trips
    where id = p_business_trip_id
    for update;

    if not found then
        raise exception 'Business Trip tidak ditemukan.';
    end if;

    if v_trip.requester_id <> v_actor_id then
        raise exception 'Anda tidak dapat mengirim laporan realisasi ini.';
    end if;

    if v_trip.status not in ('in_progress', 'realization_draft') then
        raise exception 'Status Business Trip sudah berubah.';
    end if;

    v_from_status := v_trip.status;

    select count(*)
    into v_agenda_count
    from public.business_trip_agendas
    where business_trip_id = p_business_trip_id;

    select count(*)
    into v_complete_count
    from public.business_trip_agendas a
    join public.business_trip_agenda_realizations r
      on r.agenda_id = a.id
     and r.business_trip_id = a.business_trip_id
    where a.business_trip_id = p_business_trip_id
      and coalesce(trim(r.result), '') <> ''
      and exists (
          select 1
          from public.business_trip_agenda_photos p
          where p.business_trip_id = a.business_trip_id
            and p.agenda_id = a.id
      );

    if v_agenda_count = 0 or v_complete_count <> v_agenda_count then
        raise exception 'Laporan belum lengkap.';
    end if;

    update public.business_trip_agenda_realizations
    set
        status = 'submitted',
        submitted_at = v_now,
        updated_by = v_actor_id,
        updated_at = v_now
    where business_trip_id = p_business_trip_id;

    update public.business_trips
    set
        status = 'realization_submitted',
        realization_submitted_at = v_now,
        updated_at = v_now,
        updated_by = v_actor_id
    where id = p_business_trip_id
      and status in ('in_progress', 'realization_draft')
    returning * into v_trip;

    if not found then
        raise exception 'Status Business Trip sudah berubah.';
    end if;

    insert into public.business_trip_status_history (
        business_trip_id,
        from_status,
        to_status,
        action,
        acted_by,
        acted_at
    )
    values (
        p_business_trip_id,
        v_from_status,
        'realization_submitted',
        'REALIZATION_SUBMITTED',
        v_actor_id,
        v_now
    );

    return v_trip;
end;
$$;

drop policy if exists "Requesters can delete own agenda photos during realization" on public.business_trip_agenda_photos;
create policy "Requesters can delete own agenda photos during realization"
on public.business_trip_agenda_photos
for delete
to authenticated
using (
    uploaded_by = auth.uid()
    and exists (
        select 1
        from public.business_trips bt
        where bt.id = business_trip_id
          and bt.requester_id = auth.uid()
          and bt.status in ('in_progress', 'realization_draft')
    )
);

drop policy if exists "Business trip photo delete by requester during realization" on storage.objects;
create policy "Business trip photo delete by requester during realization"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'business-trip-evidence'
    and name like 'business-trips/%/agendas/%'
);

grant execute on function public.start_business_trip(uuid) to authenticated;
grant execute on function public.save_business_trip_realization_draft(uuid, jsonb) to authenticated;
grant execute on function public.submit_business_trip_realization(uuid) to authenticated;

notify pgrst, 'reload schema';
