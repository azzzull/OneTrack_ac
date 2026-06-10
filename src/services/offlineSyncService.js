import supabase from "../supabaseClient";
import {
    getOfflineQueueItems,
    offlineAttachmentToFile,
    updateOfflineQueueItem,
} from "../utils/offlineQueue";

let activeSync = null;

const PHOTO_COLUMN_BY_TYPE = {
    before: "before_photo_url",
    progress: "progress_photo_url",
    after: "after_photo_url",
    receipt: "receipt_photo_url",
    other: "progress_photo_url",
};

const getErrorMessage = (error) =>
    error?.message || "Sinkronisasi gagal. Coba lagi nanti.";

const getCurrentUserSession = async () => {
    const {
        data: { session },
        error,
    } = await supabase.auth.getSession();

    if (error) throw error;
    if (!session?.user?.id) {
        throw new Error("Sesi login tidak ditemukan. Silakan login ulang.");
    }

    return session;
};

const loadRequestForConflictCheck = async (requestId) => {
    const { data, error } = await supabase
        .from("requests")
        .select("id, status, technician_id, updated_at")
        .eq("id", requestId)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("Job tidak ditemukan di server.");
    return data;
};

const assertJobCanBeUpdated = async (item, session) => {
    const requestId = item.payload?.request_id || item.entity_id;
    if (!requestId) throw new Error("ID job tidak ditemukan pada draft.");

    const serverJob = await loadRequestForConflictCheck(requestId);
    const terminalStatuses = ["completed", "cancelled", "canceled", "rejected"];
    const serverStatus = String(serverJob.status ?? "").toLowerCase();
    const oldStatus = String(item.payload?.old_status ?? "").toLowerCase();
    const assignedTechnician = serverJob.technician_id;

    if (
        assignedTechnician &&
        String(assignedTechnician) !== String(session.user.id)
    ) {
        const itemTechnician = item.payload?.technician_id;
        if (itemTechnician && String(itemTechnician) !== String(assignedTechnician)) {
            throw new Error("conflict: Job sudah ditugaskan ke teknisi lain.");
        }
    }

    if (
        terminalStatuses.includes(serverStatus) &&
        serverStatus !== oldStatus &&
        item.action !== "upload_job_photo"
    ) {
        throw new Error("conflict: Job sudah berubah di server.");
    }

    if (
        oldStatus &&
        serverStatus &&
        serverStatus !== oldStatus &&
        item.action === "update_job_status"
    ) {
        throw new Error("conflict: Status job sudah berubah di server.");
    }
};

const updateRequest = async (requestId, payload) => {
    const { error } = await supabase
        .from("requests")
        .update({
            ...payload,
            updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);

    if (error) throw error;
};

const syncJobStatus = async (item, session) => {
    await assertJobCanBeUpdated(item, session);
    const requestId = item.payload?.request_id || item.entity_id;
    await updateRequest(requestId, {
        status: item.payload?.new_status,
    });
};

const syncJobProgress = async (item, session) => {
    await assertJobCanBeUpdated(item, session);
    const requestId = item.payload?.request_id || item.entity_id;
    const payload = {};

    if ("trouble_description" in item.payload) {
        payload.trouble_description = item.payload.trouble_description;
    }
    if ("replaced_parts" in item.payload) {
        payload.replaced_parts = item.payload.replaced_parts;
    }
    if ("reconditioned_parts" in item.payload) {
        payload.reconditioned_parts = item.payload.reconditioned_parts;
    }
    if ("serial_number" in item.payload) {
        payload.serial_number = item.payload.serial_number;
    }
    if ("progress_note" in item.payload) {
        payload.trouble_description = item.payload.progress_note;
    }
    if ("progress_status" in item.payload) {
        payload.status = item.payload.progress_status;
    }
    if ("status" in item.payload) {
        payload.status = item.payload.status;
    }

    await updateRequest(requestId, payload);
};

const syncJobPhoto = async (item, session) => {
    await assertJobCanBeUpdated(item, session);

    const requestId = item.payload?.request_id || item.entity_id;
    const photoType = item.payload?.photo_type || "other";
    const column = PHOTO_COLUMN_BY_TYPE[photoType] ?? PHOTO_COLUMN_BY_TYPE.other;
    const attachment = item.attachments?.[0];
    const file = offlineAttachmentToFile(
        attachment,
        `${photoType}-${item.id}.jpg`,
    );
    const ext = String(file.name ?? "")
        .split(".")
        .pop()
        ?.toLowerCase() || "jpg";
    const uploadPath = `${session.user.id}/${photoType}/${item.id}.${ext}`;

    const { error: uploadError } = await supabase.storage
        .from("job-photos")
        .upload(uploadPath, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage
        .from("job-photos")
        .getPublicUrl(uploadPath);

    const photoUrl = publicData?.publicUrl;
    if (!photoUrl) throw new Error("URL foto tidak berhasil dibuat.");

    await updateRequest(requestId, {
        [column]: photoUrl,
    });
};

const syncItem = async (item, session) => {
    if (item.action === "update_job_status") {
        await syncJobStatus(item, session);
        return;
    }

    if (
        item.action === "update_job_progress" ||
        item.action === "submit_job_completion"
    ) {
        await syncJobProgress(item, session);
        return;
    }

    if (item.action === "upload_job_photo") {
        await syncJobPhoto(item, session);
        return;
    }

    throw new Error(`Aksi offline belum didukung: ${item.action}`);
};

export const syncOfflineQueue = async ({ userId, itemId } = {}) => {
    if (activeSync) return activeSync;

    activeSync = (async () => {
        if (!navigator.onLine) {
            return { synced: 0, failed: 0, conflict: 0, skipped: 0 };
        }

        const session = await getCurrentUserSession();
        const effectiveUserId = userId ?? session.user.id;
        const items = await getOfflineQueueItems({ userId: effectiveUserId });
        const syncableItems = items.filter((item) => {
            if (itemId && item.id !== itemId) return false;
            return ["pending", "failed"].includes(item.status);
        });
        const result = { synced: 0, failed: 0, conflict: 0, skipped: 0 };

        for (const item of syncableItems) {
            await updateOfflineQueueItem(item.id, {
                status: "syncing",
                error_message: null,
            });

            try {
                await syncItem(item, session);
                await updateOfflineQueueItem(item.id, {
                    status: "synced",
                    synced_at: new Date().toISOString(),
                    error_message: null,
                });
                result.synced += 1;
            } catch (error) {
                const message = getErrorMessage(error);
                const isConflict = message.toLowerCase().includes("conflict:");
                await updateOfflineQueueItem(item.id, {
                    status: isConflict ? "conflict" : "failed",
                    retry_count: Number(item.retry_count ?? 0) + 1,
                    error_message: isConflict
                        ? "Data ini perlu dicek ulang karena sudah berubah di server."
                        : message,
                });

                if (isConflict) result.conflict += 1;
                else result.failed += 1;
            }
        }

        return result;
    })();

    try {
        return await activeSync;
    } finally {
        activeSync = null;
    }
};
