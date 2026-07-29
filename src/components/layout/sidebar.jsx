import { createElement, useEffect, useRef, useState } from "react";
import {
    LayoutDashboard,
    List,
    Plus,
    Database,
    CircleUserRound,
    LogOut,
    PanelLeftClose,
    PanelLeftOpen,
    Menu,
    MoreHorizontal,
    X,
    ChevronDown,
    CalendarDays,
    Clock3,
    Wallet,
    Receipt,
    HandCoins,
    ClipboardCheck,
    Plane,
    ShieldCheck,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import supabase from "../../supabaseClient";
import useRequestStats from "../../hooks/useRequestStats";
import { createUniqueChannelName } from "../../utils/realtimeChannelManager";
import NotificationCenter from "../notifications/NotificationCenter";
import WebPushActivation from "../notifications/WebPushActivation";
import AppToast from "../ui/AppToast";
import {
    clearOfflineQueueItems,
    getOfflineQueueStats,
} from "../../utils/offlineQueue";

const menuByRole = {
    management: [
        { label: "Dashboard", path: "/admin", icon: LayoutDashboard },
        { label: "Pekerjaan", path: "/requests", icon: List },
        {
            label: "Accommodation",
            path: "/management/accommodation",
            icon: Wallet,
        },
        { label: "Master Data", path: "/master-data", icon: Database },
        { label: "Absensi", path: "/admin/attendance", icon: CalendarDays },
        { label: "Lembur", path: "/overtime", icon: Clock3 },
        { label: "Reimburse", path: "/reimburse", icon: Receipt },
        { label: "Pinjaman", path: "/loans", icon: HandCoins },
        {
            label: "Business Trip",
            path: "/business-trip",
            icon: Plane,
            children: [
                { label: "Pengajuan Trip", path: "/business-trip", icon: Plane },
                {
                    label: "Approval Trip",
                    path: "/business-trip/approval",
                    icon: ShieldCheck,
                },
                {
                    label: "Pencairan Trip",
                    path: "/business-trip/disbursement",
                    icon: Wallet,
                },
                {
                    label: "Verifikasi Realisasi",
                    path: "/business-trip/realization-verification",
                    icon: ClipboardCheck,
                },
                {
                    label: "Laporan Business Trip",
                    path: "/business-trip/reports",
                    icon: List,
                },
            ],
        },
    ],
    admin: [
        { label: "Dashboard", path: "/admin", icon: LayoutDashboard },
        { label: "Pekerjaan", path: "/requests", icon: List },
        { label: "New Job", path: "/jobs/new", icon: Plus },
        { label: "Accommodation", path: "/admin/accommodation", icon: Wallet },
        { label: "Master Data", path: "/master-data", icon: Database },
        { label: "Absensi", path: "/admin/attendance", icon: CalendarDays },
        { label: "Lembur", path: "/overtime", icon: Clock3 },
        { label: "Reimburse", path: "/reimburse", icon: Receipt },
        { label: "Pinjaman", path: "/loans", icon: HandCoins },
        {
            label: "Business Trip",
            path: "/business-trip",
            icon: Plane,
            children: [
                { label: "Pengajuan Trip", path: "/business-trip", icon: Plane },
                {
                    label: "Approval Trip",
                    path: "/business-trip/approval",
                    icon: ShieldCheck,
                },
                {
                    label: "Pencairan Trip",
                    path: "/business-trip/disbursement",
                    icon: Wallet,
                },
                {
                    label: "Verifikasi Realisasi",
                    path: "/business-trip/realization-verification",
                    icon: ClipboardCheck,
                },
                {
                    label: "Laporan Business Trip",
                    path: "/business-trip/reports",
                    icon: List,
                },
            ],
        },
    ],
    technician: [
        { label: "Dashboard", path: "/technician", icon: LayoutDashboard },
        { label: "Pekerjaan", path: "/technician/requests", icon: List },
        { label: "New Job", path: "/jobs/new", icon: Plus },
        {
            label: "History Absensi",
            path: "/technician/attendance",
            icon: CalendarDays,
        },
        { label: "Lembur", path: "/overtime", icon: Clock3 },
        { label: "Reimburse", path: "/reimburse", icon: Receipt },
        { label: "Pinjaman", path: "/loans", icon: HandCoins },
        { label: "Business Trip", path: "/business-trip", icon: Plane },
    ],
    customer: [
        { label: "Dashboard", path: "/customer", icon: LayoutDashboard },
        { label: "My Service", path: "/services", icon: List },
        { label: "Request", path: "/customer/request", icon: Plus },
    ],
};

const getMenus = (role, profile) => {
    const menus = menuByRole[role] ?? [];
    if (role !== "technician") return menus;
    if (profile?.technician_type !== "internal") return menus;
    return [
        ...menus,
        { label: "Accommodation", path: "/accommodation", icon: Wallet },
    ];
};

const usePendingAccommodationCount = (role, userId, isOnline) => {
    const [pendingCount, setPendingCount] = useState(0);

    useEffect(() => {
        if (!isOnline || !userId || !["admin", "management"].includes(role)) {
            return undefined;
        }

        let mounted = true;
        let channel = null;

        const loadPendingCount = async () => {
            const { count, error } = await supabase
                .from("accommodation_requests")
                .select("id", { count: "exact", head: true })
                .eq("status", "pending");

            if (error) {
                console.warn(
                    "[Sidebar] Accommodation pending count skipped:",
                    error.message,
                );
                if (mounted) setPendingCount(0);
                return;
            }

            if (mounted) setPendingCount(count ?? 0);
        };

        loadPendingCount();

        const channelName = createUniqueChannelName(
            "accommodation-pending-badge",
            userId,
        );
        channel = supabase.channel(channelName).on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "accommodation_requests",
            },
            loadPendingCount,
        );

        channel.subscribe();

        const intervalId = setInterval(loadPendingCount, 5000);
        const handleFocus = () => {
            if (document.visibilityState === "visible") {
                loadPendingCount();
            }
        };
        document.addEventListener("visibilitychange", handleFocus);
        window.addEventListener("focus", handleFocus);

        return () => {
            mounted = false;
            clearInterval(intervalId);
            document.removeEventListener("visibilitychange", handleFocus);
            window.removeEventListener("focus", handleFocus);
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [isOnline, role, userId]);

    return isOnline ? pendingCount : 0;
};

const usePendingReimbursementCount = (role, userId, isOnline) => {
    const [pendingCount, setPendingCount] = useState(0);

    useEffect(() => {
        if (!isOnline || !userId || !["admin", "management"].includes(role)) {
            return undefined;
        }

        let mounted = true;
        let channel = null;

        const loadPendingCount = async () => {
            const { count, error } = await supabase
                .from("reimbursements")
                .select("id", { count: "exact", head: true })
                .eq("status", "pending");

            if (error) {
                console.warn(
                    "[Sidebar] Reimbursement pending count skipped:",
                    error.message,
                );
                if (mounted) setPendingCount(0);
                return;
            }

            if (mounted) setPendingCount(count ?? 0);
        };

        loadPendingCount();

        const channelName = createUniqueChannelName(
            "reimbursement-pending-badge",
            userId,
        );
        channel = supabase.channel(channelName).on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "reimbursements",
            },
            loadPendingCount,
        );

        channel.subscribe();

        const intervalId = setInterval(loadPendingCount, 5000);
        const handleFocus = () => {
            if (document.visibilityState === "visible") {
                loadPendingCount();
            }
        };
        document.addEventListener("visibilitychange", handleFocus);
        window.addEventListener("focus", handleFocus);

        return () => {
            mounted = false;
            clearInterval(intervalId);
            document.removeEventListener("visibilitychange", handleFocus);
            window.removeEventListener("focus", handleFocus);
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [isOnline, role, userId]);

    return isOnline ? pendingCount : 0;
};

const usePendingLoanCount = (role, userId, isOnline) => {
    const [pendingCount, setPendingCount] = useState(0);

    useEffect(() => {
        if (!isOnline || !userId || !["admin", "management"].includes(role)) {
            return undefined;
        }

        let mounted = true;
        let channel = null;

        const loadPendingCount = async () => {
            const [loanResult, repaymentResult] = await Promise.all([
                supabase
                    .from("loans")
                    .select("id", { count: "exact", head: true })
                    .eq("status", "pending"),
                supabase
                    .from("loan_repayments")
                    .select("id", { count: "exact", head: true })
                    .eq("status", "pending"),
            ]);

            if (loanResult.error || repaymentResult.error) {
                console.warn(
                    "[Sidebar] Loan pending count skipped:",
                    loanResult.error?.message ?? repaymentResult.error?.message,
                );
                if (mounted) setPendingCount(0);
                return;
            }

            if (mounted) {
                setPendingCount(
                    (loanResult.count ?? 0) + (repaymentResult.count ?? 0),
                );
            }
        };

        loadPendingCount();

        const channelName = createUniqueChannelName(
            "loan-pending-badge",
            userId,
        );
        channel = supabase
            .channel(channelName)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "loans" },
                loadPendingCount,
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "loan_repayments" },
                loadPendingCount,
            );

        channel.subscribe();

        const intervalId = setInterval(loadPendingCount, 5000);
        const handleFocus = () => {
            if (document.visibilityState === "visible") loadPendingCount();
        };
        document.addEventListener("visibilitychange", handleFocus);
        window.addEventListener("focus", handleFocus);

        return () => {
            mounted = false;
            clearInterval(intervalId);
            document.removeEventListener("visibilitychange", handleFocus);
            window.removeEventListener("focus", handleFocus);
            if (channel) supabase.removeChannel(channel);
        };
    }, [isOnline, role, userId]);

    return isOnline ? pendingCount : 0;
};

