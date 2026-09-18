-- Approval and payment are independent states.  The reimbursement row remains
-- the single source of truth for both the individual and grouped views.
alter table public.reimbursements
    add column if not exists payment_status text,
    add column if not exists paid_by uuid references public.profiles(id) on delete set null,
    add column if not exists paid_at timestamptz;

create table if not exists public.reimbursement_data_corrections (
    reimbursement_id uuid not null references public.reimbursements(id) on delete restrict,
    correction_type text not null,
    previous_claim_amount numeric(14,2),
    previous_approved_amount numeric(14,2),
    corrected_approved_amount numeric(14,2),
    corrected_at timestamptz not null default now(),
    note text not null,
    primary key (reimbursement_id, correction_type)
);

-- Replace the legacy trigger, which incorrectly coupled approval to a transfer
-- proof and allowed an approval amount above the original claim.
create or replace function public.validate_reimbursement_update()
returns trigger
language plpgsql
as $$
declare
    is_integrity_repair boolean := coalesce(
        current_setting('app.reimbursement_integrity_repair', true),
        ''
    ) = 'true';
begin
    if new.requester_id <> old.requester_id
        or new.transaction_date <> old.transaction_date
        or new.claim_amount <> old.claim_amount
        or new.description <> old.description
        or new.created_at <> old.created_at then
        raise exception 'Data pengajuan reimburse tidak boleh diubah setelah submit.';
    end if;

    -- This flag is set only by the one-time, audited repair below. It lets the
    -- migration repair legacy rows that the previous trigger allowed.
    if is_integrity_repair then
        return new;
    end if;

    if new.approved_amount is not null
        and (new.approved_amount <= 0 or new.approved_amount > new.claim_amount) then
        raise exception 'Nominal disetujui harus lebih dari 0 dan tidak boleh melebihi nominal klaim.';
    end if;

    if new.status = 'pending' then
        if new.approved_amount is not null
            or new.approved_by is not null
            or new.approved_at is not null
            or new.transfer_proof_url is not null
            or new.paid_by is not null
            or new.paid_at is not null
            or new.payment_status <> 'unpaid' then
            raise exception 'Reimbursement pending tidak boleh memiliki data approval atau pembayaran.';
        end if;
        return new;
    end if;

    if new.status = 'rejected' then
        if coalesce(new.rejection_reason, '') = '' then
            raise exception 'Alasan penolakan wajib diisi.';
        end if;
        if new.approved_by is null or new.approved_at is null then
            raise exception 'Data penolakan tidak lengkap.';
        end if;
        if new.approved_amount is not null
            or new.approval_note is not null
            or new.transfer_proof_url is not null
            or new.paid_by is not null
            or new.paid_at is not null
            or new.payment_status <> 'unpaid' then
            raise exception 'Reimbursement ditolak tidak boleh memiliki data pembayaran.';
        end if;
        return new;
    end if;

    if new.status <> 'approved' then
        raise exception 'Status reimburse tidak valid.';
    end if;

    if new.approved_amount is null
        or new.approved_amount <= 0
        or new.approved_amount > new.claim_amount then
        raise exception 'Nominal disetujui wajib lebih dari 0 dan tidak boleh melebihi nominal klaim.';
    end if;
    if new.approved_by is null or new.approved_at is null then
        raise exception 'Data approval tidak lengkap.';
    end if;

    if old.status = 'pending' then
        if new.payment_status <> 'unpaid'
            or new.transfer_proof_url is not null
            or new.paid_by is not null
            or new.paid_at is not null then
            raise exception 'Approval dan pembayaran reimbursement harus diproses terpisah.';
        end if;
        return new;
    end if;

    if old.status <> 'approved' and not is_integrity_repair then
        raise exception 'Reimburse yang sudah diproses tidak dapat diubah.';
    end if;

    if new.approved_amount is distinct from old.approved_amount
        or new.approval_note is distinct from old.approval_note
        or new.approved_by is distinct from old.approved_by
        or new.approved_at is distinct from old.approved_at
        or new.rejection_reason is distinct from old.rejection_reason
        or new.status is distinct from old.status then
        raise exception 'Data approval reimbursement yang sudah final tidak dapat diubah.';
    end if;

    if old.payment_status <> 'unpaid' then
        raise exception 'Reimbursement yang sudah dibayar tidak dapat diubah.';
    end if;
    if new.payment_status <> 'paid'
        or coalesce(new.transfer_proof_url, '') = ''
        or new.paid_by is null
        or new.paid_at is null then
        raise exception 'Pembayaran reimbursement wajib memiliki status paid, bukti transfer, dan data pembayaran.';
    end if;

    return new;
