import { createElement } from "react";
import {
    Wrench,
    LayoutDashboard,
    List,
    Plus,
    Database,
    PieChart,
    CircleUserRound,
    LogOut,
    PanelLeftClose,
    PanelLeftOpen,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import supabase from "../../supabaseClient";
import useRequestStats from "../../hooks/useRequestStats";

const menuByRole = {
    admin: [
        { label: "Dashboard", path: "/admin", icon: LayoutDashboard },
        { label: "Requests", path: "/requests", icon: List },
        { label: "New Job", path: "/jobs/new", icon: Plus },
        { label: "Master Data", path: "/master-data", icon: Database },
        { label: "Reports", path: "/reports", icon: PieChart },
    ],
    technician: [
        { label: "Dashboard", path: "/technician", icon: LayoutDashboard },
        { label: "My Tasks", path: "/tasks", icon: Wrench },
    ],
    customer: [
        { label: "Dashboard", path: "/customer", icon: LayoutDashboard },
        { label: "My Service", path: "/services", icon: List },
    ],
};

const getMenus = (role) => menuByRole[role] ?? [];

export default function Sidebar({ collapsed = false, onToggle }) {
    const { user, role } = useAuth();
    const navigate = useNavigate();
    const stats = useRequestStats();
    const menus = getMenus(role).map((menu) => {
        const badgeByPath = {
            "/requests": stats.pending,
            "/tasks": stats.inProgress,
            "/services": stats.active,
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
        user?.user_metadata?.full_name?.trim() ||
        user?.email ||
        "admin@onetrack.com";

    return (
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
                            className={collapsed ? "h-10 w-10 object-contain" : "h-12 w-12 object-contain"}
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
                                className={({ isActive }) =>
                                    ` no-underline! hover:no-underline! focus:no-underline! active:no-underline! visited:no-underline! w-full rounded-xl transition relative
                                    ${
                                        isActive
                                            ? "bg-sky-100 text-sky-500"
                                            : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                                    }
                                    ${
                                        collapsed
                                            ? "flex flex-col items-center px-2 py-2 text-[11px] font-medium"
                                            : "flex items-center gap-4 px-5 py-3 text-md"
                                    }
                                `
                                }
                                style={{ textDecoration: "none" }}
                            >
                                {createElement(icon, {
                                    size: collapsed ? 18 : 20,
                                })}

                                <span className={collapsed ? "mt-1" : ""}>
                                    {label}
                                </span>

                                {/* Notification Badge */}
                                {badge && (
                                    <span className="absolute top-2 right-3 rounded-full bg-red-500 px-1.5 text-[10px] text-white">
                                        {badge}
                                    </span>
                                )}
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
                    <div
                        className={`flex items-center gap-3 px-6 text-slate-500 ${
                            collapsed ? "flex-col text-[11px]" : "text-base"
                        }`}
                    >
                        <CircleUserRound size={collapsed ? 18 : 20} />
                        {!collapsed && (
                            <span className="truncate">{identityLabel}</span>
                        )}
                    </div>

                    <button
                        onClick={handleLogout}
                        className={`w-full rounded-xl text-slate-600 cursor-pointer hover:bg-red-100 hover:text-red-600 ${
                            collapsed
                                ? "flex flex-col items-center px-2 py-2 text-[11px]"
                                : "flex items-center gap-3 px-6 py-2 text-md"
                        }`}
                    >
                        <LogOut size={collapsed ? 18 : 20} />
                        <span className={collapsed ? "mt-1" : ""}>Logout</span>
                    </button>
                </div>
            </nav>
        </aside>
    );
}

export function MobileBottomNav() {
    const { role } = useAuth();
    const stats = useRequestStats();
    const menus = getMenus(role).map((menu) => {
        const badgeByPath = {
            "/requests": stats.pending,
            "/tasks": stats.inProgress,
            "/services": stats.active,
        };

        const count = badgeByPath[menu.path] ?? 0;
        return {
            ...menu,
            badge: count > 0 ? count : null,
        };
    });

    return (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white px-2 py-2 md:hidden">
            <ul className="flex items-center justify-between gap-1">
                {menus.map(({ label, path, icon, badge }) => (
                    <li key={label} className="flex-1">
                        <NavLink
                            to={path}
                            className={({ isActive }) =>
                                ` no-underline! hover:no-underline! focus:no-underline! active:no-underline! visited:no-underline! flex w-full flex-col items-center justify-center rounded-xl px-1 py-2 text-xs font-medium transition relative
                                ${
                                    isActive
                                        ? "bg-sky-100 text-sky-500"
                                        : "text-slate-500 hover:bg-slate-100"
                                }
                            `
                            }
                            style={{ textDecoration: "none" }}
                        >
                            {createElement(icon, { size: 18 })}
                            <span className="mt-1">{label}</span>

                            {badge && (
                                <span className="absolute top-1 right-4 rounded-full bg-red-500 px-1.5 text-[10px] text-white">
                                    {badge}
                                </span>
                            )}
                        </NavLink>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
