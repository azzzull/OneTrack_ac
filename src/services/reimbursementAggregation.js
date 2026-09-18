export const REIMBURSEMENT_PAYMENT_STATUSES = ["unpaid", "paid"];

const REIMBURSEMENT_STATUSES = new Set([
    "pending",
    "approved",
    "rejected",
]);

const toFiniteAmount = (value, fieldName, reimbursementId) => {
    const amount = Number(value ?? 0);
    if (!Number.isFinite(amount) || amount < 0) {
        throw new Error(
            `Nominal ${fieldName} reimbursement ${reimbursementId ?? "-"} tidak valid.`,
        );
    }
    return amount;
};

export const normalizePaymentStatus = (value) =>
    String(value ?? "unpaid")
        .trim()
        .toLowerCase() === "paid"
        ? "paid"
        : "unpaid";

export const validateApprovedAmount = ({ claimAmount, approvedAmount }) => {
    const claim = toFiniteAmount(claimAmount, "klaim");
    const approved = toFiniteAmount(approvedAmount, "disetujui");

    if (claim <= 0) {
        throw new Error("Nominal klaim harus lebih dari 0.");
    }
    if (approved <= 0) {
        throw new Error("Nominal disetujui harus lebih dari 0.");
    }
    if (approved > claim) {
        throw new Error(
            "Nominal disetujui tidak boleh melebihi nominal klaim reimbursement.",
        );
    }

    return approved;
};

export const assertReimbursementAggregate = ({
    totalReimburse,
    approvedAmount,
    unpaidAmount,
}) => {
    const total = toFiniteAmount(totalReimburse, "total reimbursement");
    const approved = toFiniteAmount(approvedAmount, "total disetujui");
    const unpaid = toFiniteAmount(unpaidAmount, "total belum dibayar");

    if (approved > total) {
        throw new Error(
            "Data reimbursement tidak konsisten: total disetujui melebihi total reimbursement.",
        );
    }
    if (unpaid > approved) {
        throw new Error(
            "Data reimbursement tidak konsisten: total belum dibayar melebihi total disetujui.",
        );
    }

    return { totalReimburse: total, approvedAmount: approved, unpaidAmount: unpaid };
};

export const validateReimbursementItem = (item) => {
    const reimbursementId = item?.id;
    const status = String(item?.status ?? "").trim().toLowerCase();
    const claimAmount = toFiniteAmount(
        item?.claim_amount,
        "klaim",
        reimbursementId,
    );
    const rawApprovedAmount = toFiniteAmount(
        item?.approved_amount,
        "disetujui",
        reimbursementId,
    );
    const paymentStatus = normalizePaymentStatus(item?.payment_status);

    if (!REIMBURSEMENT_STATUSES.has(status)) {
        throw new Error(
            `Status reimbursement ${reimbursementId ?? "-"} tidak valid.`,
        );
    }
    if (claimAmount <= 0) {
        throw new Error(
            `Nominal klaim reimbursement ${reimbursementId ?? "-"} harus lebih dari 0.`,
        );
    }

    if (status === "approved") {
        const approvedAmount = validateApprovedAmount({
            claimAmount,
            approvedAmount: rawApprovedAmount,
        });
        if (paymentStatus === "paid" && !item?.transfer_proof_url) {
            throw new Error(
                `Reimbursement ${reimbursementId ?? "-"} berstatus paid tanpa bukti transfer.`,
            );
        }
        return {
            claimAmount,
            approvedAmount,
            unpaidAmount: paymentStatus === "paid" ? 0 : approvedAmount,
            paymentStatus,
            status,
        };
    }

    if (rawApprovedAmount !== 0) {
        throw new Error(
            `Reimbursement ${reimbursementId ?? "-"} yang belum disetujui tidak boleh memiliki nominal disetujui.`,
        );
    }
    if (paymentStatus === "paid") {
        throw new Error(
            `Reimbursement ${reimbursementId ?? "-"} tidak dapat berstatus paid sebelum disetujui.`,
        );
    }

    return {
        claimAmount,
        approvedAmount: 0,
        unpaidAmount: 0,
        paymentStatus,
        status,
    };
};

export const deriveReimbursementGroupStatus = (items) => {
    const statuses = new Set(items.map((item) => item.status));
    if (statuses.size === 1) return items[0]?.status ?? "pending";
    if (statuses.size === 3) return "partial_reviewed";
    if (statuses.has("pending") && statuses.has("approved")) {
        return "partial_approved";
    }
    if (statuses.has("approved") && statuses.has("rejected")) {
        return "partial_processed";
    }
    return "partial_reviewed";
};

export const summarizeReimbursements = (items) => {
    const summary = {
        totalReimburse: 0,
        approvedAmount: 0,
        unpaidAmount: 0,
        pendingAmount: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        paid: 0,
        unpaid: 0,
    };

    for (const item of items) {
        const validated = validateReimbursementItem(item);
        summary.totalReimburse += validated.claimAmount;
        summary.approvedAmount += validated.approvedAmount;
        summary.unpaidAmount += validated.unpaidAmount;
        summary[validated.status] += 1;
        if (validated.status === "pending") {
            summary.pendingAmount += validated.claimAmount;
        }
        if (validated.status === "approved") {
            summary[validated.paymentStatus] += 1;
        }
    }

    return {
        ...summary,
        ...assertReimbursementAggregate(summary),
    };
};

export const groupReimbursementsByRequester = (items) => {
    const groups = new Map();

    for (const item of items) {
        const id = item.requester_id || "unknown";
        const group = groups.get(id) ?? {
            id,
            requester: item.requester,
            items: [],
        };
        group.items.push(item);
        groups.set(id, group);
    }

    const sortPriority = {
        pending: 0,
        partial_approved: 1,
        partial_reviewed: 1,
        partial_processed: 1,
        approved: 2,
        rejected: 3,
    };

    return [...groups.values()]
        .map((group) => {
            const itemsByNewest = [...group.items].sort(
                (a, b) =>
                    new Date(b.created_at ?? b.transaction_date ?? 0) -
                    new Date(a.created_at ?? a.transaction_date ?? 0),
            );
            const status = deriveReimbursementGroupStatus(itemsByNewest);
            const totals = summarizeReimbursements(itemsByNewest);

            return {
                ...group,
                items: itemsByNewest,
                status,
                filterStatus: status.startsWith("partial_")
                    ? "partial"
                    : status,
                latestAt:
                    itemsByNewest[0]?.created_at ??
                    itemsByNewest[0]?.transaction_date ??
                    null,
                ...totals,
                priority: sortPriority[status] ?? sortPriority.pending,
            };
        })
        .sort(
            (a, b) =>
                a.priority - b.priority ||
                new Date(b.latestAt ?? 0) - new Date(a.latestAt ?? 0),
        );
};
