import supabase from "../supabaseClient";
import { compressJobPhotoFile } from "./jobPhotoService";
import {
    NOTIFICATION_EVENT_TYPES,
    notifyEvent,
} from "./notificationEvents";

export const LOAN_BUCKET = "loans";

export const LOAN_STATUSES = ["pending", "approved", "rejected"];

export const LOAN_STATUS_LABELS = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
};

export const LOAN_STATUS_STYLES = {
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-emerald-100 text-emerald-700",
    rejected: "bg-red-100 text-red-700",
};

export const LOAN_REPAYMENT_METHOD_LABELS = {
    transfer: "Transfer ke Perusahaan",
    salary_deduction: "Potong Gaji",
    cash: "Tunai",
    other: "Lainnya",
};

export const formatCurrency = (value) =>
    new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
    }).format(Number(value ?? 0));

export const getDisplayName = (profile) =>
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
    profile?.name ||
    profile?.email ||
    "-";

export const normalizeLoanStatus = (value) => {
    const status = String(value ?? "pending")
        .trim()
        .toLowerCase()
        .replaceAll("-", "_")
        .replaceAll(" ", "_");
    return LOAN_STATUSES.includes(status) ? status : "pending";
};

const loadProfileMap = async (ids) => {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (!uniqueIds.length) return {};

    const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, name, email, role")
        .in("id", uniqueIds);

    if (error) {
        console.warn("[Loan] profile lookup skipped:", error.message);
        return {};
    }

    return (data ?? []).reduce((acc, profile) => {
        acc[profile.id] = profile;
        return acc;
    }, {});
};

const loadProfileById = async (id) => {
    if (!id) return null;
    const profileMap = await loadProfileMap([id]);
    return profileMap[id] ?? null;
};

export const loadLoans = async ({ role, userId } = {}) => {
    let query = supabase
        .from("loans")
        .select("*, loan_attachments(*), loan_repayments(*)")
        .order("created_at", { ascending: false });

    if (role === "technician" && userId) {
        query = query.eq("requester_id", userId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = data ?? [];
    const profileMap = await loadProfileMap([
        ...rows.map((row) => row.requester_id),
        ...rows.map((row) => row.approved_by),
        ...rows.flatMap((row) =>
            (row.loan_repayments ?? []).map((repayment) => repayment.created_by),
        ),
    ]);

    return rows.map((row) => {
        const repayments = (row.loan_repayments ?? [])
            .sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0))
            .map((repayment) => ({
                ...repayment,
                creator: profileMap[repayment.created_by] ?? null,
            }));
        const paidAmount = repayments.reduce(
            (sum, repayment) => sum + Number(repayment.amount ?? 0),
            0,
        );
        const approvedAmount = Number(row.approved_amount ?? 0);

        return {
            ...row,
            status: normalizeLoanStatus(row.status),
            attachments: (row.loan_attachments ?? []).sort(
                (a, b) => new Date(a.created_at ?? 0) - new Date(b.created_at ?? 0),
            ),
            repayments,
            paid_amount: paidAmount,
            remaining_amount: Math.max(approvedAmount - paidAmount, 0),
            requester: profileMap[row.requester_id] ?? null,
            approver: profileMap[row.approved_by] ?? null,
        };
    });
};

export const loadLoanRequesters = async () => {
    const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, name, email, role")
        .in("role", ["technician", "admin", "management"])
        .order("first_name", { ascending: true });

    if (error) throw error;
    return data ?? [];
};

export const createLoan = async ({
    requesterId,
    neededDate,
    loanAmount,
    description,
}) => {
    const loan = {
        id: crypto.randomUUID(),
        requester_id: requesterId,
        needed_date: neededDate,
        loan_amount: Number(loanAmount),
        description,
        status: "pending",
    };

    const { error } = await supabase
        .from("loans")
        .insert(loan);

    if (error) throw error;

    const requester = await loadProfileById(requesterId);
    await notifyEvent(NOTIFICATION_EVENT_TYPES.LOAN_REQUESTED, {
        loan_id: loan.id,
        requester_id: requesterId,
        requester_name: getDisplayName(requester),
        amount: loan.loan_amount,
    });

    return loan;
};

export const uploadLoanFile = async ({
    file,
    loanId,
    kind,
}) => {
    if (!file) throw new Error("File belum dipilih.");
    if (!loanId) throw new Error("ID loan tidak valid.");

    const fileToUpload = String(file?.type ?? "").startsWith("image/")
        ? await compressJobPhotoFile(file, {
              maxBytes: 180 * 1024,
              maxDimension: 1600,
              minQuality: 0.45,
          })
        : file;
    const extension =
        String(fileToUpload?.type ?? "").startsWith("image/")
            ? "jpg"
            : fileToUpload.name?.split(".").pop() || "bin";
    const folder =
        kind === "transfer"
            ? "transfer-proof"
            : kind === "repayment"
              ? "repayments"
              : "misc";
    const fileName = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const path = `loans/${loanId}/${folder}/${fileName}`;

    const { error } = await supabase.storage
        .from(LOAN_BUCKET)
        .upload(path, fileToUpload, { upsert: false });

    if (error) throw error;

    const { data } = supabase.storage
        .from(LOAN_BUCKET)
        .getPublicUrl(path);

    return {
        url: data.publicUrl,
        type: fileToUpload.type || file.type || "",
        name: fileToUpload.name || file.name || fileName,
    };
};

