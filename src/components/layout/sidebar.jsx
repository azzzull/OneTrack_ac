import { createElement, useEffect, useRef, useState } from "react";
import {
    Wrench,
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
    CalendarDays,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import supabase from "../../supabaseClient";
import useRequestStats from "../../hooks/useRequestStats";
import {
    cleanupAllChannels,
    createUniqueChannelName,
} from "../../utils/realtimeChannelManager";

const menuByRole = {
    admin: [
        { label: "Dashboard", path: "/admin", icon: LayoutDashboard },
        { label: "Daftar Pekerjaan", path: "/requests", icon: List },
        { label: "New Job", path: "/jobs/new", icon: Plus },
        { label: "Master Data", path: "/master-data", icon: Database },
        { label: "Absensi", path: "/admin/attendance", icon: CalendarDays },
    ],
    technician: [
        { label: "Dashboard", path: "/technician", icon: LayoutDashboard },
        { label: "Requests", path: "/technician/requests", icon: List },
        { label: "New Job", path: "/jobs/new", icon: Plus },
        {
            label: "History Absensi",
            path: "/technician/attendance",
            icon: CalendarDays,
        },
    ],
    customer: [
        { label: "Dashboard", path: "/customer", icon: LayoutDashboard },
        { label: "My Service", path: "/services", icon: List },
        { label: "Request", path: "/customer/request", icon: Plus },
    ],
};

const getMenus = (role) => menuByRole[role] ?? [];

export default function Sidebar({ collapsed = false, onToggle }) {
    const { user, role, profile, loading } = useAuth();
    const navigate = useNavigate();
    const stats = useRequestStats();
    const [newRequestToast, setNewRequestToast] = useState("");
    const toastTimerRef = useRef(null);
    const notifiedRequestIdsRef = useRef(new Set());
    const channelRef = useRef(null);
    const isMountedRef = useRef(true);
    const menus = getMenus(role).map((menu) => {
        const badgeByPath = {
            "/requests": stats.pending,
            "/technician/requests": stats.pending,
            "/services": stats.active,
            "/customer/request": null,
        };

        const count = badgeByPath[menu.path] ?? 0;
        return {
            ...menu,
            badge: count > 0 ? count : null,
        };
    });

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate("/");
    };
    const identityLabel =
        `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
        profile?.email ||
        user?.user_metadata?.full_name?.trim() ||
        user?.email ||
        "admin@onetrack.com";
    const canOpenProfile = role === "customer" || role === "technician";

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (toastTimerRef.current) {
                clearTimeout(toastTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (loading || role !== "technician" || !user?.id) return;

        // Async channel setup with proper cleanup
        const setupChannel = async () => {
            // ✅ CRITICAL FIX: Cleanup ALL existing channels before creating new one
            await cleanupAllChannels();

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
                        const status = String(
                            row.status ?? "pending",
                        )
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
    }, [loading, role, user?.id]);

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
                                src="/saplogo.svg"
                                alt="SAP Logo"
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
                            <button
                                onClick={onToggle}
                                className="rounded-lg p-2 text-slate-500 cursor-pointer hover:bg-slate-100"
                            >
                                <PanelLeftClose size={18} />
                            </button>
                        )}
                    </div>

                    {collapsed && (
                        <button
                            onClick={onToggle}
                            className="mb-4 flex flex-col items-center rounded-xl cursor-pointer px-1 py-2 text-xs text-slate-500 hover:bg-slate-100"
                        >
                            <PanelLeftOpen size={18} />
                            <span className="mt-1">Expand</span>
                        </button>
                    )}

                    {/* Menu */}
                    <ul className={`space-y-2 ${collapsed ? "px-1" : "px-2"}`}>
                        {menus.map(({ label, path, icon, badge }) => (
                            <li key={label}>
                                <NavLink
                                    to={path}
                                    end
                                    className={({ isActive }) =>
                                        `no-underline! hover:no-underline! focus:no-underline! active:no-underline! visited:no-underline! w-full rounded-xl transition relative
                                    ${
                                        isActive
                                            ? "bg-sky-100 text-sky-500"
                                            : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                                    }
                                    ${
                                        collapsed
                                            ? "flex flex-col items-center justify-center px-2 py-2 text-[11px] font-medium text-center"
                                            : "flex items-center gap-4 px-5 py-3 text-md"
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

                                    <span className={collapsed ? "mt-1" : ""}>
                                        {label}
                                    </span>
                                </NavLink>
                            </li>
                        ))}
                    </ul>

                    {/* Footer */}
                    <div
                        className={`mt-auto ${
                            collapsed ? "space-y-3" : "space-y-5"
                        } pb-2`}
                    >
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
                <div className="fixed right-4 top-4 z-80 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-700 shadow-lg">
                    {newRequestToast}
                </div>
            )}
        </>
    );
}

