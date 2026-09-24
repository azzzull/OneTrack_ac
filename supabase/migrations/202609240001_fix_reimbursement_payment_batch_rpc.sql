-- `id` and `requester_id` are also output-column names of this RPC. Always
-- qualify table columns so PostgreSQL does not resolve them ambiguously.
create or replace function public.mark_reimbursement_batch_paid(
    p_reimbursement_ids uuid[],
    p_transfer_proof_url text
)
returns table (
    id uuid,
    batch_number bigint,
    requester_id uuid,
    total_amount numeric,
    transfer_proof_url text,
    paid_by uuid,
    paid_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_actor_id uuid := auth.uid();
    v_role text;
    v_item_count integer;
    v_requester_count integer;
    v_requester_id uuid;
    v_total_amount numeric(14, 2);
    v_paid_at timestamptz := now();
    v_batch public.reimbursement_payment_batches%rowtype;
begin
    if v_actor_id is null then
        raise exception 'Sesi pengguna tidak ditemukan.';
    end if;
    if coalesce(cardinality(p_reimbursement_ids), 0) = 0 then
        raise exception 'Pilih minimal satu reimbursement untuk dibayar.';
    end if;
    if cardinality(p_reimbursement_ids) <> (
        select count(distinct reimbursement_id)
        from unnest(p_reimbursement_ids) as selected(reimbursement_id)
    ) then
        raise exception 'Daftar reimbursement pembayaran memuat item duplikat.';
    end if;
    if coalesce(btrim(p_transfer_proof_url), '') = '' then
        raise exception 'Bukti transfer wajib diupload.';
    end if;

    select lower(coalesce(profile.role, ''))
    into v_role
    from public.profiles as profile
    where profile.id = v_actor_id;
    if coalesce(v_role, '') not in ('admin', 'management') then
        raise exception 'Hanya admin atau management yang dapat mencatat pembayaran reimbursement.';
    end if;

    -- Lock selected rows before validating, so two payment attempts cannot pay
    -- the same reimbursement or create overlapping batches.
    perform 1
    from public.reimbursements as reimbursement
    where reimbursement.id = any(p_reimbursement_ids)
    order by reimbursement.id
    for update;

    select
        count(*),
        count(distinct reimbursement.requester_id),
        coalesce(sum(reimbursement.approved_amount), 0)
    into v_item_count, v_requester_count, v_total_amount
    from public.reimbursements as reimbursement
    where reimbursement.id = any(p_reimbursement_ids)
      and reimbursement.status = 'approved'
      and reimbursement.payment_status = 'unpaid';

    if v_item_count <> cardinality(p_reimbursement_ids) then
        raise exception 'Sebagian reimbursement sudah berubah status atau tidak dapat dibayar. Muat ulang data lalu coba lagi.';
    end if;
    if v_requester_count <> 1 then
        raise exception 'Satu batch pembayaran hanya boleh berisi reimbursement dari satu pengaju.';
    end if;

    select reimbursement.requester_id
    into v_requester_id
    from public.reimbursements as reimbursement
    where reimbursement.id = any(p_reimbursement_ids)
    limit 1;

    insert into public.reimbursement_payment_batches (
        requester_id,
        total_amount,
        transfer_proof_url,
        paid_by,
        paid_at
    )
    values (
        v_requester_id,
        v_total_amount,
        p_transfer_proof_url,
        v_actor_id,
        v_paid_at
    )
    returning * into v_batch;

    update public.reimbursements as reimbursement
    set payment_status = 'paid',
        transfer_proof_url = p_transfer_proof_url,
        payment_batch_id = v_batch.id,
        paid_by = v_actor_id,
        paid_at = v_paid_at
    where reimbursement.id = any(p_reimbursement_ids)
      and reimbursement.status = 'approved'
      and reimbursement.payment_status = 'unpaid';

    return query
    select
        v_batch.id,
        v_batch.batch_number,
        v_batch.requester_id,
        v_batch.total_amount,
        v_batch.transfer_proof_url,
        v_batch.paid_by,
        v_batch.paid_at;
end;
$$;

revoke all on function public.mark_reimbursement_batch_paid(uuid[], text) from public;
grant execute on function public.mark_reimbursement_batch_paid(uuid[], text)
    to authenticated;

notify pgrst, 'reload schema';