export const approveLoan = async ({
    loan,
    approvedAmount,
    transferProofUrl,
    approvalNote,
    approvedBy,
}) => {
    if (!transferProofUrl) throw new Error("Bukti transfer wajib diupload.");

    const { data, error } = await supabase
        .from("loans")
        .update({
            approved_amount: Number(approvedAmount),
            transfer_proof_url: transferProofUrl,
            approval_note: approvalNote || null,
            approved_by: approvedBy,
            approved_at: new Date().toISOString(),
            rejection_reason: null,
            status: "approved",
        })
        .eq("id", loan.id)
        .select()
        .single();

    if (error) throw error;

    await notifyEvent(NOTIFICATION_EVENT_TYPES.LOAN_APPROVED, {
        loan_id: data.id,
        requester_id: data.requester_id,
        amount: data.loan_amount,
        approved_amount: data.approved_amount,
    });

    return data;
};

export const rejectLoan = async ({
    loan,
    rejectionReason,
    approvedBy,
}) => {
    const { data, error } = await supabase
        .from("loans")
        .update({
            status: "rejected",
            rejection_reason: rejectionReason,
            approved_by: approvedBy,
            approved_at: new Date().toISOString(),
            approved_amount: null,
            approval_note: null,
            transfer_proof_url: null,
        })
        .eq("id", loan.id)
        .select()
        .single();

    if (error) throw error;

    await notifyEvent(NOTIFICATION_EVENT_TYPES.LOAN_REJECTED, {
        loan_id: data.id,
        requester_id: data.requester_id,
        amount: data.loan_amount,
        rejection_note: rejectionReason,
    });

    return data;
};

export const addLoanRepayment = async ({
    loan,
    amount,
    method,
    proofUrl,
    note,
    createdBy,
}) => {
    if (!loan?.id) throw new Error("Pinjaman tidak valid.");

    const paymentAmount = Number(amount);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
        throw new Error("Nominal pembayaran wajib lebih dari 0.");
    }

    const remainingAmount = Number(loan.remaining_amount ?? loan.approved_amount ?? 0);
    if (paymentAmount > remainingAmount) {
        throw new Error("Nominal pembayaran melebihi sisa hutang.");
    }

    const repaymentMethod = method || "transfer";
    if (repaymentMethod === "transfer" && !proofUrl) {
        throw new Error("Bukti transfer wajib diupload.");
    }

    const { data, error } = await supabase
        .from("loan_repayments")
        .insert({
            loan_id: loan.id,
            amount: paymentAmount,
            method: repaymentMethod,
            proof_url: proofUrl || null,
            note: note || null,
            created_by: createdBy,
        })
        .select()
        .single();

    if (error) throw error;
    return data;
};

export const addUniversalLoanRepayment = async ({
    loans,
    amount,
    method,
    proofUrl,
    note,
    createdBy,
}) => {
    const paymentAmount = Number(amount);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
        throw new Error("Nominal pembayaran wajib lebih dari 0.");
    }

    const repaymentMethod = method || "transfer";
    if (repaymentMethod === "transfer" && !proofUrl) {
        throw new Error("Bukti transfer wajib diupload.");
    }

    const outstandingLoans = (loans ?? [])
        .filter(
            (loan) =>
                loan.status === "approved" &&
                Number(loan.remaining_amount ?? 0) > 0,
        )
        .sort((a, b) => {
            const aDate = new Date(a.approved_at ?? a.created_at ?? 0);
            const bDate = new Date(b.approved_at ?? b.created_at ?? 0);
            return aDate - bDate;
        });

    const totalRemaining = outstandingLoans.reduce(
        (sum, loan) => sum + Number(loan.remaining_amount ?? 0),
        0,
    );
    if (paymentAmount > totalRemaining) {
        throw new Error("Nominal pembayaran melebihi total sisa hutang.");
    }

    let remainingPayment = paymentAmount;
    const rows = [];
    for (const loan of outstandingLoans) {
        if (remainingPayment <= 0) break;

        const allocationAmount = Math.min(
            remainingPayment,
            Number(loan.remaining_amount ?? 0),
        );
        rows.push({
            loan_id: loan.id,
            amount: allocationAmount,
            method: repaymentMethod,
            proof_url: proofUrl || null,
            note: note || null,
            created_by: createdBy,
        });
        remainingPayment -= allocationAmount;
    }

    const { data, error } = await supabase
        .from("loan_repayments")
        .insert(rows)
        .select();

    if (error) throw error;
    return data ?? [];
};
