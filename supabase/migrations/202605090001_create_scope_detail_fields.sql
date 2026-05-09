create table if not exists public.scope_detail_fields (
    id uuid primary key default gen_random_uuid(),
    scope_id uuid not null references public.master_job_scopes(id) on delete cascade,
    field_key text not null,
    field_label text not null,
    field_type text not null default 'text',
    placeholder text null,
    is_required boolean not null default false,
    options jsonb null,
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint scope_detail_fields_field_type_check check (
        field_type in (
            'text',
            'textarea',
            'number',
            'date',
            'select',
            'checkbox',
            'file'
        )
    ),
    constraint scope_detail_fields_unique_key unique (scope_id, field_key)
);

create index if not exists idx_scope_detail_fields_scope_sort
    on public.scope_detail_fields (scope_id, sort_order, created_at);

create or replace function public.set_scope_detail_fields_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_scope_detail_fields_updated_at on public.scope_detail_fields;
create trigger trg_scope_detail_fields_updated_at
before update on public.scope_detail_fields
for each row
execute function public.set_scope_detail_fields_updated_at();

insert into public.scope_detail_fields (
    scope_id,
    field_key,
    field_label,
    field_type,
    placeholder,
    is_required,
    options,
    sort_order
)
select
    sj.id,
    v.field_key,
    v.field_label,
    v.field_type,
    v.placeholder,
    v.is_required,
    v.options::jsonb,
    v.sort_order
from public.master_job_scopes sj
join (
    values
        ('AC', 'ac_brand', 'Merk AC', 'select', 'Pilih merk AC', true, '[]', 1),
        ('AC', 'ac_type', 'Tipe AC', 'select', 'Pilih tipe AC', true, '[]', 2),
        ('AC', 'ac_capacity_pk', 'Kapasitas AC (PK)', 'select', 'Pilih kapasitas', true, '[]', 3),
        ('AC', 'room_location', 'Lokasi Ruangan', 'text', 'Contoh: Ruang Meeting A', true, '[]', 4),
        ('AC', 'serial_number', 'Serial Number', 'text', 'Scan atau ketik manual', false, '[]', 5),
        ('ELECTRICAL', 'equipment_type', 'Tipe Aset', 'select', 'Panel / UPS', false, '["Panel","UPS"]', 1),
        ('ELECTRICAL', 'panel_name', 'Nama Panel / Unit', 'text', 'Panel SDP-A / UPS LT 2', false, '[]', 2),
        ('ELECTRICAL', 'panel_location', 'Lokasi Panel / Unit', 'text', 'Ruang listrik LT 2', false, '[]', 3),
        ('ELECTRICAL', 'voltage_notes', 'Catatan Tegangan', 'text', '220V stabil', false, '[]', 4),
        ('ELEVATOR', 'unit_name', 'Nama Unit Lift', 'text', 'Lift A / Service Lift', false, '[]', 1),
        ('ELEVATOR', 'unit_location', 'Lokasi / Tower', 'text', 'Tower A', false, '[]', 2),
        ('ELEVATOR', 'serving_floor', 'Lantai Layanan', 'text', 'B1 - 10', false, '[]', 3),
        ('GENSET', 'unit_name', 'Nama Unit Genset', 'text', 'GEN-01', false, '[]', 1),
        ('GENSET', 'capacity', 'Kapasitas', 'text', '500 kVA', false, '[]', 2),
        ('GENSET', 'load_check', 'Catatan Beban', 'text', 'Load 68%', false, '[]', 3),
        ('PLUMBING', 'work_area', 'Area Pekerjaan', 'text', 'Toilet LT 3 / pantry', false, '[]', 1),
        ('PLUMBING', 'line_type', 'Jenis Saluran', 'text', 'Air bersih / air kotor / closet', false, '[]', 2),
        ('PLUMBING', 'pump_unit', 'Unit Pompa Terkait', 'text', 'Pompa transfer 1', false, '[]', 3),
        ('FIRE_ALARM', 'zone_name', 'Zone / Area', 'text', 'Zone 4 / Gedung A', false, '[]', 1),
        ('FIRE_ALARM', 'device_name', 'Panel / Device', 'text', 'MCFA / detector / hydrant', false, '[]', 2),
        ('FIRE_ALARM', 'interlock_note', 'Catatan Interlock', 'text', 'PA, press fan, BAS', false, '[]', 3),
        ('CIVIL', 'work_area', 'Area Pekerjaan', 'text', 'Atap / toilet / parkiran', false, '[]', 1),
        ('CIVIL', 'damage_type', 'Jenis Kerusakan', 'text', 'Retak / bocor / finishing', false, '[]', 2),
        ('CIVIL', 'material_note', 'Catatan Material', 'text', 'Cat / semen / waterproofing', false, '[]', 3),
        ('ACCESS_CONTROL', 'door_name', 'Nama Pintu / Device', 'text', 'Main Entrance / Door A', false, '[]', 1),
        ('ACCESS_CONTROL', 'device_type', 'Tipe Device', 'text', 'Maglock / reader / push button', false, '[]', 2),
        ('ACCESS_CONTROL', 'location', 'Lokasi', 'text', 'Lobby / ruang server', false, '[]', 3)
) as v(scope_code, field_key, field_label, field_type, placeholder, is_required, options, sort_order)
    on sj.code = v.scope_code
on conflict (scope_id, field_key) do update
set
    field_label = excluded.field_label,
    field_type = excluded.field_type,
    placeholder = excluded.placeholder,
    is_required = excluded.is_required,
    options = excluded.options,
    sort_order = excluded.sort_order;

alter table public.scope_detail_fields enable row level security;

drop policy if exists "Authenticated users can read scope detail fields" on public.scope_detail_fields;
create policy "Authenticated users can read scope detail fields"
on public.scope_detail_fields
for select
to authenticated
using (true);

drop policy if exists "Admins can manage scope detail fields" on public.scope_detail_fields;
create policy "Admins can manage scope detail fields"
on public.scope_detail_fields
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