const usePendingBusinessTripApprovalCount = (role, userId, isOnline) => {
    const [pendingCount, setPendingCount] = useState(0);

    useEffect(() => {
        if (!isOnline || !userId || !["admin", "management"].includes(role)) {
            return undefined;
        }

        let mounted = true;
        const loadPendingCount = async () => {
            const { count, error } = await supabase
                .from("business_trips")
                .select("id", { count: "exact", head: true })
                .in("status", ["submitted", "pending_approval"])
                .neq("requester_id", userId);

            if (error) {
                console.warn(
                    "[Sidebar] Business Trip approval count skipped:",
                    error.message,
                );
                if (mounted) setPendingCount(0);
                return;
            }

            if (mounted) setPendingCount(count ?? 0);
        };

        loadPendingCount();
        const intervalId = setInterval(loadPendingCount, 8000);
        const handleFocus = () => {
            if (document.visibilityState === "visible") loadPendingCount();
        };
        document.addEventListener("visibilitychange", handleFocus);
        window.addEventListener("focus", handleFocus);

        return () => {
            mounted = false;
            clearInterval(intervalId);
            document.removeEventListener("visibilitychange", handleFocus);
            window.removeEventListener("focus", handleFocus);
        };
    }, [isOnline, role, userId]);

    return isOnline ? pendingCount : 0;
};

