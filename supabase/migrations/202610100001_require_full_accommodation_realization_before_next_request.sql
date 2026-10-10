-- A status of `realized` is only terminal for a manual accommodation request
-- when its approved amount has actually been fully realized. This prevents a
-- partially settled request from being bypassed by submitting another request.
create or replace function public.validate_active_accommodation_submission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    -- Accommodation created by an approved Business Trip is guarded by the
    -- Business Trip submission rule. Manual requests remain limited to one
    -- open settlement for each technician.
    if new.business_trip_id is not null
       or lower(coalesce(new.source_module, '')) = 'business_trip' then
        return new;
    end if;

    perform pg_advisory_xact_lock(
        hashtextextended(new.technician_id::text, 0)
    );

    if exists (
        select 1
        from public.accommodation_requests as prior_request
        where prior_request.technician_id = new.technician_id
          and prior_request.id is distinct from new.id
          and not (
              lower(coalesce(prior_request.status, 'pending')) = 'rejected'
              or (
                  lower(coalesce(prior_request.status, 'pending')) = 'realized'
                  and (
                      exists (
                          select 1
                          from public.business_trips as trip
                          where trip.status = 'completed'
                            and (
                                trip.id = prior_request.business_trip_id
                                or (
                                    lower(coalesce(prior_request.source_module, '')) = 'business_trip'
                                    and prior_request.source_id = trip.id
                                )
                            )
                      )
                      or (
                          coalesce(prior_request.approved_amount, 0) > 0
                          and coalesce((
                              select sum(realization.amount)
                              from public.accommodation_realizations as realization
                              where realization.accommodation_request_id = prior_request.id
                          ), 0) >= prior_request.approved_amount
                      )
                  )
              )
          )
    ) then
        raise exception
            'Pengajuan akomodasi sebelumnya belum direalisasikan sepenuhnya.';
    end if;

    return new;
end;
$$;

drop trigger if exists accommodation_requests_validate_active_submission
    on public.accommodation_requests;
create trigger accommodation_requests_validate_active_submission
before insert on public.accommodation_requests
for each row execute function public.validate_active_accommodation_submission();

notify pgrst, 'reload schema';
