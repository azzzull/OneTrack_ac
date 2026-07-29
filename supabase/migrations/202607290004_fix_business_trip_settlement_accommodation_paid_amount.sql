create or replace function public.calculate_business_trip_settlement(
    p_business_trip_id uuid
)
returns table (
    business_trip_id uuid,
    requested_amount numeric,
    disbursed_amount numeric,
    total_realization_amount numeric,
    settlement_difference numeric,
    settlement_status text
)
language sql
security definer
set search_path = public
as $$
    with accommodation_paid as (
        select
            coalesce(ar.business_trip_id, ar.source_id) as business_trip_id,
            max(
                case
                    when lower(coalesce(ar.status, '')) in (
                        'realization_process',
                        'partial_realized',
                        'realized'
                    )
                    or (
                        lower(coalesce(ar.status, '')) = 'approved'
                        and nullif(trim(coalesce(ar.transfer_proof_url, '')), '') is not null
                    )
                    then coalesce(ar.approved_amount, 0)
                    else 0
                end
            )::numeric(14,2) as paid_amount
        from public.accommodation_requests ar
        where ar.business_trip_id = p_business_trip_id
           or (ar.source_module = 'business_trip' and ar.source_id = p_business_trip_id)
        group by coalesce(ar.business_trip_id, ar.source_id)
    ),
    totals as (
        select
            bt.id,
            coalesce(bt.requested_amount, 0)::numeric(14,2) as requested_amount,
            greatest(
                coalesce(ap.paid_amount, 0),
                coalesce(sum(distinct d.amount), 0)
            )::numeric(14,2) as disbursed_amount,
            coalesce(sum(r.realized_amount), 0)::numeric(14,2) as total_realization_amount
        from public.business_trips bt
        left join accommodation_paid ap on ap.business_trip_id = bt.id
        left join public.business_trip_advance_disbursements d
          on d.business_trip_id = bt.id
        left join public.business_trip_agenda_realizations r
          on r.business_trip_id = bt.id
        where bt.id = p_business_trip_id
          and public.can_access_business_trip(bt.id, auth.uid())
        group by bt.id, bt.requested_amount, ap.paid_amount
    )
    select
        id,
        requested_amount,
        disbursed_amount,
        total_realization_amount,
        (disbursed_amount - total_realization_amount)::numeric(14,2),
        case
            when (disbursed_amount - total_realization_amount) > 0 then 'pending_refund'
            when (disbursed_amount - total_realization_amount) < 0 then 'pending_additional_payment'
            else 'not_required'
        end
    from totals;
$$;

with recalculated as (
    select
        bt.id,
        coalesce(sum(r.realized_amount), 0)::numeric(14,2) as total_realization_amount,
        (
            greatest(
                coalesce(max(
                    case
                        when lower(coalesce(ar.status, '')) in (
                            'realization_process',
                            'partial_realized',
                            'realized'
                        )
                        or (
                            lower(coalesce(ar.status, '')) = 'approved'
                            and nullif(trim(coalesce(ar.transfer_proof_url, '')), '') is not null
                        )
                        then coalesce(ar.approved_amount, 0)
                        else 0
                    end
                ), 0),
                coalesce(sum(distinct d.amount), 0)
            ) - coalesce(sum(r.realized_amount), 0)
        )::numeric(14,2) as settlement_difference
    from public.business_trips bt
    left join public.accommodation_requests ar
      on ar.business_trip_id = bt.id
      or (ar.source_module = 'business_trip' and ar.source_id = bt.id)
    left join public.business_trip_advance_disbursements d
      on d.business_trip_id = bt.id
    left join public.business_trip_agenda_realizations r
      on r.business_trip_id = bt.id
    where bt.status in ('pending_refund', 'pending_additional_payment')
    group by bt.id
),
targets as (
    select
        id,
        total_realization_amount,
        settlement_difference,
        case
            when settlement_difference > 0 then 'pending_refund'
            when settlement_difference < 0 then 'pending_additional_payment'
            else 'completed'
        end as next_status,
        case
            when settlement_difference > 0 then 'pending_refund'
            when settlement_difference < 0 then 'pending_additional_payment'
            else 'not_required'
        end as next_settlement_status
    from recalculated
)
update public.business_trips bt
set
    status = targets.next_status,
    total_realization_amount = targets.total_realization_amount,
    settlement_difference = targets.settlement_difference,
    settlement_status = targets.next_settlement_status,
    completed_at = case
        when targets.next_status = 'completed' then coalesce(bt.completed_at, now())
        else bt.completed_at
    end,
    settlement_completed_at = case
        when targets.next_status = 'completed' then coalesce(bt.settlement_completed_at, now())
        else bt.settlement_completed_at
    end,
    updated_at = now()
from targets
where bt.id = targets.id
  and (
      bt.status is distinct from targets.next_status
      or bt.total_realization_amount is distinct from targets.total_realization_amount
      or bt.settlement_difference is distinct from targets.settlement_difference
      or bt.settlement_status is distinct from targets.next_settlement_status
  );

grant execute on function public.calculate_business_trip_settlement(uuid) to authenticated;

notify pgrst, 'reload schema';
