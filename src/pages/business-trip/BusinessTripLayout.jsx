/* eslint-disable react-refresh/only-export-components */
import { createElement } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CalendarDays, ClipboardList, Plane } from "lucide-react";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import { businessTripUi } from "./businessTripUi";

export default function BusinessTripLayout({
    action,
    title,
    children,
    showBack = true,
}) {
    const { collapsed, toggle } = useSidebarCollapsed();
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900">
            <div className="flex min-h-screen">
                <Sidebar collapsed={collapsed} onToggle={toggle} />
                <div className="min-w-0 flex-1 transition-all duration-300">
                    <header className="sticky top-0 z-30 bg-white text-slate-900 shadow-sm ring-1 ring-slate-200 md:static">
                        <div className="flex w-full items-center gap-2.5 px-3.5 py-2.5 md:px-6 xl:px-8">
                            {showBack && (
                                <button
                                    type="button"
                                    onClick={() => navigate(-1)}
                                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 active:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-sky-100"
                                    aria-label="Kembali"
                                    title="Kembali"
                                >
                                    <ArrowLeft size={18} />
                                </button>
                            )}
                            <div className="min-w-0 flex-1">
                                {showBack && (
                                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-sky-500">
                                        <Plane size={15} />
                                        Business Trip
                                    </div>
                                )}
                                <h1 className="mt-0.5 truncate text-[15px] font-bold md:text-lg">
                                    {title}
                                </h1>
                            </div>
                            {action}
                        </div>
                    </header>

                    <main className="min-h-screen w-full px-3 pb-28 pt-2.5 md:px-6 md:pb-10 md:pt-4 xl:px-8">
                        {children}
                    </main>
                </div>
            </div>
            <MobileBottomNav />
        </div>
    );
}

export function PlaceholderCard({
    icon: Icon = ClipboardList,
    title,
    children,
}) {
    return (
        <section className={businessTripUi.section}>
            <div className="flex items-start gap-3">
                <span className="rounded-xl bg-sky-50 p-2.5 text-sky-600">
                    {createElement(Icon, { size: 20 })}
                </span>
                <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-slate-950">
                        {title}
                    </h3>
                    <div className="mt-3 text-sm leading-6 text-slate-600">
                        {children}
                    </div>
                </div>
            </div>
        </section>
    );
}

export function StaticInfoGrid({ items }) {
    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map((item) => (
                <div
                    key={item.label}
                    className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {item.label}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                        {item.value}
                    </p>
                </div>
            ))}
        </div>
    );
}

export const businessTripDummySummary = [
    { label: "Estimasi tanggal", value: "24 Jul 2026 - 26 Jul 2026" },
    { label: "Tujuan", value: "Kunjungan customer dan koordinasi project" },
    { label: "Inisiator", value: "Management" },
    { label: "Status", value: "Draft UI" },
];

export const businessTripAgendaPreview = [
    "Kickoff meeting dengan customer",
    "Survey lokasi dan kebutuhan instalasi",
    "Sinkronisasi hasil kunjungan dengan tim internal",
];

export { CalendarDays };
