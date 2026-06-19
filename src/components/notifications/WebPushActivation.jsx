import { useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import {
    getExistingWebPushSubscription,
    getWebPushReadiness,
    isIosBrowser,
    isStandalonePwa,
    registerWebPushNotifications,
} from "../../services/webPushNotifications";
import { useAuth } from "../../context/useAuth";

export default function WebPushActivation({ compact = false }) {
    const { user, isOnline } = useAuth();
    const [readiness, setReadiness] = useState(() => getWebPushReadiness());
    const [enabled, setEnabled] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        let mounted = true;
        const refresh = async () => {
            const nextReadiness = getWebPushReadiness();
            const subscription = await getExistingWebPushSubscription().catch(
                () => null,
            );
            if (!mounted) return;
            setReadiness(nextReadiness);
            setEnabled(Boolean(subscription));
        };
        refresh();
        return () => {
            mounted = false;
        };
    }, []);

    if (!user?.id || !isOnline) return null;
    if (enabled) return null;

    const ios = isIosBrowser();

    const handleEnable = async () => {
        setLoading(true);
        setMessage("");
        try {
            await registerWebPushNotifications();
            setEnabled(true);
            setMessage("Notifikasi aktif.");
        } catch (error) {
            setMessage(error.message || "Gagal mengaktifkan notifikasi.");
        } finally {
            setLoading(false);
        }
    };

    if (ios && !isStandalonePwa()) {
        if (compact) return null;

        return (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
                <p className="font-semibold">Aktifkan PWA OneTrack</p>
                <p className="mt-1">
                    {ios
                        ? "Di iPhone/iPad: buka Share, pilih Add to Home Screen, lalu buka OneTrack dari icon Home Screen."
                        : readiness.reason}
                </p>
            </div>
        );
    }

    return (
        <div
            className={`rounded-xl border border-slate-200 bg-white ${
                compact ? "p-3" : "p-4"
            }`}
        >
            <button
                type="button"
                onClick={handleEnable}
                disabled={loading || !readiness.canEnable}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
                {loading ? (
                    <Loader2 size={16} className="animate-spin" />
                ) : (
                    <Bell size={16} />
                )}
                Aktifkan Notifikasi
            </button>
            {(message || !readiness.canEnable) && (
                <p className="mt-2 text-xs text-slate-600">
                    {message || readiness.reason}
                </p>
            )}
        </div>
    );
}
