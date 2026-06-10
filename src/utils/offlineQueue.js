const DB_NAME = "onetrack-offline";
const DB_VERSION = 1;
const STORE_NAME = "offline_queue";
const QUEUE_CHANGED_EVENT = "onetrack:offline-queue-changed";

const nowIso = () => new Date().toISOString();

const createId = () =>
    `offline_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const openDb = () =>
    new Promise((resolve, reject) => {
        if (typeof indexedDB === "undefined") {
            reject(new Error("IndexedDB tidak tersedia di perangkat ini."));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, {
                    keyPath: "id",
                });
                store.createIndex("user_id", "user_id", { unique: false });
                store.createIndex("status", "status", { unique: false });
                store.createIndex("created_at", "created_at", {
                    unique: false,
                });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

const runStore = async (mode, callback) => {
    const db = await openDb();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        const request = callback(store);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => {
            db.close();
            reject(transaction.error);
        };
    });
};

const emitQueueChanged = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(QUEUE_CHANGED_EVENT));
};

export const OFFLINE_QUEUE_EVENT = QUEUE_CHANGED_EVENT;

export const createOfflineQueueItem = async ({
    user_id,
    type,
    entity_table = "requests",
    entity_id,
    action,
    payload = {},
    attachments = [],
}) => {
    if (!user_id) throw new Error("User belum login.");
    if (!action) throw new Error("Aksi offline tidak valid.");

    const timestamp = nowIso();
    const id = createId();
    const item = {
        id,
        idempotency_key: id,
        user_id,
        type: type ?? action,
        entity_table,
        entity_id: entity_id ?? payload.request_id ?? payload.job_id ?? "",
        action,
        payload: {
            ...payload,
            local_queue_id: id,
        },
        attachments,
        status: "pending",
        retry_count: 0,
        error_message: null,
        created_at: timestamp,
        updated_at: timestamp,
        synced_at: null,
    };

    await runStore("readwrite", (store) => store.add(item));
    emitQueueChanged();
    return item;
};

export const getOfflineQueueItems = async ({ userId } = {}) => {
    const items = await runStore("readonly", (store) => store.getAll());
    const normalized = Array.isArray(items) ? items : [];
    return normalized
        .filter((item) => !userId || item.user_id === userId)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
};

export const getOfflineQueueItem = async (id) =>
    runStore("readonly", (store) => store.get(id));

export const updateOfflineQueueItem = async (id, updates) => {
    const current = await getOfflineQueueItem(id);
    if (!current) return null;

    const next = {
        ...current,
        ...updates,
        updated_at: nowIso(),
    };

    await runStore("readwrite", (store) => store.put(next));
    emitQueueChanged();
    return next;
};

export const clearSyncedOfflineQueueItems = async ({ userId } = {}) => {
    const items = await getOfflineQueueItems({ userId });
    const syncedItems = items.filter((item) => item.status === "synced");

    for (const item of syncedItems) {
        await runStore("readwrite", (store) => store.delete(item.id));
    }

    if (syncedItems.length > 0) emitQueueChanged();
    return syncedItems.length;
};

export const clearOfflineQueueItems = async ({ userId } = {}) => {
    const items = await getOfflineQueueItems({ userId });

    for (const item of items) {
        await runStore("readwrite", (store) => store.delete(item.id));
    }

    if (items.length > 0) emitQueueChanged();
    return items.length;
};

export const resetOfflineQueueItemForRetry = async (id) =>
    updateOfflineQueueItem(id, {
        status: "pending",
        error_message: null,
    });

export const getOfflineQueueStats = async ({ userId } = {}) => {
    const items = await getOfflineQueueItems({ userId });
    return {
        total: items.length,
        pending: items.filter((item) => item.status === "pending").length,
        syncing: items.filter((item) => item.status === "syncing").length,
        synced: items.filter((item) => item.status === "synced").length,
        failed: items.filter((item) => item.status === "failed").length,
        conflict: items.filter((item) => item.status === "conflict").length,
    };
};

export const fileToOfflineAttachment = (file) =>
    new Promise((resolve, reject) => {
        if (!file) {
            resolve(null);
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            resolve({
                name: file.name,
                type: file.type,
                size: file.size,
                data_url: reader.result,
            });
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });

export const offlineAttachmentToFile = (attachment, fallbackName = "photo.jpg") => {
    if (!attachment?.data_url) {
        throw new Error("Lampiran offline tidak ditemukan.");
    }

    const [header, body] = String(attachment.data_url).split(",");
    const mime = header?.match(/:(.*?);/)?.[1] ?? attachment.type ?? "image/jpeg";
    const binary = atob(body ?? "");
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return new File([bytes], attachment.name || fallbackName, { type: mime });
};
