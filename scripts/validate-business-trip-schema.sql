-- Business Trip schema validation script.
-- Run on local/staging after applying Business Trip migrations.
-- This script is read-only and raises exceptions when required objects are missing.

do $$
begin
    if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'business_trips') then
        raise exception 'Missing table public.business_trips';
    end if;
    if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'business_trip_agendas') then
        raise exception 'Missing table public.business_trip_agendas';
    end if;
    if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'business_trip_agenda_realizations') then
        raise exception 'Missing table public.business_trip_agenda_realizations';
    end if;
    if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'business_trip_agenda_photos') then
        raise exception 'Missing table public.business_trip_agenda_photos';
    end if;
    if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'business_trip_status_history') then
        raise exception 'Missing table public.business_trip_status_history';
    end if;
    if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'business_trip_advance_disbursements') then
        raise exception 'Missing table public.business_trip_advance_disbursements';
    end if;
    if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'business_trip_settlements') then
        raise exception 'Missing table public.business_trip_settlements';
    end if;
end $$;

do $$
begin
    if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'business_trips' and rowsecurity) then
        raise exception 'RLS disabled on public.business_trips';
    end if;
    if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'business_trip_agendas' and rowsecurity) then
        raise exception 'RLS disabled on public.business_trip_agendas';
    end if;
    if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'business_trip_agenda_realizations' and rowsecurity) then
        raise exception 'RLS disabled on public.business_trip_agenda_realizations';
    end if;
    if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'business_trip_agenda_photos' and rowsecurity) then
        raise exception 'RLS disabled on public.business_trip_agenda_photos';
    end if;
end $$;

do $$
declare
    required_functions text[] := array[
        'generate_business_trip_no',
        'save_business_trip_draft',
        'submit_business_trip_request',
        'approve_business_trip_request',
        'reject_business_trip_request',
        'ensure_business_trip_accommodation',
        'disburse_business_trip_advance',
        'start_business_trip',
        'save_business_trip_realization_draft',
        'submit_business_trip_realization',
        'request_business_trip_realization_revision',
        'verify_business_trip_realization',
        'record_business_trip_advance_refund',
        'pay_business_trip_realization_shortfall',
        'delete_business_trip_draft',
        'get_business_trip_status_counts',
        'get_business_trip_approval_counts'
    ];
    function_name text;
begin
    foreach function_name in array required_functions loop
        if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = function_name) then
            raise exception 'Missing function public.%', function_name;
        end if;
    end loop;
end $$;

do $$
begin
    if not exists (select 1 from storage.buckets where id = 'business-trip-evidence' and public = false) then
        raise exception 'Missing private storage bucket business-trip-evidence';
    end if;
    if not exists (select 1 from pg_constraint where conname = 'business_trips_no_unique') then
        raise exception 'Missing unique constraint business_trips_no_unique';
    end if;
    if not exists (select 1 from pg_constraint where conname = 'business_trip_agendas_sequence_unique') then
        raise exception 'Missing agenda sequence unique constraint';
    end if;
    if not exists (select 1 from pg_constraint where conname = 'business_trip_settlements_trip_type_unique') then
        raise exception 'Missing settlement unique constraint';
    end if;
end $$;

select 'business_trip_validation_ok' as result;