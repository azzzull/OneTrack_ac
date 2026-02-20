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
import { useAuth } from "../../context/AuthContext";
import supabase from "../../supabaseClient";

const menuByRole = {
    admin: [
        { label: "Dashboard", path: "/admin", icon: LayoutDashboard },
        { label: "Requests", path: "/requests", icon: List, badge: 1 },
        { label: "New Job", path: "/jobs/new", icon: Plus },
        { label: "Master Data", path: "/master-data", icon: Database },
        { label: "Reports", path: "/reports", icon: PieChart },
    ],
    technician: [
        { label: "Dashboard", path: "/technician", icon: LayoutDashboard },
        { label: "My Tasks", path: "/tasks", icon: Wrench, badge: 1 },
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
    const menus = getMenus(role);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate("/");
    };

    return (
        <aside
            className={`hidden h-screen shrink-0 border-r shadow-lg border-gray-100 bg-white px-3 py-4 transition-all duration-200 md:block ${
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
                        <span className="rounded-2xl bg-sky-500 p-3 text-white">
                            <Wrench size={20} />
                        </span>
                        <h1
                            className={`font-bold text-sky-500 ${
                                collapsed ? "text-xs" : "text-2xl"
                            }`}
                        >
                            OneTrack
                        </h1>
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
                                    ` no-underline hover:no-underline w-full rounded-xl transition relative
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
                        <span className="truncate">
                            {user?.email ?? "admin@onetrack.com"}
                        </span>
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
    const menus = getMenus(role);

    return (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white px-2 py-2 md:hidden">
            <ul className="flex items-center justify-between gap-1">
                {menus.map(({ label, path, icon, badge }) => (
                    <li key={label} className="flex-1">
                        <NavLink
                            to={path}
                            className={({ isActive }) =>
                                ` no-underline hover:no-underline flex w-full flex-col items-center justify-center rounded-xl px-1 py-2 text-xs font-medium transition relative
                                ${
                                    isActive
                                        ? "bg-sky-100 text-sky-500"
                                        : "text-slate-500 hover:bg-slate-100"
                                }
                            `
                            }
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
