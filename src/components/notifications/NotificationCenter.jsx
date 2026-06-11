import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, Loader2, Trash2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import useNotifications from "../../hooks/useNotifications";
import { useAuth } from "../../context/useAuth";

const formatNotificationTime = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return "Baru saja";
    if (diffMinutes < 60) return `${diffMinutes} menit lalu`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} jam lalu`;

    return date.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
};

const getNotificationTargetPath = (notification, role) => {
    const table = String(notification?.reference_table ?? "").toLowerCase();

    if (table === "requests" || table === "jobs") {
        if (role === "technician") return "/technician/requests";
        if (role === "customer") return "/services";
        return "/requests";
    }

    if (
        table === "accommodation_requests" ||
        table === "accommodation_realizations" ||
        table === "accommodations"
    ) {
        if (role === "management") return "/management/accommodation";
        if (role === "technician") return "/accommodation";
        return "/admin/accommodation";
    }

    if (table === "overtime_requests" || table === "overtime") {
        return "/overtime";
    }

    if (table === "attendance") {
        if (role === "technician") return "/technician/attendance";
        return "/admin/attendance";
    }

    return role === "customer"
        ? "/customer"
        : role === "technician"
          ? "/technician"
          : "/admin";
};

export default function NotificationCenter({ compact = false, align = "right" }) {
    const { role } = useAuth();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [toastNotification, setToastNotification] = useState(null);
    const containerRef = useRef(null);
    const toastTimerRef = useRef(null);
    const {
        notifications,
        unreadCount,
        loading,
        error,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearReadNotifications,
    } = useNotifications({
        limit: 20,
        onNewNotification: (notification) => {
            setToastNotification(notification);
        },
    });

    useEffect(() => {
        const handlePointerDown = (event) => {
            if (!containerRef.current?.contains(event.target)) {
                setOpen(false);
            }
        };

        document.addEventListener("pointerdown", handlePointerDown);
        return () =>
            document.removeEventListener("pointerdown", handlePointerDown);
    }, []);

    useEffect(() => {
        if (!toastNotification) return undefined;

        if (toastTimerRef.current) {
            clearTimeout(toastTimerRef.current);
        }
        toastTimerRef.current = setTimeout(() => {
            setToastNotification(null);
        }, 4500);

        return () => {
            if (toastTimerRef.current) {
                clearTimeout(toastTimerRef.current);
            }
        };
    }, [toastNotification]);

    const handleNotificationClick = async (notification) => {
        if (!notification.is_read) {
            await markAsRead(notification.id);
        }
        setOpen(false);
        navigate(getNotificationTargetPath(notification, role));
    };

    const handleDeleteNotification = async (event, notification) => {
        event.stopPropagation();
        if (!notification.is_read) {
            await markAsRead(notification.id);
        }
        await deleteNotification(notification.id);
    };

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                className={`relative inline-flex items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-800 ${
                    compact ? "h-9 w-9" : "h-10 w-10"
                }`}
                aria-label="Notifications"
            >
                <Bell size={compact ? 18 : 20} />
                {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-5 text-white">
                        {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div
                    className={`fixed left-1/2 top-20 z-70 w-[calc(100vw-1.5rem)] max-w-sm -translate-x-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:absolute sm:top-auto sm:mt-2 sm:w-[min(22rem,calc(100vw-1.5rem))] sm:max-w-none sm:translate-x-0 ${
                        align === "left"
                            ? "sm:left-0 sm:right-auto"
                            : "sm:left-auto sm:right-0"
                    }`}
                >
                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                        <div>
                            <p className="text-sm font-semibold text-slate-900">
                                Notifikasi
                            </p>
                            <p className="text-xs text-slate-500">
                                {unreadCount} belum dibaca
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={markAllAsRead}
                            disabled={!unreadCount}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-sky-600 hover:bg-sky-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
                        >
                            <CheckCheck size={14} />
                            Tandai semua
                        </button>
                        <button
                            type="button"
                            onClick={clearReadNotifications}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                        >
                            <Trash2 size={14} />
                            Hapus dibaca
                        </button>
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-slate-500">
                                <Loader2 size={16} className="animate-spin" />
                                Memuat notifikasi...
                            </div>
                        ) : error ? (
                            <div className="px-4 py-8 text-center text-sm text-red-600">
                                Gagal memuat notifikasi.
                            </div>
                        ) : notifications.length ? (
                            notifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    className={`flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50 ${
                                        notification.is_read
                                            ? "bg-white"
                                            : "bg-sky-50/60"
                                        }`}
                                >
                                    <span
                                        className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                                            notification.is_read
                                                ? "bg-slate-300"
                                                : "bg-sky-500"
                                        }`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() =>
                                            handleNotificationClick(
                                                notification,
                                            )
                                        }
                                        className="min-w-0 flex-1 text-left"
                                    >
                                        <span className="block text-sm font-semibold text-slate-900">
                                            {notification.title}
                                        </span>
                                        <span className="mt-1 block text-sm leading-snug text-slate-600">
                                            {notification.body}
                                        </span>
                                        <span className="mt-2 block text-xs text-slate-400">
                                            {formatNotificationTime(
                                                notification.created_at,
                                            )}
                                        </span>
                                    </button>
                                    {notification.is_read && (
                                        <button
                                            type="button"
                                            onClick={(event) =>
                                                handleDeleteNotification(
                                                    event,
                                                    notification,
                                                )
                                            }
                                            className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                            aria-label="Hapus notifikasi"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="px-4 py-8 text-center text-sm text-slate-500">
                                Belum ada notifikasi.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {toastNotification && !open && (
                <div
                    className={`fixed right-3 top-17 z-80 w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border border-sky-200 bg-white p-4 text-left shadow-2xl sm:absolute sm:top-full sm:mt-2 ${
                        align === "left"
                            ? "sm:left-0 sm:right-auto"
                            : "sm:left-auto sm:right-0"
                    }`}
                >
                    <div className="flex items-start gap-3">
                        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                            <Bell size={17} />
                        </span>
                        <button
                            type="button"
                            onClick={() => {
                                setToastNotification(null);
                                handleNotificationClick(toastNotification);
                            }}
                            className="min-w-0 flex-1 text-left"
                        >
                            <span className="block text-xs font-semibold uppercase tracking-wide text-sky-600">
                                Notifikasi baru
                            </span>
                            <span className="mt-1 block truncate text-sm font-semibold text-slate-900">
                                {toastNotification.title}
                            </span>
                            <span className="mt-1 line-clamp-2 block text-sm text-slate-600">
                                {toastNotification.body}
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                setToastNotification(null);
                            }}
                            className="-mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                            aria-label="Tutup notifikasi baru"
                        >
                            <X size={15} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