const usePendingBusinessTripDisbursementCount = (role, userId, isOnline) => {
    const [pendingCount, setPendingCount] = useState(0);

    useEffect(() => {
        if (!isOnline || !userId || !["admin", "management"].includes(role)) {
            return undefined;
        }

        let mounted = true;
        const loadPendingCount = async () => {
            const { count, error } = await supabase
                .from("business_trips")
                .select("id", { count: "exact", head: true })
                .eq("status", "approved")
                .gt("requested_amount", 0)
                .neq("requester_id", userId);

            if (error) {
                console.warn(
                    "[Sidebar] Business Trip disbursement count skipped:",
                    error.message,
                );
                if (mounted) setPendingCount(0);
                return;
            }

            if (mounted) setPendingCount(count ?? 0);
        };

        loadPendingCount();
        const intervalId = setInterval(loadPendingCount, 8000);
        const handleFocus = () => {
            if (document.visibilityState === "visible") loadPendingCount();
        };
        document.addEventListener("visibilitychange", handleFocus);
        window.addEventListener("focus", handleFocus);

        return () => {
            mounted = false;
            clearInterval(intervalId);
            document.removeEventListener("visibilitychange", handleFocus);
            window.removeEventListener("focus", handleFocus);
        };
    }, [isOnline, role, userId]);

    return isOnline ? pendingCount : 0;
};

const usePendingBusinessTripRealizationVerificationCount = (
    role,
    userId,
    isOnline,
) => {
    const [pendingCount, setPendingCount] = useState(0);

    useEffect(() => {
        if (!isOnline || !userId || !["admin", "management"].includes(role)) {
            return undefined;
        }

        let mounted = true;
        const loadPendingCount = async () => {
            const { count, error } = await supabase
                .from("business_trips")
                .select("id", { count: "exact", head: true })
                .eq("status", "realization_submitted")
                .neq("requester_id", userId);

            if (error) {
                console.warn(
                    "[Sidebar] Business Trip realization verification count skipped:",
                    error.message,
                );
                if (mounted) setPendingCount(0);
                return;
            }

            if (mounted) setPendingCount(count ?? 0);
        };

        loadPendingCount();
        const intervalId = setInterval(loadPendingCount, 8000);
        const handleFocus = () => {
            if (document.visibilityState === "visible") loadPendingCount();
        };
        document.addEventListener("visibilitychange", handleFocus);
        window.addEventListener("focus", handleFocus);

        return () => {
            mounted = false;
            clearInterval(intervalId);
            document.removeEventListener("visibilitychange", handleFocus);
            window.removeEventListener("focus", handleFocus);
        };
    }, [isOnline, role, userId]);

    return isOnline ? pendingCount : 0;
};

