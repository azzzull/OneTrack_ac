import supabase from "../supabaseClient";

export const NOTIFICATION_TYPES = {
    JOB_REQUESTED: "job_requested",
    JOB_CREATED_BY_TECHNICIAN: "job_created_by_technician",
    JOB_TAKEN: "job_taken",
    JOB_STATUS_CHANGED: "job_status_changed",
    ACCOMMODATION_REQUESTED: "accommodation_requested",
    ACCOMMODATION_APPROVED: "accommodation_approved",
    ACCOMMODATION_REJECTED: "accommodation_rejected",
    TRANSFER_PROOF_UPLOADED: "transfer_proof_uploaded",
    REALIZATION_NEED_REVIEW: "realization_need_review",
};

const normalizePayload = (payload = {}) => ({
    title: String(payload.title ?? "").trim(),
    body: String(payload.body ?? "").trim(),
    type: String(payload.type ?? "").trim(),
    referenceTable: payload.referenceTable ?? payload.reference_table ?? null,
    referenceId: payload.referenceId ?? payload.reference_id ?? null,
    data: payload.data ?? {},
});

const buildRpcPayload = (payload) => {
    const normalized = normalizePayload(payload);
    return {
        p_title: normalized.title,
        p_body: normalized.body,
        p_type: normalized.type,
        p_reference_table: normalized.referenceTable,
        p_reference_id: normalized.referenceId,
        p_data: normalized.data,
    };
};

const warnNotificationError = (label, error) => {
    if (error) {
        console.warn(`[Notifications] ${label} skipped:`, error.message);
    }
};

export const createNotification = async (userId, payload) => {
    if (!userId) return null;
    const { data, error } = await supabase
        .rpc("create_notification", {
            p_user_id: userId,
            ...buildRpcPayload(payload),
        })
        .maybeSingle();

    warnNotificationError("createNotification", error);
    return error ? null : data;
};

export const createNotifications = async (userIds, payload) => {
    const uniqueUserIds = [...new Set((userIds ?? []).filter(Boolean))];
    if (!uniqueUserIds.length) return [];

    const { data, error } = await supabase.rpc("create_notifications", {
        p_user_ids: uniqueUserIds,
        ...buildRpcPayload(payload),
    });

    warnNotificationError("createNotifications", error);
    return error ? [] : data ?? [];
};

export const notifyByRoles = async (roles, payload) => {
    const normalizedRoles = [...new Set((roles ?? []).filter(Boolean))];
    if (!normalizedRoles.length) return [];

    const { data, error } = await supabase.rpc("notify_by_roles", {
        p_roles: normalizedRoles,
        ...buildRpcPayload(payload),
    });

    warnNotificationError("notifyByRoles", error);
    return error ? [] : data ?? [];
};

export const notifyRelatedCustomer = async (customerId, payload) => {
    if (!customerId) return [];

    const { data, error } = await supabase.rpc("notify_related_customer", {
        p_customer_id: customerId,
        ...buildRpcPayload(payload),
    });

    warnNotificationError("notifyRelatedCustomer", error);
    return error ? [] : data ?? [];
};

export const getNotifications = async ({ limit = 20 } = {}) => {
    const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data ?? [];
};

export const getUnreadCount = async () => {
    const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false);

    if (error) throw error;
    return count ?? 0;
};

export const markAsRead = async (notificationId) => {
    if (!notificationId) return null;

    const { data, error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notificationId)
        .select("*")
        .maybeSingle();

    if (error) throw error;
    return data;
};

export const markAllAsRead = async () => {
    const { data, error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("is_read", false)
        .select("*");

    if (error) throw error;
    return data ?? [];
};

export const deleteNotification = async (notificationId) => {
    if (!notificationId) return false;

    const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", notificationId)
        .eq("is_read", true);

    if (error) throw error;
    return true;
};

export const deleteReadNotifications = async () => {
    const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("is_read", true);

    if (error) throw error;
    return true;
};

export const buildNotificationPayload = ({
    type,
    title,
    body,
    referenceTable = null,
    referenceId = null,
    data = {},
}) => ({
    type,
    title,
    body,
    referenceTable,
    referenceId,
    data,
});
