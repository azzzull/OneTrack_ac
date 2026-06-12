import supabase from "../supabaseClient";
import { compressJobPhotoFile } from "./jobPhotoService";
import {
    NOTIFICATION_EVENT_TYPES,
    notifyEvent,
} from "./notificationEvents";

export const REIMBURSEMENT_BUCKET = "reimbursements";

export const REIMBURSEMENT_STATUSES = ["pending", "approved", "rejected"];

export const REIMBURSEMENT_STATUS_LABELS = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
};

export const REIMBURSEMENT_STATUS_STYLES = {
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-emerald-100 text-emerald-700",
    rejected: "bg-red-100 text-red-700",
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

export const normalizeReimbursementStatus = (value) => {
    const status = String(value ?? "pending")
        .trim()
        .toLowerCase()
        .replaceAll("-", "_")
        .replaceAll(" ", "_");
    return REIMBURSEMENT_STATUSES.includes(status) ? status : "pending";
};

const loadProfileMap = async (ids) => {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (!uniqueIds.length) return {};

    const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, name, email, role")
        .in("id", uniqueIds);

    if (error) {
        console.warn("[Reimbursement] profile lookup skipped:", error.message);
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

export const loadReimbursements = async ({ role, userId } = {}) => {
    let query = supabase
        .from("reimbursements")
        .select("*, reimbursement_attachments(*)")
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
    ]);

    return rows.map((row) => ({
        ...row,
        status: normalizeReimbursementStatus(row.status),
        attachments: (row.reimbursement_attachments ?? []).sort(
            (a, b) => new Date(a.created_at ?? 0) - new Date(b.created_at ?? 0),
        ),
        requester: profileMap[row.requester_id] ?? null,
        approver: profileMap[row.approved_by] ?? null,
    }));
};

export const loadReimbursementRequesters = async () => {
    const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, name, email, role")
        .in("role", ["technician", "admin", "management"])
        .order("first_name", { ascending: true });

    if (error) throw error;
    return data ?? [];
};

export const createReimbursement = async ({
    requesterId,
    transactionDate,
    claimAmount,
    description,
}) => {
    const reimbursement = {
        id: crypto.randomUUID(),
        requester_id: requesterId,
        transaction_date: transactionDate,
        claim_amount: Number(claimAmount),
        description,
        status: "pending",
    };

    const { error } = await supabase
        .from("reimbursements")
        .insert(reimbursement);

    if (error) throw error;

    const requester = await loadProfileById(requesterId);
    await notifyEvent(NOTIFICATION_EVENT_TYPES.REIMBURSEMENT_REQUESTED, {
        reimbursement_id: reimbursement.id,
        requester_id: requesterId,
        requester_name: getDisplayName(requester),
        amount: reimbursement.claim_amount,
    });

    return reimbursement;
};

export const addReimbursementAttachments = async ({
    reimbursementId,
    files,
    uploadedBy,
}) => {
    if (!files?.length) return [];

    const rows = files.map((file) => ({
        reimbursement_id: reimbursementId,
        file_url: file.url,
        file_type: file.type || null,
        uploaded_by: uploadedBy,
    }));

    const { data, error } = await supabase
        .from("reimbursement_attachments")
        .insert(rows)
        .select();

    if (error) throw error;
    return data ?? [];
};

export const uploadReimbursementFile = async ({
    file,
    reimbursementId,
    kind,
}) => {
    if (!file) throw new Error("File belum dipilih.");
    if (!reimbursementId) throw new Error("ID reimbursement tidak valid.");

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
    const folder = kind === "transfer" ? "transfer-proof" : "receipts";
    const fileName = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const path = `reimbursements/${reimbursementId}/${folder}/${fileName}`;

    const { error } = await supabase.storage
        .from(REIMBURSEMENT_BUCKET)
        .upload(path, fileToUpload, { upsert: false });

    if (error) throw error;

    const { data } = supabase.storage
        .from(REIMBURSEMENT_BUCKET)
        .getPublicUrl(path);

    return {
        url: data.publicUrl,
        type: fileToUpload.type || file.type || "",
        name: fileToUpload.name || file.name || fileName,
    };
};

export const approveReimbursement = async ({
    reimbursement,
    approvedAmount,
    transferProofUrl,
    approvalNote,
    approvedBy,
}) => {
    if (!transferProofUrl) throw new Error("Bukti transfer wajib diupload.");

    const { data, error } = await supabase
        .from("reimbursements")
        .update({
            approved_amount: Number(approvedAmount),
            transfer_proof_url: transferProofUrl,
            approval_note: approvalNote || null,
            approved_by: approvedBy,
            approved_at: new Date().toISOString(),
            rejection_reason: null,
            status: "approved",
        })
        .eq("id", reimbursement.id)
        .select()
        .single();

    if (error) throw error;

    await notifyEvent(NOTIFICATION_EVENT_TYPES.REIMBURSEMENT_APPROVED, {
        reimbursement_id: data.id,
        requester_id: data.requester_id,
        amount: data.claim_amount,
        approved_amount: data.approved_amount,
    });

    return data;
};

export const rejectReimbursement = async ({
    reimbursement,
    rejectionReason,
    approvedBy,
}) => {
    const { data, error } = await supabase
        .from("reimbursements")
        .update({
            status: "rejected",
            rejection_reason: rejectionReason,
            approved_by: approvedBy,
            approved_at: new Date().toISOString(),
            approved_amount: null,
            approval_note: null,
            transfer_proof_url: null,
        })
        .eq("id", reimbursement.id)
        .select()
        .single();

    if (error) throw error;

    await notifyEvent(NOTIFICATION_EVENT_TYPES.REIMBURSEMENT_REJECTED, {
        reimbursement_id: data.id,
        requester_id: data.requester_id,
        amount: data.claim_amount,
        rejection_note: rejectionReason,
    });

    return data;
};
