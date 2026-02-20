import { useCallback, useEffect, useMemo, useState } from "react";
import {
    CalendarDays,
    ListFilter,
    MapPin,
    Search,
    UserRound,
    Wrench,
} from "lucide-react";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import supabase from "../../supabaseClient";

const FILTERS = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "in_progress", label: "In Progress" },
    { key: "completed", label: "Completed" },
];

const STATUS_LABELS = {
    pending: "PENDING",
    in_progress: "IN PROGRESS",
    completed: "COMPLETED",
};

const STATUS_STYLES = {
    pending: "bg-amber-100 text-amber-700",
    in_progress: "bg-blue-100 text-blue-700",
    completed: "bg-emerald-100 text-emerald-700",
};

const pickFirst = (obj, keys, fallback = "") => {
    for (const key of keys) {
        const value = obj?.[key];
        if (value !== null && value !== undefined && value !== "") {
            return value;
        }
    }
    return fallback;
};

const normalizeRequest = (row) => {
    const rawStatus = String(
        pickFirst(row, ["status"], "pending"),
    ).toLowerCase();
    const status = STATUS_LABELS[rawStatus] ? rawStatus : "pending";

    return {
        id: pickFirst(row, ["id"], `${Math.random()}`),
        title: pickFirst(
            row,
            ["title", "job_title", "service_name", "name"],
            "Pekerjaan Tanpa Judul",
        ),
        address: pickFirst(
            row,
            ["address", "location", "site_address", "customer_address"],
            "-",
        ),
        phone: pickFirst(
            row,
            ["phone", "phone_number", "customer_phone", "contact_phone"],
            "-",
        ),
        assignee: pickFirst(
            row,
            ["technician_name", "assignee", "crew_name", "team_name"],
            "-",
        ),
        requester: pickFirst(
            row,
            ["customer_name", "requester", "customer"],
            "-",
        ),
        date: pickFirst(row, ["updated_at", "created_at"], null),
        status,
    };
};

const formatDate = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";

    return new Intl.DateTimeFormat("en-US", {
        month: "numeric",
        day: "numeric",
        year: "numeric",
    }).format(date);
};

export default function AdminRequestsPage() {
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const [activeFilter, setActiveFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadRequests = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from("requests")
                .select("*")
                .order("created_at", { ascending: false });

            if (error) throw error;
            setRequests((data ?? []).map((row) => normalizeRequest(row)));
        } catch (error) {
            console.error("Error loading requests:", error);
            setRequests([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const timerId = setTimeout(() => {
            loadRequests();
        }, 0);

        const channel = supabase
            .channel("admin-requests-page")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "requests" },
                () => {
                    loadRequests();
                },
            )
            .subscribe();

        return () => {
            clearTimeout(timerId);
            supabase.removeChannel(channel);
        };
    }, [loadRequests]);

    const filteredRequests = useMemo(() => {
        const keyword = search.trim().toLowerCase();

        return requests.filter((item) => {
            const matchFilter =
                activeFilter === "all" ? true : item.status === activeFilter;
            const matchSearch = keyword
                ? `${item.title} ${item.address}`
                      .toLowerCase()
                      .includes(keyword)
                : true;
            return matchFilter && matchSearch;
        });
    }, [activeFilter, requests, search]);

    return (
        <div className="min-h-screen bg-sky-50">
            <div className="flex min-h-screen">
                <Sidebar
                    collapsed={sidebarCollapsed}
                    onToggle={toggleSidebar}
                />

                <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <h1 className="text-3xl font-semibold text-slate-900">
                            Daftar Pekerjaan
                        </h1>

                        <label className="flex w-full items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-slate-500 md:max-w-sm">
                            <Search size={18} />
                            <input
                                type="text"
                                value={search}
                                onChange={(event) =>
                                    setSearch(event.target.value)
                                }
                                placeholder="Cari nama atau alamat..."
                                className="w-full bg-transparent text-base text-slate-700 outline-none placeholder:text-slate-400"
                            />
                        </label>
                    </div>

                    <div className="mt-6 inline-flex rounded-full border border-slate-200 bg-white p-1">
                        {FILTERS.map((filter) => (
                            <button
                                key={filter.key}
                                type="button"
                                onClick={() => setActiveFilter(filter.key)}
                                className={`rounded-full px-6 py-2 cursor-pointer text-md transition ${
                                    activeFilter === filter.key
                                        ? "bg-sky-500 font-semibold text-white"
                                        : "font-medium text-slate-600 hover:bg-slate-100"
                                }`}
                            >
                                {filter.label}
                            </button>
                        ))}
                    </div>

                    <section className="mt-6 space-y-3">
                        {loading ? (
                            <div className="rounded-2xl bg-white p-6 shadow-sm">
                                <p className="text-base text-slate-500">
                                    Memuat daftar pekerjaan...
                                </p>
                            </div>
                        ) : filteredRequests.length === 0 ? (
                            <div className="rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50 p-8">
                                <p className="text-base text-sky-700">
                                    Belum ada data pekerjaan
                                </p>
                            </div>
                        ) : (
                            filteredRequests.map((item) => (
                                <article
                                    key={item.id}
                                    className="overflow-hidden rounded-2xl bg-white shadow-sm"
                                >
                                    <div className="grid grid-cols-1 md:grid-cols-[1fr_190px]">
                                        <div className="p-5">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <h2 className="text-3xl font-semibold text-slate-900">
                                                        {item.title}
                                                    </h2>
                                                    <p className="mt-2 inline-flex items-center gap-2 text-xl text-slate-500">
                                                        <MapPin size={16} />
                                                        {item.address}
                                                    </p>
                                                </div>

                                                <span
                                                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                                        STATUS_STYLES[
                                                            item.status
                                                        ] ??
                                                        STATUS_STYLES.pending
                                                    }`}
                                                >
                                                    {STATUS_LABELS[
                                                        item.status
                                                    ] ?? "PENDING"}
                                                </span>
                                            </div>

                                            <div className="mt-4 flex flex-wrap items-center gap-6 text-base text-slate-500">
                                                <p className="inline-flex items-center gap-2">
                                                    <UserRound size={14} />
                                                    {item.phone}
                                                </p>
                                                <p className="inline-flex items-center gap-2">
                                                    <Wrench size={14} />
                                                    {item.assignee}
                                                </p>
                                            </div>
                                        </div>

                                        <aside className="border-l border-slate-200 bg-slate-50 p-5">
                                            <p className="inline-flex items-center gap-2 text-base text-slate-600">
                                                <CalendarDays size={15} />
                                                {formatDate(item.date)}
                                            </p>
                                            <p className="mt-3 inline-flex items-center gap-2 text-base text-slate-600">
                                                <ListFilter size={15} />
                                                {item.requester}
                                            </p>
                                        </aside>
                                    </div>
                                </article>
                            ))
                        )}
                    </section>
                </main>
            </div>

            <MobileBottomNav />
        </div>
    );
}