export default function Sidebar({ collapsed = false, onToggle }) {
    const { user, role, profile, loading, isOnline, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const stats = useRequestStats();
    const pendingAccommodationCount = usePendingAccommodationCount(
        role,
        user?.id,
        isOnline,
    );
    const pendingReimbursementCount = usePendingReimbursementCount(
        role,
        user?.id,
        isOnline,
    );
    const pendingLoanCount = usePendingLoanCount(role, user?.id, isOnline);
    const pendingBusinessTripApprovalCount = usePendingBusinessTripApprovalCount(
        role,
        user?.id,
        isOnline,
    );
    const pendingBusinessTripDisbursementCount =
        usePendingBusinessTripDisbursementCount(role, user?.id, isOnline);
    const pendingBusinessTripRealizationVerificationCount =
        usePendingBusinessTripRealizationVerificationCount(
            role,
            user?.id,
            isOnline,
        );
    const [newRequestToast, setNewRequestToast] = useState("");
    const [accommodationToast, setAccommodationToast] = useState("");
    const toastTimerRef = useRef(null);
    const accommodationToastTimerRef = useRef(null);
    const notifiedRequestIdsRef = useRef(new Set());
    const notifiedAccommodationIdsRef = useRef(new Set());
    const channelRef = useRef(null);
    const accommodationNotifyChannelRef = useRef(null);
    const isMountedRef = useRef(true);
    const badgeByPath = {
        "/requests": stats.pending,
        "/technician/requests": stats.pending,
        "/services": stats.active,
        "/customer/request": null,
        "/management/accommodation": pendingAccommodationCount,
        "/admin/accommodation": pendingAccommodationCount,
        "/reimburse": pendingReimbursementCount,
        "/loans": pendingLoanCount,
        "/business-trip/approval": pendingBusinessTripApprovalCount,
        "/business-trip/disbursement": pendingBusinessTripDisbursementCount,
        "/business-trip/realization-verification":
            pendingBusinessTripRealizationVerificationCount,
    };
    const attachBadges = (menu) => {
        const children = menu.children?.map(attachBadges);
        const ownCount = badgeByPath[menu.path] ?? 0;
        const childCount = children?.reduce(
            (sum, child) => sum + Number(child.badge ?? 0),
            0,
        ) ?? 0;
        const count = ownCount + childCount;
        return {
            ...menu,
            children,
            badge: count > 0 ? count : null,
        };
    };
    const menus = getMenus(role, profile).map(attachBadges);

    const handleLogout = async () => {
        const stats = await getOfflineQueueStats({ userId: user?.id });
        if (stats.total > 0) {
            const shouldClear = window.confirm(
                `Ada ${stats.total} draft offline di perangkat ini. Hapus draft saat logout?`,
            );
            if (shouldClear) {
                await clearOfflineQueueItems({ userId: user?.id });
            }
        }
        await logout();
        navigate("/");
    };
    const identityLabel =
        `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
        profile?.email ||
        user?.user_metadata?.full_name?.trim() ||
        user?.email ||
        "admin@onetrack.com";
    const canOpenProfile =
        role === "customer" ||
        role === "technician" ||
        role === "admin" ||
        role === "management";

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (toastTimerRef.current) {
                clearTimeout(toastTimerRef.current);
            }
            if (accommodationToastTimerRef.current) {
                clearTimeout(accommodationToastTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (loading || !isOnline || role !== "technician" || !user?.id) return;

        // Async channel setup with proper cleanup
        const setupChannel = async () => {
            // ✅ CRITICAL FIX: Cleanup ALL existing channels before creating new one
            // ✅ CRITICAL FIX: Use unique channel name with user ID
            const channelName = createUniqueChannelName(
                "requests-new-notify",
                user.id,
            );

            // ✅ Skip if channel already exists
            const existingChannels = supabase.getChannels();
            const existing = existingChannels.find(
                (ch) => ch.topic === `realtime:${channelName}`,
            );

            if (existing) {
                console.log(
                    "[Sidebar] Channel already exists, reusing:",
                    channelName,
                );
                channelRef.current = existing;
                return;
            }

            channelRef.current = supabase
                .channel(channelName)
                .on(
                    "postgres_changes",
                    { event: "INSERT", schema: "public", table: "requests" },
                    (payload) => {
                        if (!isMountedRef.current) return;

                        const row = payload?.new;
                        if (!row) return;
                        const status = String(row.status ?? "pending")
                            .toLowerCase()
                            .replaceAll("-", "_")
                            .replaceAll(" ", "_");
                        const isUnassigned = !row.technician_id;
                        if (
                            !["pending", "requested"].includes(status) ||
                            !isUnassigned
                        ) {
                            return;
                        }

                        const requestId =
                            row.id ??
                            `${row.created_at}-${row.customer_id ?? ""}`;
                        if (notifiedRequestIdsRef.current.has(requestId))
                            return;
                        notifiedRequestIdsRef.current.add(requestId);

                        const message = "ada pekerjaan baru yang di request";

                        if (toastTimerRef.current) {
                            clearTimeout(toastTimerRef.current);
                        }
                        setNewRequestToast(message);
                        toastTimerRef.current = setTimeout(() => {
                            if (isMountedRef.current) {
                                setNewRequestToast("");
                            }
                        }, 4500);

                        if ("Notification" in window) {
                            if (Notification.permission === "granted") {
                                new Notification("OneTrack", {
                                    body: message,
                                });
                            } else if (Notification.permission === "default") {
                                Notification.requestPermission().then(
                                    (permission) => {
                                        if (permission === "granted") {
                                            new Notification("OneTrack", {
                                                body: message,
                                            });
                                        }
                                    },
                                );
                            }
                        }
                    },
                );

            const { error } = await channelRef.current.subscribe();

            if (error) {
                console.error("[Sidebar] Subscribe error:", error);
                return;
            }

            console.log("[Sidebar] Subscribed to:", channelName);
        };

        setupChannel();

        return () => {
            // ✅ CRITICAL FIX: Proper cleanup using supabase.removeChannel()
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
                console.log("[Sidebar] Channel cleaned up");
            }
        };
    }, [isOnline, loading, role, user?.id]);

    useEffect(() => {
        if (
            loading ||
            !isOnline ||
            !["admin", "management"].includes(role) ||
            !user?.id
        ) {
            return;
        }

        const channelName = createUniqueChannelName(
            "accommodation-new-notify",
            user.id,
        );

        const existingChannels = supabase.getChannels();
        const existing = existingChannels.find(
            (ch) => ch.topic === `realtime:${channelName}`,
        );

        if (existing) {
            accommodationNotifyChannelRef.current = existing;
            return;
        }

        accommodationNotifyChannelRef.current = supabase
            .channel(channelName)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "accommodation_requests",
                },
                (payload) => {
                    if (!isMountedRef.current) return;

                    const row = payload?.new;
                    if (!row) return;

                    const status = String(row.status ?? "pending")
                        .toLowerCase()
                        .replaceAll("-", "_")
                        .replaceAll(" ", "_");
                    if (status !== "pending") return;

                    const requestId =
                        row.id ??
                        `${row.created_at}-${row.technician_id ?? ""}`;
                    if (notifiedAccommodationIdsRef.current.has(requestId)) {
                        return;
                    }
                    notifiedAccommodationIdsRef.current.add(requestId);

                    const title = String(row.request_title ?? "").trim();
                    const message = title
                        ? `Pengajuan akomodasi baru: ${title}`
                        : "Ada pengajuan akomodasi baru";

                    if (accommodationToastTimerRef.current) {
                        clearTimeout(accommodationToastTimerRef.current);
                    }
                    setAccommodationToast(message);
                    accommodationToastTimerRef.current = setTimeout(() => {
                        if (isMountedRef.current) {
                            setAccommodationToast("");
                        }
                    }, 5500);

                    if ("Notification" in window) {
                        if (Notification.permission === "granted") {
                            new Notification("OneTrack", {
                                body: message,
                            });
                        } else if (Notification.permission === "default") {
                            Notification.requestPermission().then(
                                (permission) => {
                                    if (permission === "granted") {
                                        new Notification("OneTrack", {
                                            body: message,
                                        });
                                    }
                                },
                            );
                        }
                    }
                },
            );

        accommodationNotifyChannelRef.current.subscribe((status) => {
            if (status === "SUBSCRIBED") {
                console.log("[Sidebar] Subscribed to:", channelName);
            }
        });

        return () => {
            if (accommodationNotifyChannelRef.current) {
                supabase.removeChannel(accommodationNotifyChannelRef.current);
                accommodationNotifyChannelRef.current = null;
            }
        };
    }, [isOnline, loading, role, user?.id]);

    return (
        <>
            <aside
                className={`hidden h-screen shrink-0 border-r shadow-lg border-gray-100 bg-white px-3 py-4 transition-all duration-200 md:sticky md:top-0 md:block ${
                    collapsed ? "w-28" : "w-75"
                }`}
            >
                <nav className="flex h-full flex-col">
                    {/* Logo */}
                    <div
                        className={`mb-7 flex items-center ${
                            collapsed ? "justify-center" : "justify-between"
                        }`}
                    >
                        <div
                            className={`flex items-center ${
                                collapsed ? "flex-col gap-2" : "gap-3 p-4"
                            }`}
                        >
                            <img
                                src="/OneTrackLogo.svg"
                                alt="OneTrack"
                                className={
                                    collapsed
                                        ? "h-10 w-10 object-contain"
                                        : "h-12 w-12 object-contain"
                                }
                            />
                            {!collapsed && (
                                <h1 className="text-2xl font-bold text-sky-500">
                                    OneTrack
                                </h1>
                            )}
                        </div>

                        {!collapsed && (
                            <div className="flex items-center gap-1">
                                <NotificationCenter compact align="left" />
                                <button
                                    onClick={onToggle}
                                    className="rounded-lg p-2 text-slate-500 cursor-pointer hover:bg-slate-100"
                                >
                                    <PanelLeftClose size={18} />
                                </button>
                            </div>
                        )}
                    </div>

                    {collapsed && (
                        <div className="mb-4 flex flex-col items-center gap-2">
                            <NotificationCenter compact align="left" />
                            <button
                                onClick={onToggle}
                                className="flex flex-col items-center rounded-xl cursor-pointer px-1 py-2 text-xs text-slate-500 hover:bg-slate-100"
                            >
                                <PanelLeftOpen size={18} />
                                <span className="mt-1">Expand</span>
                            </button>
                        </div>
                    )}

                    {/* Menu */}
                    <ul
                        className={`min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1 ${
                            collapsed ? "px-1" : "px-2"
                        }`}
                    >
                        {menus.map(({ label, path, icon, badge, children }) => {
                            const hasChildren = Boolean(children?.length);
                            const parentActive =
                                hasChildren &&
                                location.pathname.startsWith(path);
                            return (
                                <li key={label}>
                                    <NavLink
                                        to={path}
                                        end={!hasChildren}
                                        className={({ isActive }) =>
                                            `no-underline! hover:no-underline! focus:no-underline! active:no-underline! visited:no-underline! w-full rounded-xl transition relative
                                    ${
                                        isActive || parentActive
                                            ? "bg-sky-100 text-sky-500"
                                            : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                                    }
                                    ${
                                        collapsed
                                            ? "flex flex-col items-center justify-center px-2 py-1.5 text-[12px] font-medium text-center"
                                            : "flex items-center gap-3 px-4 py-2.5 text-sm font-normal"
                                    }
                                `
                                        }
                                        style={{ textDecoration: "none" }}
                                    >
                                        <span className="relative inline-flex">
                                            {createElement(icon, {
                                                size: collapsed ? 18 : 20,
                                            })}

                                            {badge && (
                                                <span className="absolute -right-2 -top-2 inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] leading-4 text-white">
                                                    {badge}
                                                </span>
                                            )}
                                        </span>

                                        <span className={collapsed ? "mt-1" : "flex-1"}>
                                            {label}
                                        </span>
                                        {!collapsed && hasChildren && (
                                            <ChevronDown size={15} />
                                        )}
                                    </NavLink>
                                    {!collapsed && hasChildren && parentActive && (
                                        <ul className="mt-1 space-y-1 pl-8">
                                            {children.map((child) => (
                                                <li key={child.label}>
                                                    <NavLink
                                                        to={child.path}
                                                        end
                                                        className={({ isActive }) =>
                                                            `no-underline! hover:no-underline! flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition ${
                                                                isActive
                                                                    ? "bg-sky-50 font-semibold text-sky-600"
                                                                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                                                            }`
                                                        }
                                                        style={{ textDecoration: "none" }}
                                                    >
                                                        {createElement(child.icon, {
                                                            size: 16,
                                                        })}
                                                        <span className="min-w-0 flex-1 truncate">
                                                            {child.label}
                                                        </span>
                                                        {child.badge && (
                                                            <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] leading-4 text-white">
                                                                {child.badge}
                                                            </span>
                                                        )}
                                                    </NavLink>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </li>
                            );
                        })}
                    </ul>

                    {/* Footer */}
                    {/* trigger deploy */}
                    <div
                        className={`mt-auto ${
                            collapsed ? "space-y-3" : "space-y-5"
                        } pb-2`}
                    >
                        {!collapsed && <WebPushActivation compact />}
                        <button
                            type="button"
                            onClick={() => {
                                if (canOpenProfile) navigate("/profile");
                            }}
                            className={`flex w-full items-center gap-3 px-6 text-slate-500 ${
                                collapsed ? "flex-col text-[11px]" : "text-base"
                            } ${
                                canOpenProfile
                                    ? "cursor-pointer rounded-xl py-2 hover:bg-slate-100 hover:text-slate-700"
                                    : "cursor-default py-2"
                            }`}
                        >
                            <CircleUserRound size={collapsed ? 18 : 20} />
                            {!collapsed && (
                                <span className="truncate text-left">
                                    {identityLabel}
                                </span>
                            )}
                        </button>

                        <button
                            onClick={handleLogout}
                            className={`w-full rounded-xl text-slate-600 cursor-pointer hover:bg-red-100 hover:text-red-600 ${
                                collapsed
                                    ? "flex flex-col items-center px-2 py-2 text-[11px]"
                                    : "flex items-center gap-3 px-6 py-2 text-md"
                            }`}
                        >
                            <LogOut size={collapsed ? 18 : 20} />
                            <span className={collapsed ? "mt-1" : ""}>
                                Logout
                            </span>
                        </button>
                    </div>
                </nav>
            </aside>
            {newRequestToast && (
                <AppToast tone="sky">
                    {newRequestToast}
                </AppToast>
            )}
            {accommodationToast && (
                <AppToast tone="red">
                    {accommodationToast}
                </AppToast>
            )}
        </>
    );
}

export function MobileBottomNav() {
    const { role, profile, user, isOnline, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const stats = useRequestStats();
    const pendingAccommodationCount = usePendingAccommodationCount(
        role,
        user?.id,
        isOnline,
    );
    const pendingReimbursementCount = usePendingReimbursementCount(
        role,
        user?.id,
        isOnline,
    );
    const pendingLoanCount = usePendingLoanCount(role, user?.id, isOnline);
    const pendingBusinessTripApprovalCount = usePendingBusinessTripApprovalCount(
        role,
        user?.id,
        isOnline,
    );
    const pendingBusinessTripDisbursementCount =
        usePendingBusinessTripDisbursementCount(role, user?.id, isOnline);
    const pendingBusinessTripRealizationVerificationCount =
        usePendingBusinessTripRealizationVerificationCount(
            role,
            user?.id,
            isOnline,
        );
    const navRef = useRef(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [showTopNav, setShowTopNav] = useState(true);
    const [primaryCount, setPrimaryCount] = useState(4);
    const lastScrollRef = useRef(0);
    const MOBILE_TOP_NAV_HEIGHT = 72;
    const badgeByPath = {
        "/requests": stats.pending,
        "/technician/requests": stats.pending,
        "/services": stats.active,
        "/customer/request": null,
        "/management/accommodation": pendingAccommodationCount,
        "/admin/accommodation": pendingAccommodationCount,
        "/reimburse": pendingReimbursementCount,
        "/loans": pendingLoanCount,
        "/business-trip/approval": pendingBusinessTripApprovalCount,
        "/business-trip/disbursement": pendingBusinessTripDisbursementCount,
        "/business-trip/realization-verification":
            pendingBusinessTripRealizationVerificationCount,
    };
    const attachBadges = (menu) => {
        const children = menu.children?.map(attachBadges);
        const ownCount = badgeByPath[menu.path] ?? 0;
        const childCount =
            children?.reduce((sum, child) => sum + Number(child.badge ?? 0), 0) ??
            0;
        const count = ownCount + childCount;
        return {
            ...menu,
            children,
            badge: count > 0 ? count : null,
        };
    };
    const menus = getMenus(role, profile).map(attachBadges);
    const primaryMenus = menus.slice(0, primaryCount);
    const extraMenus = menus.slice(primaryCount);
    const canOpenProfile =
        role === "customer" ||
        role === "technician" ||
        role === "admin" ||
        role === "management";
    const identityLabel =
        `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
        profile?.email ||
        user?.user_metadata?.full_name?.trim() ||
        user?.email ||
        "User";

    useEffect(() => {
        const onScroll = () => {
            const current = window.scrollY || 0;
            if (current <= 8) {
                setShowTopNav(true);
                lastScrollRef.current = current;
                return;
            }
            if (current > lastScrollRef.current + 6) {
                setShowTopNav(false);
                setMenuOpen(false);
            } else if (current < lastScrollRef.current - 6) {
                setShowTopNav(true);
            }
            lastScrollRef.current = current;
        };

        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    useEffect(() => {
        const applyBodyOffset = () => {
            if (window.innerWidth < 768) {
                document.body.style.paddingTop = `${MOBILE_TOP_NAV_HEIGHT}px`;
            } else {
                document.body.style.paddingTop = "";
            }
        };

        applyBodyOffset();
        window.addEventListener("resize", applyBodyOffset);
        return () => {
            window.removeEventListener("resize", applyBodyOffset);
            document.body.style.paddingTop = "";
        };
    }, []);

    useEffect(() => {
        const recomputePrimaryCount = () => {
            const width = navRef.current?.clientWidth ?? window.innerWidth;
            if (!menus.length) {
                setPrimaryCount(0);
                return;
            }

            const maxSlots = width < 360 ? 4 : 5;
            const hasOverflow = menus.length > maxSlots;
            const nextPrimaryCount = hasOverflow
                ? Math.max(1, maxSlots - 1)
                : Math.min(menus.length, maxSlots);
            setPrimaryCount(nextPrimaryCount);
        };

        recomputePrimaryCount();
        window.addEventListener("resize", recomputePrimaryCount);
        window.addEventListener("orientationchange", recomputePrimaryCount);

        const observer =
            typeof ResizeObserver !== "undefined" && navRef.current
                ? new ResizeObserver(() => recomputePrimaryCount())
                : null;
        if (observer && navRef.current) {
            observer.observe(navRef.current);
        }

        return () => {
            window.removeEventListener("resize", recomputePrimaryCount);
            window.removeEventListener(
                "orientationchange",
                recomputePrimaryCount,
            );
            if (observer) observer.disconnect();
        };
    }, [
        role,
        profile?.technician_type,
        stats.pending,
        stats.active,
        pendingAccommodationCount,
        pendingReimbursementCount,
        pendingLoanCount,
        pendingBusinessTripApprovalCount,
        pendingBusinessTripDisbursementCount,
        pendingBusinessTripRealizationVerificationCount,
        menus,
    ]);

    const handleLogout = async () => {
        const queueStats = await getOfflineQueueStats({ userId: user?.id });
        if (queueStats.total > 0) {
            const shouldClear = window.confirm(
                `Ada ${queueStats.total} draft offline di perangkat ini. Hapus draft saat logout?`,
            );
            if (shouldClear) {
                await clearOfflineQueueItems({ userId: user?.id });
            }
        }
        await logout();
        navigate("/");
    };

    return (
        <>
            <header
                className={`fixed inset-x-0 top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur transition-transform duration-200 md:hidden ${
                    showTopNav ? "translate-y-0" : "-translate-y-full"
                }`}
            >
                <div className="flex min-h-18 items-center justify-between px-3 py-3">
                    <div className="inline-flex items-center gap-2">
                        <img
                            src="/OneTrackLogo.svg"
                            alt="SAP Logo"
                            className="h-9 w-9 object-contain"
                        />
                        <span className="text-sm font-semibold text-sky-500">
                            OneTrack
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <NotificationCenter compact />
                        <button
                            type="button"
                            onClick={() => setMenuOpen((prev) => !prev)}
                            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                        >
                            {menuOpen ? <X size={18} /> : <Menu size={18} />}
                        </button>
                    </div>
                </div>

                {menuOpen && (
                    <div className="border-t border-slate-200 px-3 py-2">
                        <p className="truncate text-xs text-slate-500">
                            {identityLabel}
                        </p>
                        {canOpenProfile && (
                            <button
                                type="button"
                                onClick={() => {
                                    setMenuOpen(false);
                                    navigate("/profile");
                                }}
                                className="mt-2 flex w-full items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                                Profile
                            </button>
                        )}
                        <div className="mt-2">
                            <WebPushActivation compact />
                        </div>
                        <button
                            type="button"
                            onClick={handleLogout}
                            className="mt-2 flex w-full items-center justify-center rounded-xl bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600"
                        >
                            Logout
                        </button>
                    </div>
                )}
            </header>

            <nav
                ref={navRef}
                className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white px-1 md:hidden"
            >
                <ul className="flex items-stretch gap-1 overflow-hidden">
                    {primaryMenus.map(({ label, path, icon, badge, children }) => {
                        const hasChildren = Boolean(children?.length);
                        const parentActive =
                            hasChildren && location.pathname.startsWith(path);
                        return (
                            <li key={label} className="min-w-0 flex-1">
                                <NavLink
                                    end={!hasChildren}
                                    to={path}
                                    className={({ isActive }) =>
                                        `no-underline! hover:no-underline! focus:no-underline! active:no-underline! visited:no-underline! relative flex h-full min-h-16 w-full items-center justify-center px-1 py-2 transition-colors duration-200 ${
                                            isActive || parentActive
                                                ? "text-sky-500 border-b-2 border-sky-500 font-semibold"
                                                : "text-slate-500 border-b-2 border-transparent hover:text-slate-700"
                                        }`
                                    }
                                    style={{ textDecoration: "none" }}
                                >
                                    <div className="flex min-w-0 max-w-full flex-col items-center gap-1">
                                        <span className="relative inline-flex">
                                            {createElement(icon, { size: 20 })}
                                            {badge && (
                                                <span className="absolute -right-2 -top-2 inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] leading-4 text-white">
                                                    {badge}
                                                </span>
                                            )}
                                        </span>
                                        <span className="line-clamp-2 max-w-full text-center text-[11px] font-medium leading-tight whitespace-normal wrap-break-words">
                                            {label}
                                        </span>
                                    </div>
                                </NavLink>
                            </li>
                        );
                    })}
                    {extraMenus.length > 0 && (
                        <li className="min-w-0 flex-1">
                            <button
                                type="button"
                                onClick={() => setMoreOpen(true)}
                                className="no-underline! hover:no-underline! focus:no-underline! active:no-underline! visited:no-underline! flex h-full min-h-16 w-full items-center justify-center px-1 py-2 text-slate-500 transition-colors duration-200 hover:text-slate-700"
                            >
                                <div className="flex min-w-0 max-w-full flex-col items-center gap-1">
                                    <MoreHorizontal size={20} />
                                    <span className="line-clamp-2 max-w-full text-center text-[11px] font-medium leading-tight whitespace-normal wrap-break-words">
                                        Lainnya
                                    </span>
                                </div>
                            </button>
                        </li>
                    )}
                </ul>
            </nav>

            {moreOpen && (
                <div className="fixed inset-0 z-50 md:hidden">
                    <button
                        type="button"
                        onClick={() => setMoreOpen(false)}
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
                        aria-label="Tutup menu lainnya"
                    />
                    <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-4 shadow-2xl">
                        <div className="mb-3 flex items-center justify-between">
                            <p className="text-sm font-semibold text-slate-700">
                                Menu Lainnya
                            </p>
                            <button
                                type="button"
                                onClick={() => setMoreOpen(false)}
                                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {extraMenus.map(({ label, path, icon, badge, children }) => {
                                const hasChildren = Boolean(children?.length);
                                const parentActive =
                                    hasChildren && location.pathname.startsWith(path);
                                return (
                                    <div
                                        key={label}
                                        className={hasChildren ? "col-span-2" : ""}
                                    >
                                        <NavLink
                                            end={!hasChildren}
                                            to={path}
                                            onClick={() => setMoreOpen(false)}
                                            className={({ isActive }) =>
                                                `no-underline! hover:no-underline! focus:no-underline! active:no-underline! visited:no-underline! flex items-center gap-2 rounded-2xl border px-3 py-3 text-sm font-medium transition ${
                                                    isActive || parentActive
                                                        ? "border-sky-200 bg-sky-50 text-sky-600"
                                                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                                                }`
                                            }
                                            style={{ textDecoration: "none" }}
                                        >
                                            <span className="relative inline-flex">
                                                {createElement(icon, { size: 18 })}
                                                {badge && (
                                                    <span className="absolute -right-2 -top-2 inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] leading-4 text-white">
                                                        {badge}
                                                    </span>
                                                )}
                                            </span>
                                            <span className="flex-1">{label}</span>
                                        </NavLink>
                                        {hasChildren && (
                                            <div className="mt-2 grid grid-cols-1 gap-2 pl-3">
                                                {children.map((child) => (
                                                    <NavLink
                                                        key={child.label}
                                                        end
                                                        to={child.path}
                                                        onClick={() =>
                                                            setMoreOpen(false)
                                                        }
                                                        className={({ isActive }) =>
                                                            `no-underline! hover:no-underline! flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-medium transition ${
                                                                isActive
                                                                    ? "border-sky-200 bg-sky-50 text-sky-600"
                                                                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                                                            }`
                                                        }
                                                        style={{ textDecoration: "none" }}
                                                    >
                                                        {createElement(child.icon, {
                                                            size: 16,
                                                        })}
                                                        <span className="flex-1">
                                                            {child.label}
                                                        </span>
                                                        {child.badge && (
                                                            <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] leading-4 text-white">
                                                                {child.badge}
                                                            </span>
                                                        )}
                                                    </NavLink>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
