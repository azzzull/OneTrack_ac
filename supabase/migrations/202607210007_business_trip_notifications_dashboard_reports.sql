create index if not exists business_trips_status_created_at_idx
on public.business_trips (status, created_at desc);

create index if not exists business_trips_settlement_status_idx
on public.business_trips (settlement_status, created_at desc);

create index if not exists business_trips_realization_status_idx
on public.business_trips (status, realization_submitted_at asc)
where status = 'realization_submitted';

create index if not exists business_trips_completion_report_idx
on public.business_trips (completed_at desc)
where completed_at is not null;

create index if not exists business_trip_settlements_type_idx
on public.business_trip_settlements (type, created_at desc);

comment on index public.business_trips_status_created_at_idx is 'Supports Business Trip dashboard, user history, and report status filtering.';
comment on index public.business_trips_settlement_status_idx is 'Supports Business Trip settlement report filtering.';

notify pgrst, 'reload schema';
