create table if not exists public.scope_detail_checklist_items (
    id uuid primary key default gen_random_uuid(),
    scope_id uuid not null references public.master_job_scopes(id) on delete cascade,
    item_label text not null,
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint scope_detail_checklist_items_unique_label unique (scope_id, item_label)
);

create index if not exists idx_scope_detail_checklist_items_scope_sort
    on public.scope_detail_checklist_items (scope_id, sort_order, created_at);

create or replace function public.set_scope_detail_checklist_items_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_scope_detail_checklist_items_updated_at on public.scope_detail_checklist_items;
create trigger trg_scope_detail_checklist_items_updated_at
before update on public.scope_detail_checklist_items
for each row
execute function public.set_scope_detail_checklist_items_updated_at();

insert into public.scope_detail_checklist_items (
    scope_id,
    item_label,
    sort_order
)
select
    sj.id,
    v.item_label,
    v.sort_order
from public.master_job_scopes sj
join (
    values
        ('ELECTRICAL', 'Inspeksi breaker', 1),
        ('ELECTRICAL', 'Inspeksi pilot lamp', 2),
        ('ELECTRICAL', 'Inspeksi power meter', 3),
        ('ELECTRICAL', 'Pemeriksaan korosi / karat box konektor', 4),
        ('ELECTRICAL', 'Thermal scanning seluruh koneksi', 5),
        ('ELECTRICAL', 'Cek tegangan', 6),
        ('ELECTRICAL', 'Cek system', 7),
        ('ELECTRICAL', 'Cek jaringan', 8),
        ('ELECTRICAL', 'Cek power supply', 9),
        ('ELECTRICAL', 'Cleaning body', 10),
        ('ELECTRICAL', 'Cek terminasi & koneksi kabel busbar', 11),
        ('ELECTRICAL', 'Test insulation resistance', 12),
        ('ELECTRICAL', 'Pengecekan tegangan UPS', 13),
        ('ELECTRICAL', 'Pengecekan battery UPS', 14),
        ('ELEVATOR', 'Pengecekan controller dan inverter', 1),
        ('ELEVATOR', 'Pengecekan mesin', 2),
        ('ELEVATOR', 'Pengecekan signalization', 3),
        ('ELEVATOR', 'Pengecekan box lift', 4),
        ('ELEVATOR', 'Pengecekan elevator shaft', 5),
        ('ELEVATOR', 'Pengecekan pit lift', 6),
        ('GENSET', 'Pembersihan genset', 1),
        ('GENSET', 'Ganti oli', 2),
        ('GENSET', 'Ganti filter oli', 3),
        ('GENSET', 'Isi air radiator', 4),
        ('GENSET', 'Isi air aki', 5),
        ('GENSET', 'Pengecekan beban', 6),
        ('PLUMBING', 'Pemeriksaan rutin', 1),
        ('PLUMBING', 'Perawatan dan perbaikan pipa air kotor dan pembuangan', 2),
        ('PLUMBING', 'Perawatan dan perbaikan pipa toilet dan saluran closet', 3),
        ('PLUMBING', 'Perawatan dan perbaikan bak kontrol', 4),
        ('PLUMBING', 'Perawatan dan perbaikan motor pompa', 5),
        ('PLUMBING', 'Perawatan dan perbaikan instalasi air bersih', 6),
        ('PLUMBING', 'Perawatan dan perbaikan keran air dan jet shower', 7),
        ('FIRE_ALARM', 'Pemeriksaan & test annunciator', 1),
        ('FIRE_ALARM', 'Pemeriksaan & test detector beserta accessories', 2),
        ('FIRE_ALARM', 'Pemeriksaan & test module', 3),
        ('FIRE_ALARM', 'Pemeriksaan & test MCFA ruang MCFA', 4),
        ('FIRE_ALARM', 'Pemeriksaan & test interlock system', 5),
        ('FIRE_ALARM', 'Simulation test', 6),
        ('FIRE_ALARM', 'Pemeriksaan tabung hydrant dan pengisian kembali', 7),
        ('ACCESS_CONTROL', 'Pemeriksaan electric lock / maglock', 1),
        ('ACCESS_CONTROL', 'Pemeriksaan access reader / credential', 2),
        ('ACCESS_CONTROL', 'Pemeriksaan push button / exit switch', 3),
        ('ACCESS_CONTROL', 'Pemeriksaan power supply', 4),
        ('ACCESS_CONTROL', 'Pemeriksaan wiring dan koneksi', 5),
        ('ACCESS_CONTROL', 'Pemeriksaan door closer & alignment', 6),
        ('ACCESS_CONTROL', 'Test buka/tutup dan akses user', 7)
) as v(scope_code, item_label, sort_order)
    on sj.code = v.scope_code
on conflict (scope_id, item_label) do update
set
    sort_order = excluded.sort_order;

alter table public.scope_detail_checklist_items enable row level security;

drop policy if exists "Authenticated users can read scope detail checklist items" on public.scope_detail_checklist_items;
create policy "Authenticated users can read scope detail checklist items"
on public.scope_detail_checklist_items
for select
to authenticated
using (true);

drop policy if exists "Admins can manage scope detail checklist items" on public.scope_detail_checklist_items;
create policy "Admins can manage scope detail checklist items"
on public.scope_detail_checklist_items
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
