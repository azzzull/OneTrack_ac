import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCcw, Trash2, WifiOff, X } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import useNetworkStatus from "../../hooks/useNetworkStatus";
import { syncOfflineQueue } from "../../services/offlineSyncService";
import {
    clearSyncedOfflineQueueItems,
    getOfflineQueueItems,
    OFFLINE_QUEUE_EVENT,
    resetOfflineQueueItemForRetry,
} from "../../utils/offlineQueue";

const ACTION_LABELS = {
    update_job_status: "Update Status Job",
    update_job_progress: "Catatan Progress",
    upload_job_photo: "Upload Foto Job",
    submit_job_completion: "Penyelesaian Job",
    submit_accommodation_realization: "Realisasi Akomodasi",
    upload_realization_receipt: "Upload Bukti Realisasi",
};

const STATUS_LABELS = {
    pending: "Menunggu",
    syncing: "Mengupload",
    synced: "Berhasil",
    failed: "Gagal",
    conflict: "Konflik",
};

const getQueueSummary = (items) => ({
    pending: items.filter((item) => item.status === "pending").length,
    syncing: items.filter((item) => item.status === "syncing").length,
    synced: items.filter((item) => item.status === "synced").length,
    failed: items.filter((item) => item.status === "failed").length,
    conflict: items.filter((item) => item.status === "conflict").length,
});

export default function OfflineSyncStatus() {
    const { user } = useAuth();
    const [items, setItems] = useState([]);
    const [open, setOpen] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [toast, setToast] = useState("");

    const refreshItems = useCallback(async () => {
        if (!user?.id) {
            setItems([]);
            return;
        }

        const nextItems = await getOfflineQueueItems({ userId: user.id });
        setItems(nextItems);
    }, [user?.id]);

    const runSync = useCallback(
        async (itemId) => {
            if (!user?.id || !navigator.onLine || syncing) return;

            setSyncing(true);
            try {
                const result = await syncOfflineQueue({
                    userId: user.id,
                    itemId,
                });
                await refreshItems();
                if (result.synced > 0) {
                    setToast(`${result.synced} draft berhasil disinkronkan.`);
                } else if (result.failed > 0 || result.conflict > 0) {
                    setToast("Sebagian draft gagal disinkronkan.");
                }
            } catch (error) {
                setToast(error?.message || "Sinkronisasi gagal.");
            } finally {
                setSyncing(false);
            }
        },
        [refreshItems, syncing, user?.id],
    );

    const { isOffline } = useNetworkStatus({
        onOnlineRestored: () => {
            setToast("Internet kembali. Sinkronisasi dimulai.");
            runSync();
        },
    });

    useEffect(() => {
        refreshItems();
        window.addEventListener(OFFLINE_QUEUE_EVENT, refreshItems);
        return () => {
            window.removeEventListener(OFFLINE_QUEUE_EVENT, refreshItems);
        };
    }, [refreshItems]);

    useEffect(() => {
        if (!toast) return undefined;
        const timer = window.setTimeout(() => setToast(""), 4000);
        return () => window.clearTimeout(timer);
    }, [toast]);

    const summary = useMemo(() => getQueueSummary(items), [items]);
    const activeCount =
        summary.pending + summary.syncing + summary.failed + summary.conflict;

    if (!user) return null;

    return (
        <>
            {isOffline && (
                <div className="fixed left-1/2 top-3 z-[100] -translate-x-1/2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 shadow-lg">
                    <span className="flex items-center gap-2">
                        <WifiOff className="h-4 w-4" />
                        Mode Offline - Perubahan akan disimpan sebagai draft.
                    </span>
                </div>
            )}

            {toast && (
                <div className="fixed right-4 top-16 z-[101] max-w-sm rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800 shadow-lg">
                    {toast}
                </div>
            )}

            {items.length > 0 && (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="fixed bottom-20 right-4 z-[90] rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-700 shadow-lg hover:bg-sky-50 md:bottom-4"
                >
                    {activeCount > 0
                        ? `${activeCount} draft menunggu sinkronisasi`
                        : `${summary.synced} draft tersinkron`}
                </button>
            )}

            {open && (
                <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/40 p-3 md:items-center">
                    <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                            <div>
                                <h2 className="text-base font-semibold text-slate-800">
                                    Draft Offline
                                </h2>
                                <p className="text-sm text-slate-500">
                                    {activeCount} draft menunggu sinkronisasi
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="max-h-[55vh] overflow-y-auto px-5 py-4">
                            {items.length === 0 ? (
                                <p className="text-sm text-slate-500">
                                    Tidak ada draft offline.
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    {items.map((item) => (
                                        <div
                                            key={item.id}
                                            className="rounded-xl border border-slate-200 p-3"
                                        >
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-800">
                                                        {ACTION_LABELS[
                                                            item.action
                                                        ] ?? item.action}
                                                    </p>
                                                    <p className="text-xs text-slate-500">
                                                        {item.entity_table} #{item.entity_id}
                                                    </p>
                                                </div>
                                                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                                                    {STATUS_LABELS[
                                                        item.status
                                                    ] ?? item.status}
                                                </span>
                                            </div>
                                            <p className="mt-2 text-xs text-slate-500">
                                                Dibuat:{" "}
                                                {new Date(
                                                    item.created_at,
                                                ).toLocaleString()}
                                            </p>
                                            {item.error_message && (
                                                <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                                                    {item.error_message}
                                                </p>
                                            )}
                                            {["failed", "pending"].includes(
                                                item.status,
                                            ) && (
                                                <button
                                                    type="button"
                                                    disabled={
                                                        syncing || isOffline
                                                    }
                                                    onClick={async () => {
                                                        await resetOfflineQueueItemForRetry(
                                                            item.id,
                                                        );
                                                        await runSync(item.id);
                                                    }}
                                                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
                                                >
                                                    <RefreshCcw className="h-3.5 w-3.5" />
                                                    Retry
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
                            <button
                                type="button"
                                onClick={async () => {
                                    await clearSyncedOfflineQueueItems({
                                        userId: user.id,
                                    });
                                    await refreshItems();
                                }}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                            >
                                <Trash2 className="h-4 w-4" />
                                Clear Synced
                            </button>
                            <button
                                type="button"
                                disabled={syncing || isOffline || activeCount === 0}
                                onClick={() => runSync()}
                                className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <RefreshCcw
                                    className={`h-4 w-4 ${
                                        syncing ? "animate-spin" : ""
                                    }`}
                                />
                                Sync Now
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
