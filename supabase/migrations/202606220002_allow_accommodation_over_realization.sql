-- Treat approved accommodation amount as a cash advance, not a realization cap.
-- Realization may exceed the approved amount; the excess is handled as settlement
-- in the application report.

create or replace function public.validate_accommodation_realization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_status text;
    v_approved_amount numeric(14,2);
begin
    select status, approved_amount
    into v_status, v_approved_amount
    from public.accommodation_requests
    where id = new.accommodation_request_id;

    if v_status not in ('approved', 'realization_process', 'partial_realized') then
        raise exception 'Realisasi hanya boleh dibuat untuk pengajuan yang sudah approved.';
    end if;

    if v_approved_amount is null then
        raise exception 'Approved amount belum tersedia.';
    end if;

    return new;
end;
$$;
