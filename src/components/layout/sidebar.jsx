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
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import supabase from "../../supabaseClient";

const menuByRole = {
    admin: [
        { label: "Dashboard", icon: LayoutDashboard, active: true },
        { label: "Requests", icon: List },
        { label: "New Job", icon: Plus },
        { label: "Master Data", icon: Database },
        { label: "Reports", icon: PieChart },
    ],
};

function getMenus(role) {
    return menuByRole[role] ?? menuByRole.admin;
}

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
            className={`hidden h-screen shrink-0 border-r border-gray-200 bg-white px-3 py-4 transition-all duration-200 md:block ${
                collapsed ? "w-28" : "w-75"
            }`}
        >
            <nav className="flex h-full flex-col">
                <div
                    className={`mb-7 flex items-center ${collapsed ? "justify-center" : "justify-between"}`}
                >
                    <div
                        className={`flex items-center ${collapsed ? "flex-col gap-2" : "gap-3 p-4"}`}
                    >
                        <span className="rounded-2xl bg-sky-500 p-3 text-white">
                            <Wrench size={20} />
                        </span>
                        {collapsed ? (
                            <h1 className="text-xs font-semibold text-sky-500">
                                OneTrack
                            </h1>
                        ) : (
                            <h1 className="text-2xl font-bold leading-none text-sky-500">
                                OneTrack
                            </h1>
                        )}
                    </div>

                    {!collapsed ? (
                        <button
                            type="button"
                            onClick={onToggle}
                            className="rounded-lg p-2 text-slate-500 cursor-pointer hover:bg-slate-100 hover:text-slate-700"
                        >
                            <PanelLeftClose size={18} />
                        </button>
                    ) : null}
                </div>

                {collapsed ? (
                    <button
                        type="button"
                        onClick={onToggle}
                        className="mb-4 flex w-full flex-col items-center rounded-xl px-1 py-2 text-xs cursor-pointer text-slate-500 hover:bg-slate-100"
                    >
                        <PanelLeftOpen size={18} />
                        <span className="mt-1">Expand</span>
                    </button>
                ) : null}

                <ul className={`space-y-2 ${collapsed ? "px-1" : "px-2"}`}>
                    {menus.map((item) => {
                        const Icon = item.icon;

                        return (
                            <li key={item.label}>
                                <button
                                    type="button"
                                    className={`w-full rounded-2xl transition ${
                                        item.active
                                            ? "bg-sky-100 text-sky-500"
                                            : "text-slate-500 hover:bg-slate-100"
                                    } ${
                                        collapsed
                                            ? "flex flex-col items-center px-2 py-2 text-[11px] font-medium cursor-pointer hover:text-slate-700"
                                            : "flex items-center gap-4 px-5 py-3 text-left text-md cursor-pointer hover:text-slate-700 "
                                    }`}
                                >
                                    <Icon size={collapsed ? 18 : 20} />
                                    <span className={collapsed ? "mt-1" : ""}>
                                        {item.label}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>

                <div
                    className={`mt-auto ${collapsed ? "space-y-3" : "space-y-5"} pb-2`}
                >
                    {collapsed ? (
                        <div className="flex flex-col items-center gap-1 px-2 text-[11px] text-slate-500">
                            <CircleUserRound size={18} />
                            <span className="text-center">User</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 px-6 text-base text-slate-500">
                            <CircleUserRound size={20} />
                            <span>{user?.email ?? "admin@onetrack.com"}</span>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleLogout}
                        className={`w-full rounded-xl text-slate-600 hover:bg-red-100 ${
                            collapsed
                                ? "flex flex-col items-center px-2 py-2 cursor-pointer text-[11px] hover:text-red-600"
                                : "flex items-center gap-3 px-6 py-2 text-left text-md cursor-pointer hover:text-red-600  "
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
                {menus.map((item) => {
                    const Icon = item.icon;

                    return (
                        <li key={item.label} className="flex-1">
                            <button
                                type="button"
                                className={`flex w-full flex-col items-center justify-center rounded-xl px-1 py-2 text-xs font-medium transition ${
                                    item.active
                                        ? "bg-sky-100 text-sky-500"
                                        : "text-slate-500 hover:bg-slate-100"
                                }`}
                            >
                                <Icon size={18} />
                                <span className="mt-1">{item.label}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
