create table if not exists public.job_technicians (
    id uuid primary key default gen_random_uuid(),
    job_id uuid not null references public.requests(id) on delete cascade,
    technician_id uuid not null references public.profiles(id) on delete cascade,
    role text not null default 'member',
    added_by uuid null references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint job_technicians_role_check check (role in ('creator', 'member')),
    constraint job_technicians_job_technician_unique unique (job_id, technician_id)
);

create unique index if not exists idx_job_technicians_one_creator
    on public.job_technicians (job_id)
    where role = 'creator';

create index if not exists idx_job_technicians_job_role
    on public.job_technicians (job_id, role, created_at);

create index if not exists idx_job_technicians_technician
    on public.job_technicians (technician_id, created_at);

create or replace function public.set_job_technicians_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_job_technicians_updated_at on public.job_technicians;
create trigger trg_job_technicians_updated_at
before update on public.job_technicians
for each row
execute function public.set_job_technicians_updated_at();

insert into public.job_technicians (
    job_id,
    technician_id,
    role,
    added_by
)
select
    r.id,
    coalesce(r.technician_id, r.created_by),
    'creator',
    coalesce(r.created_by, r.technician_id)
from public.requests r
where coalesce(r.technician_id, r.created_by) is not null
on conflict (job_id, technician_id) do update
set
    role = 'creator',
    added_by = excluded.added_by;

create or replace function public.sync_job_technicians_from_requests()
returns trigger
language plpgsql
as $$
begin
    if tg_op = 'INSERT' then
        if new.technician_id is not null then
            insert into public.job_technicians (
                job_id,
                technician_id,
                role,
                added_by
            )
            values (
                new.id,
                new.technician_id,
                'creator',
                coalesce(new.created_by, new.technician_id)
            )
            on conflict (job_id, technician_id) do update
            set
                role = 'creator',
                added_by = excluded.added_by;
        end if;
        return new;
    end if;

    if tg_op = 'UPDATE' then
        if new.technician_id is distinct from old.technician_id then
            delete from public.job_technicians
            where job_id = new.id
              and role = 'creator'
              and technician_id = old.technician_id;

            if new.technician_id is not null then
                insert into public.job_technicians (
                    job_id,
                    technician_id,
                    role,
                    added_by
                )
                values (
                    new.id,
                    new.technician_id,
                    'creator',
                    coalesce(new.created_by, new.technician_id)
                )
                on conflict (job_id, technician_id) do update
                set
                    role = 'creator',
                    added_by = excluded.added_by;
            end if;
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists trg_sync_job_technicians_from_requests on public.requests;
create trigger trg_sync_job_technicians_from_requests
after insert or update of technician_id on public.requests
for each row
execute function public.sync_job_technicians_from_requests();

alter table public.job_technicians enable row level security;

drop policy if exists "Authenticated users can read job technicians" on public.job_technicians;
create policy "Authenticated users can read job technicians"
on public.job_technicians
for select
to authenticated
using (true);

drop policy if exists "Admins and creators can manage job technicians" on public.job_technicians;
create policy "Admins and creators can manage job technicians"
on public.job_technicians
for all
to authenticated
using (
    exists (
        select 1
        from public.profiles
        where profiles.id = auth.uid()
          and profiles.role = 'admin'
    )
    or exists (
        select 1
        from public.requests
        where requests.id = job_id
          and (
              requests.created_by = auth.uid()
              or requests.technician_id = auth.uid()
          )
    )
)
with check (
    exists (
        select 1
        from public.profiles
        where profiles.id = auth.uid()
          and profiles.role = 'admin'
    )
    or exists (
        select 1
        from public.requests
        where requests.id = job_id
          and (
              requests.created_by = auth.uid()
              or requests.technician_id = auth.uid()
          )
    )
);
