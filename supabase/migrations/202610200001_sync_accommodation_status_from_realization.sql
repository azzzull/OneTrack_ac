-- A request with receipts that meet or exceed the approved accommodation
-- amount is settled, regardless of whether its receipts originate from the
-- Accommodation module or from the related Business Trip realization.
create or replace function public.sync_accommodation_realization_status(
    p_accommodation_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_request public.accommodation_requests%rowtype;
    v_business_trip_id uuid;
    v_total_realized numeric := 0;
begin
    select *
    into v_request
    from public.accommodation_requests
    where id = p_accommodation_request_id
    for update;

    if not found
       or lower(coalesce(v_request.status, 'pending')) not in (
           'approved',
           'realization_process',
           'partial_realized'
       ) then
        return;
    end if;

    v_business_trip_id := coalesce(
        v_request.business_trip_id,
        case
            when lower(coalesce(v_request.source_module, '')) = 'business_trip'
                then v_request.source_id
            else null
        end
    );

    if v_business_trip_id is not null then
        select coalesce(sum(realization.realized_amount), 0)
        into v_total_realized
        from public.business_trip_agenda_realizations as realization
        where realization.business_trip_id = v_business_trip_id;
    else
        select coalesce(sum(realization.amount), 0)
        into v_total_realized
        from public.accommodation_realizations as realization
        where realization.accommodation_request_id = v_request.id;
    end if;

    if coalesce(v_request.approved_amount, 0) > 0
       and v_total_realized >= v_request.approved_amount then
        update public.accommodation_requests
        set status = 'realized', updated_at = now()
        where id = v_request.id;
    elsif v_total_realized > 0 then
        update public.accommodation_requests
        set status = 'partial_realized', updated_at = now()
        where id = v_request.id
          and status = 'approved';
    end if;
end;
$$;

create or replace function public.sync_accommodation_status_from_realization()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_request_id uuid;
begin
    if tg_op = 'DELETE' then
        v_request_id := old.accommodation_request_id;
    else
        v_request_id := new.accommodation_request_id;
    end if;

    perform public.sync_accommodation_realization_status(v_request_id);

    if tg_op = 'UPDATE'
       and old.accommodation_request_id is distinct from new.accommodation_request_id then
        perform public.sync_accommodation_realization_status(
            old.accommodation_request_id
        );
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;

    return new;
end;
$$;

drop trigger if exists accommodation_realizations_sync_status
    on public.accommodation_realizations;
create trigger accommodation_realizations_sync_status
after insert or update of amount, accommodation_request_id or delete
on public.accommodation_realizations
for each row execute function public.sync_accommodation_status_from_realization();

create or replace function public.sync_business_trip_accommodation_status_from_realization()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_business_trip_id uuid;
    v_accommodation_request_id uuid;
begin
    if tg_op = 'DELETE' then
        v_business_trip_id := old.business_trip_id;
    else
        v_business_trip_id := new.business_trip_id;
    end if;

    for v_accommodation_request_id in
        select accommodation.id
        from public.accommodation_requests as accommodation
        where accommodation.business_trip_id = v_business_trip_id
           or (
               lower(coalesce(accommodation.source_module, '')) = 'business_trip'
               and accommodation.source_id = v_business_trip_id
           )
    loop
        perform public.sync_accommodation_realization_status(
            v_accommodation_request_id
        );
    end loop;

    if tg_op = 'UPDATE'
       and old.business_trip_id is distinct from new.business_trip_id then
        for v_accommodation_request_id in
            select accommodation.id
            from public.accommodation_requests as accommodation
            where accommodation.business_trip_id = old.business_trip_id
               or (
                   lower(coalesce(accommodation.source_module, '')) = 'business_trip'
                   and accommodation.source_id = old.business_trip_id
               )
        loop
            perform public.sync_accommodation_realization_status(
                v_accommodation_request_id
            );
        end loop;
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;

    return new;
end;
$$;

drop trigger if exists business_trip_agenda_realizations_sync_accommodation_status
    on public.business_trip_agenda_realizations;
create trigger business_trip_agenda_realizations_sync_accommodation_status
after insert or update of realized_amount, business_trip_id or delete
on public.business_trip_agenda_realizations
for each row execute function public.sync_business_trip_accommodation_status_from_realization();

-- Repair existing requests such as Arif Syaiful Rachman's BT-26093001,
-- whose receipts already exceed the approved amount but whose status is still
-- open. Rejected, pending, and already terminal requests are intentionally
-- left unchanged by the helper function.
do $$
declare
    v_request_id uuid;
begin
    for v_request_id in
        select id
        from public.accommodation_requests
        where lower(coalesce(status, 'pending')) in (
            'approved',
            'realization_process',
            'partial_realized'
        )
    loop
        perform public.sync_accommodation_realization_status(v_request_id);
    end loop;
end;
$$;

notify pgrst, 'reload schema';