end;
$$;

-- Old approved records required a transfer proof in the same transaction, so
-- that proof is the only reliable historical evidence for this one-time paid
-- backfill. New approvals are always created as unpaid.
do $$
begin
    perform set_config('app.reimbursement_integrity_repair', 'true', true);

    update public.reimbursements
    set payment_status = case
            when status = 'approved' and coalesce(transfer_proof_url, '') <> '' then 'paid'
            else 'unpaid'
        end,
        paid_by = case
            when status = 'approved' and coalesce(transfer_proof_url, '') <> '' then approved_by
            else null
        end,
        paid_at = case
            when status = 'approved' and coalesce(transfer_proof_url, '') <> '' then approved_at
            else null
        end
    where payment_status is null;

    insert into public.reimbursement_data_corrections (
        reimbursement_id,
        correction_type,
        previous_claim_amount,
        previous_approved_amount,
        corrected_approved_amount,
        note
    )
    select
        id,
        'approved_amount_exceeded_claim',
        claim_amount,
        approved_amount,
        claim_amount,
        'Nilai approval melebihi nilai klaim. Dikoreksi ke nilai klaim asli; nilai sebelumnya disimpan untuk audit.'
    from public.reimbursements
    where approved_amount > claim_amount
    on conflict (reimbursement_id, correction_type) do nothing;

    update public.reimbursements r
    set approved_amount = r.claim_amount
    from public.reimbursement_data_corrections c
    where c.reimbursement_id = r.id
      and c.correction_type = 'approved_amount_exceeded_claim'
      and r.approved_amount > r.claim_amount;

    insert into public.reimbursement_data_corrections (
        reimbursement_id,
        correction_type,
        previous_claim_amount,
        previous_approved_amount,
        corrected_approved_amount,
        note
    )
    select
        id,
        'stale_approved_amount_on_non_approved_status',
        claim_amount,
        approved_amount,
        null,
        'Nilai approval tersisa pada reimbursement yang tidak berstatus approved. Nilai dihapus agar status menjadi sumber kebenaran.'
    from public.reimbursements
    where status <> 'approved'
      and approved_amount is not null
    on conflict (reimbursement_id, correction_type) do nothing;

    update public.reimbursements r
    set approved_amount = null,
        approval_note = null,
        transfer_proof_url = null,
        paid_by = null,
        paid_at = null,
        payment_status = 'unpaid'
    from public.reimbursement_data_corrections c
    where c.reimbursement_id = r.id
      and c.correction_type = 'stale_approved_amount_on_non_approved_status'
      and r.status <> 'approved';
end;
$$;

alter table public.reimbursements
    alter column payment_status set default 'unpaid',
    alter column payment_status set not null;

alter table public.reimbursements
    drop constraint if exists reimbursements_approved_amount_within_claim_amount,
    drop constraint if exists reimbursements_payment_status_check,
    add constraint reimbursements_approved_amount_within_claim_amount
        check (
            approved_amount is null
            or (approved_amount > 0 and approved_amount <= claim_amount)
        ),
    add constraint reimbursements_payment_status_check
        check (payment_status in ('unpaid', 'paid'));

drop policy if exists "Allowed users can create own reimbursements" on public.reimbursements;
create policy "Allowed users can create own reimbursements"
on public.reimbursements
for insert
to authenticated
with check (
    requester_id = auth.uid()
    and status = 'pending'
    and approved_amount is null
    and approved_by is null
    and approved_at is null
    and transfer_proof_url is null
    and payment_status = 'unpaid'
    and paid_by is null
    and paid_at is null
);

notify pgrst, 'reload schema';