export function MobileBottomNav() {
    const { role, profile, user } = useAuth();
    const navigate = useNavigate();
    const stats = useRequestStats();
    const [menuOpen, setMenuOpen] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [showTopNav, setShowTopNav] = useState(true);
    const lastScrollRef = useRef(0);
    const MOBILE_TOP_NAV_HEIGHT = 72;
    const menus = getMenus(role).map((menu) => {
        const badgeByPath = {
            "/requests": stats.pending,
            "/technician/requests": stats.pending,
            "/services": stats.active,
            "/customer/request": null,
        };

        const count = badgeByPath[menu.path] ?? 0;
        return {
            ...menu,
            badge: count > 0 ? count : null,
        };
    });
    const primaryCount = 4;
    const primaryMenus = menus.slice(0, primaryCount);
    const extraMenus = menus.slice(primaryCount);
    const canOpenProfile = role === "customer" || role === "technician";
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

    const handleLogout = async () => {
        await supabase.auth.signOut();
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
                            src="/saplogo.svg"
                            alt="SAP Logo"
                            className="h-9 w-9 object-contain"
                        />
                        <span className="text-sm font-semibold text-sky-500">
                            OneTrack
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setMenuOpen((prev) => !prev)}
                        className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                    >
                        {menuOpen ? <X size={18} /> : <Menu size={18} />}
                    </button>
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

            <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white md:hidden">
                <ul className="flex items-center justify-around gap-0">
                    {primaryMenus.map(({ label, path, icon, badge }) => (
                        <li key={label} className="flex-1">
                            <NavLink
                                end
                                to={path}
                                className={({ isActive }) =>
                                    `no-underline! hover:no-underline! focus:no-underline! active:no-underline! visited:no-underline! relative block px-2 py-2.5 transition-colors duration-200 ${
                                        isActive
                                            ? "text-sky-500 border-b-2 border-sky-500 font-semibold"
                                            : "text-slate-500 border-b-2 border-transparent hover:text-slate-700"
                                    }`
                                }
                                style={{ textDecoration: "none" }}
                            >
                                <div className="flex flex-col items-center gap-1">
                                    <span className="relative inline-flex">
                                        {createElement(icon, { size: 20 })}
                                        {badge && (
                                            <span className="absolute -right-2 -top-2 inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] leading-4 text-white">
                                                {badge}
                                            </span>
                                        )}
                                    </span>
                                    <span className="text-xs font-medium truncate">
                                        {label}
                                    </span>
                                </div>
                            </NavLink>
                        </li>
                    ))}
                    {extraMenus.length > 0 && (
                        <li className="flex-1">
                            <button
                                type="button"
                                onClick={() => setMoreOpen(true)}
                                className="no-underline! hover:no-underline! focus:no-underline! active:no-underline! visited:no-underline! block w-full px-2 py-2.5 text-slate-500 transition-colors duration-200 hover:text-slate-700"
                            >
                                <div className="flex flex-col items-center gap-1">
                                    <MoreHorizontal size={20} />
                                    <span className="text-xs font-medium truncate">
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
                            {extraMenus.map(({ label, path, icon, badge }) => (
                                <NavLink
                                    key={label}
                                    end
                                    to={path}
                                    onClick={() => setMoreOpen(false)}
                                    className={({ isActive }) =>
                                        `no-underline! hover:no-underline! focus:no-underline! active:no-underline! visited:no-underline! flex items-center gap-2 rounded-2xl border px-3 py-3 text-sm font-medium transition ${
                                            isActive
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
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
