create table if not exists public.master_job_scopes (
    id uuid primary key default gen_random_uuid(),
    code text not null unique,
    label text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create or replace function public.set_master_job_scopes_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_master_job_scopes_updated_at on public.master_job_scopes;
create trigger trg_master_job_scopes_updated_at
before update on public.master_job_scopes
for each row
execute function public.set_master_job_scopes_updated_at();

insert into public.master_job_scopes (code, label)
values
    ('AC', 'Air Conditioning'),
    ('ELECTRICAL', 'Electrical'),
    ('ELEVATOR', 'Elevator'),
    ('GENSET', 'Generator Set'),
    ('PLUMBING', 'Plumbing'),
    ('FIRE_ALARM', 'Fire System'),
    ('CIVIL', 'Civil Works'),
    ('ACCESS_CONTROL', 'Access Control / Door Lock')
on conflict (code) do update
set label = excluded.label;

alter table public.master_job_scopes enable row level security;

drop policy if exists "Authenticated users can read job scopes" on public.master_job_scopes;
create policy "Authenticated users can read job scopes"
on public.master_job_scopes
for select
to authenticated
using (true);

drop policy if exists "Admins can manage job scopes" on public.master_job_scopes;
create policy "Admins can manage job scopes"
on public.master_job_scopes
for all
to authenticated
using (
    exists (
        select 1
        from public.profiles
        where profiles.id = auth.uid()
          and profiles.role = 'admin'
    )
)
with check (
    exists (
        select 1
        from public.profiles
        where profiles.id = auth.uid()
          and profiles.role = 'admin'
    )
);
