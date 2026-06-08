import supabase from "../supabaseClient";
import { compressJobPhotoFile } from "./jobPhotoService";

export const ACCOMMODATION_BUCKET = "accommodation-proofs";

export const ACCOMMODATION_STATUSES = [
    "pending",
    "approved",
    "rejected",
    "realization_process",
    "partial_realized",
    "realized",
];

export const STATUS_LABELS = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    realization_process: "Realization Process",
    partial_realized: "Partial Realized",
    realized: "Realized",
};

export const STATUS_STYLES = {
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-sky-100 text-sky-700",
    rejected: "bg-red-100 text-red-700",
    realization_process: "bg-indigo-100 text-indigo-700",
    partial_realized: "bg-violet-100 text-violet-700",
    realized: "bg-emerald-100 text-emerald-700",
};

export const formatCurrency = (value) =>
    new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
    }).format(Number(value ?? 0));

export const normalizeAccommodationStatus = (value) => {
    const next = String(value ?? "pending")
        .trim()
        .toLowerCase()
        .replaceAll("-", "_")
        .replaceAll(" ", "_");
    return ACCOMMODATION_STATUSES.includes(next) ? next : "pending";
};

export const getDisplayName = (profile) => {
    const composed =
        `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();
    return composed || profile?.name || profile?.email || "-";
};

export const summarizeAccommodation = (request) => {
    const realizations = request?.realizations ?? [];
    const approvedAmount = Number(request?.approved_amount ?? 0);
    const totalRealized = realizations.reduce(
        (sum, item) => sum + Number(item.amount ?? 0),
        0,
    );

    return {
        totalRealized,
        remainingAmount: Math.max(approvedAmount - totalRealized, 0),
    };
};

const loadProfileMap = async (ids) => {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (!uniqueIds.length) return {};

    const { data: rpcData, error: rpcError } = await supabase.rpc(
        "get_accommodation_profiles",
        {
            p_profile_ids: uniqueIds,
        },
    );

    if (!rpcError) {
        return (rpcData ?? []).reduce((acc, profile) => {
            acc[profile.id] = profile;
            return acc;
        }, {});
    }

    console.warn(
        "Accommodation profile RPC lookup fallback:",
        rpcError.message,
    );

    const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, name, email, role, technician_type")
        .in("id", uniqueIds);

    if (error) {
        console.warn("Accommodation profile lookup skipped:", error.message);
        return {};
    }

    return (data ?? []).reduce((acc, profile) => {
        acc[profile.id] = profile;
        return acc;
    }, {});
};

const loadCustomerMap = async (ids) => {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (!uniqueIds.length) return {};

    const { data, error } = await supabase
        .from("master_customers")
        .select("id, name")
        .in("id", uniqueIds);

    if (error) {
        console.warn("Accommodation customer lookup skipped:", error.message);
        return {};
    }

    return (data ?? []).reduce((acc, customer) => {
        acc[customer.id] = customer;
        return acc;
    }, {});
};

const loadProjectMap = async (ids) => {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (!uniqueIds.length) return {};

    const { data, error } = await supabase
        .from("master_projects")
        .select("id, project_name")
        .in("id", uniqueIds);

    if (error) {
        console.warn("Accommodation project lookup skipped:", error.message);
        return {};
    }

    return (data ?? []).reduce((acc, project) => {
        acc[project.id] = project;
        return acc;
    }, {});
};

export const loadAccommodationRequests = async ({ role, userId } = {}) => {
    let query = supabase
        .from("accommodation_requests")
        .select("*, accommodation_realizations(*)")
        .order("created_at", { ascending: false });

    if (role === "technician" && userId) {
        query = query.eq("technician_id", userId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = data ?? [];
    const profileMap = await loadProfileMap([
        ...rows.map((row) => row.technician_id),
        ...rows.map((row) => row.reviewed_by),
    ]);
    const customerMap = await loadCustomerMap(rows.map((row) => row.customer_id));
    const projectMap = await loadProjectMap(rows.map((row) => row.project_id));

    return rows.map((row) => {
        const realizations = row.accommodation_realizations ?? [];
        const request = {
            ...row,
            status: normalizeAccommodationStatus(row.status),
            realizations: realizations.sort(
                (a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0),
            ),
            technician: profileMap[row.technician_id] ?? null,
            reviewer: profileMap[row.reviewed_by] ?? null,
            customer_name: row.customer_name ?? null,
            project_name: row.project_name ?? null,
            customer: customerMap[row.customer_id] ?? null,
            project: projectMap[row.project_id] ?? null,
        };

        return {
            ...request,
            ...summarizeAccommodation(request),
        };
    });
};

export const loadAccommodationLookups = async () => {
    const [customersResult, projectsResult] = await Promise.all([
        supabase
            .from("master_customers")
            .select("id, name")
            .order("name", { ascending: true }),
        supabase
            .from("master_projects")
            .select("id, project_name, customer_id")
            .order("project_name", { ascending: true }),
    ]);

    if (customersResult.error) throw customersResult.error;
    if (projectsResult.error) throw projectsResult.error;

    return {
        customers: customersResult.data ?? [],
        projects: projectsResult.data ?? [],
    };
};

export const createAccommodationRequest = async (payload) => {
    const { data, error } = await supabase
        .from("accommodation_requests")
        .insert({
            technician_id: payload.technician_id,
            customer_id: payload.customer_id || null,
            project_id: payload.project_id || null,
            customer_name: payload.customer_name || null,
            project_name: payload.project_name || null,
            request_title: payload.request_title,
            purpose: payload.purpose,
            job_scope: payload.job_scope || null,
            requested_amount: Number(payload.requested_amount),
            notes: payload.notes || null,
            status: "pending",
        })
        .select()
        .single();

    if (error) throw error;
    await sendAccommodationNotification("request_created", data);
    return data;
};

export const uploadAccommodationFile = async ({ file, folder, requestId }) => {
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
    const fileName = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const path = `${folder}/${requestId}/${fileName}`;

    const { error } = await supabase.storage
        .from(ACCOMMODATION_BUCKET)
        .upload(path, fileToUpload, { upsert: false });
    if (error) throw error;

    const { data } = supabase.storage
        .from(ACCOMMODATION_BUCKET)
        .getPublicUrl(path);

    return data.publicUrl;
};

const getAccommodationStoragePath = (url) => {
    const raw = String(url ?? "").trim();
    if (!raw) return "";

    const marker = `/${ACCOMMODATION_BUCKET}/`;
    try {
        const parsed = new URL(raw);
        const markerIndex = parsed.pathname.indexOf(marker);
        if (markerIndex >= 0) {
            return decodeURIComponent(
                parsed.pathname.slice(markerIndex + marker.length),
            );
        }
    } catch {
        const markerIndex = raw.indexOf(marker);
        if (markerIndex >= 0) return raw.slice(markerIndex + marker.length);
    }

    return raw.startsWith("transfer-proofs/") || raw.startsWith("receipts/")
        ? raw
        : "";
};

export const deleteAccommodationRequest = async (request) => {
    if (!request?.id) throw new Error("Request tidak valid.");

    const paths = [
        getAccommodationStoragePath(request.transfer_proof_url),
        ...(request.realizations ?? []).map((item) =>
            getAccommodationStoragePath(item.receipt_photo_url),
        ),
    ].filter(Boolean);

    if (paths.length > 0) {
        const { error: storageError } = await supabase.storage
            .from(ACCOMMODATION_BUCKET)
            .remove([...new Set(paths)]);

        if (storageError) throw storageError;
    }

    const { error } = await supabase
        .from("accommodation_requests")
        .delete()
        .eq("id", request.id);

    if (error) throw error;
};

export const approveAccommodationRequest = async ({
    requestId,
    approvedAmount,
    transferProofUrl,
    reviewedBy,
    notes,
}) => {
    if (!transferProofUrl) {
        throw new Error("Transfer proof wajib diupload.");
    }

    const { data, error } = await supabase
        .from("accommodation_requests")
        .update({
            approved_amount: Number(approvedAmount),
            transfer_proof_url: transferProofUrl,
            reviewed_by: reviewedBy,
            reviewed_at: new Date().toISOString(),
            status: "approved",
            notes: notes || null,
            rejection_reason: null,
        })
        .eq("id", requestId)
        .select()
        .single();

    if (error) throw error;
    await sendAccommodationNotification("request_approved", data);
    return data;
};

export const rejectAccommodationRequest = async ({
    requestId,
    rejectionReason,
    reviewedBy,
}) => {
    const { data, error } = await supabase
        .from("accommodation_requests")
        .update({
            status: "rejected",
            reviewed_by: reviewedBy,
            reviewed_at: new Date().toISOString(),
            rejection_reason: rejectionReason,
        })
        .eq("id", requestId)
        .select()
        .single();

    if (error) throw error;
    await sendAccommodationNotification("request_rejected", data);
    return data;
};

export const addAccommodationRealization = async ({
    requestId,
    receiptPhotoUrl,
    amount,
    description,
    transactionDate,
    createdBy,
}) => {
    const { data, error } = await supabase
        .from("accommodation_realizations")
        .insert({
            accommodation_request_id: requestId,
            receipt_photo_url: receiptPhotoUrl,
            amount: Number(amount),
            description: description || null,
            transaction_date: transactionDate,
            created_by: createdBy,
        })
        .select()
        .single();

    if (error) throw error;
    await sendAccommodationNotification("realization_created", data);
    return data;
};

export const sendAccommodationNotification = async (event, payload) => {
    try {
        const { error } = await supabase.functions.invoke(
            "send-accommodation-notification",
            { body: { event, payload } },
        );
        if (error) {
            console.warn("Accommodation notification skipped:", error.message);
        }
    } catch (error) {
        console.warn("Accommodation notification failed:", error.message);
    }
};
