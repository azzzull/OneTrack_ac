import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ChevronRight,
    CircleCheckBig,
    Clock3,
    MapPin,
    Search,
    Wrench,
    X,
} from "lucide-react";
import { Link } from "react-router-dom";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import Card from "../../components/card";
import useRequestStats from "../../hooks/useRequestStats";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import supabase from "../../supabaseClient";
import { formatDateUniversal } from "../../utils/dateFormatter";

const statusLabelByKey = {
    pending: "PENDING",
    in_progress: "IN PROGRESS",
    completed: "COMPLETED",
};

const statusClassByKey = {
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

const normalizeJob = (row) => {
    const statusRaw = String(
        pickFirst(row, ["status"], "pending"),
    ).toLowerCase();
    const status = statusLabelByKey[statusRaw] ? statusRaw : "pending";

    const trouble = pickFirst(
        row,
        ["trouble_description", "description", "notes", "issue_detail", "problem"],
        "",
    );
    const replacedParts = pickFirst(row, ["replaced_parts"], "");
    const reconditionedParts = pickFirst(row, ["reconditioned_parts"], "");
    const noteSections = [
        trouble ? `Problem: ${trouble}` : "",
        replacedParts ? `Part Diganti: ${replacedParts}` : "",
        reconditionedParts ? `Part Rekondisi: ${reconditionedParts}` : "",
    ].filter(Boolean);

    return {
        id: pickFirst(row, ["id"], crypto.randomUUID()),
        title: pickFirst(
            row,
            ["title", "job_title", "service_name", "name"],
            "Pekerjaan Tanpa Judul",
        ),
        location: pickFirst(
            row,
            ["address", "location", "site_address", "customer_address"],
            "-",
        ),
        room: pickFirst(row, ["room_location"], "-"),
        status,
        description: noteSections.length > 0 ? noteSections.join(" | ") : "-",
        customer: pickFirst(row, ["customer_name", "customer"], "-"),
        technician: pickFirst(row, ["technician_name", "technician"], "-"),
        date: pickFirst(row, ["updated_at", "created_at"], null),
    };
};

const formatDate = (value) => {
    return formatDateUniversal(value);
};

const formatOrderId = (value) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "-";
    if (raw.length <= 12) return raw.toUpperCase();
    return `${raw.slice(0, 8).toUpperCase()}-${raw.slice(-4).toUpperCase()}`;
};

const previewText = (value, max = 90) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "-";
    if (raw.length <= max) return raw;
    return `${raw.slice(0, max).trim()}...`;
};

function AdminDashboard() {
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const [latestJobs, setLatestJobs] = useState([]);
    const [selectedJob, setSelectedJob] = useState(null);
    const [loadingJobs, setLoadingJobs] = useState(true);
    const [search, setSearch] = useState("");
    const stats = useRequestStats();

    const jobStatusCards = [
        {
            title: "Pending",
            value: stats.pending,
            icon: Clock3,
            tone: "amber",
        },
        {
            title: "In Progress",
            value: stats.inProgress,
            icon: Wrench,
            tone: "sky",
        },
        {
            title: "Completed",
            value: stats.completed,
            icon: CircleCheckBig,
            tone: "emerald",
        },
    ];

    const loadLatestJobs = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from("requests")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(5);

            if (error) throw error;
            setLatestJobs((data ?? []).map((item) => normalizeJob(item)));
        } catch (error) {
            console.error("Error loading latest jobs:", error);
            setLatestJobs([]);
        } finally {
            setLoadingJobs(false);
        }
    }, []);

    useEffect(() => {
        const timerId = setTimeout(() => {
            loadLatestJobs();
        }, 0);

        const channel = supabase
            .channel("admin-latest-jobs")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "requests" },
                () => {
                    loadLatestJobs();
                },
            )
            .subscribe();

        return () => {
            clearTimeout(timerId);
            channel.unsubscribe();
        };
    }, [loadLatestJobs]);

    const filteredJobs = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        if (!keyword) return latestJobs;
        return latestJobs.filter((job) =>
            `${job.title} ${job.location} ${job.room} ${job.description} ${job.customer} ${job.technician} ${job.id} ${formatOrderId(job.id)}`
                .toLowerCase()
                .includes(keyword),
        );
    }, [latestJobs, search]);

    return (
        <div className="min-h-screen bg-sky-50">
            <div className="flex min-h-screen">
                <Sidebar
                    collapsed={sidebarCollapsed}
                    onToggle={toggleSidebar}
                />

                <div className="flex-1 p-4 pb-24 md:p-8 md:pb-8">
                    <h2 className="text-2xl font-semibold text-slate-800 md:text-3xl">
                        Service Hub
                    </h2>
                    <p className="mt-1 text-slate-600">
                        Kelola efisiensi armada servis Anda secara real-time.
                    </p>

                    <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {jobStatusCards.map((item) => (
                            <Card
                                key={item.title}
                                title={item.title}
                                value={item.value}
                                icon={item.icon}
                                tone={item.tone}
                            />
                        ))}
                    </section>

                    <section className="mt-9">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <h3 className="text-2xl font-semibold text-slate-900 md:text-2xl">
                                Pekerjaan Terbaru
                            </h3>
                            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
                                <label className="flex w-full items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-slate-500 md:w-72">
                                    <Search size={16} />
                                    <input
                                        type="text"
                                        value={search}
                                        onChange={(event) =>
                                            setSearch(event.target.value)
                                        }
                                        placeholder="Cari pekerjaan..."
                                        className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                                    />
                                </label>
                                <Link
                                    to="/requests"
                                    className="inline-flex items-center gap-1 text-md font-medium text-sky-500 no-underline hover:text-sky-600"
                                    style={{ textDecoration: "none" }}
                                >
                                    Lihat semua <ChevronRight size={18} />
                                </Link>
                            </div>
                        </div>

                        {loadingJobs ? (
                            <div className="mt-4 rounded-2xl bg-white p-6 shadow-sm">
                                <p className="text-base text-slate-500">
                                    Memuat pekerjaan terbaru...
                                </p>
                            </div>
                        ) : latestJobs.length === 0 ? (
                            <div className="mt-4 rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50 p-8">
                                <p className="text-base text-sky-700 md:text-lg">
                                    Belum ada pekerjaan yang di lakukan
                                </p>
                                <Link
                                    to="/jobs/new"
                                    className="mt-4 inline-flex rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white no-underline hover:bg-sky-600"
                                    style={{ textDecoration: "none" }}
                                >
                                    Buat New Job
                                </Link>
                            </div>
                        ) : filteredJobs.length === 0 ? (
                            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-6">
                                <p className="text-sm text-slate-500">
                                    Tidak ada pekerjaan yang cocok dengan pencarian.
                                </p>
                            </div>
                        ) : (
                            <ul className="mt-4 space-y-3">
                                {filteredJobs.map((job) => (
                                    <li key={job.id}>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedJob(job)}
                                            className="w-full cursor-pointer rounded-2xl bg-white p-4 text-left shadow-sm transition hover:shadow-md"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex items-start gap-3">
                                                    <span className="inline-flex rounded-full bg-slate-100 p-3 text-slate-400">
                                                        <Wrench size={20} />
                                                    </span>
                                                    <div className="min-w-0">
                                                        <p className="text-base font-medium text-slate-900 md:text-lg">
                                                            {job.title}
                                                        </p>
                                                        <p className="mt-1 break-all text-xs text-slate-500">
                                                            Order ID:{" "}
                                                            <span title={job.id ?? "-"}>
                                                                {formatOrderId(
                                                                    job.id,
                                                                )}
                                                            </span>
                                                        </p>
                                                        <p className="mt-1 text-sm text-slate-500 md:text-base">
                                                            {job.location}
                                                        </p>
                                                        <p className="mt-1 text-xs text-slate-500">
                                                            Ruangan:{" "}
                                                            {previewText(
                                                                job.room,
                                                                48,
                                                            )}
                                                        </p>
                                                        <p className="mt-1 text-xs text-slate-500">
                                                            Deskripsi:{" "}
                                                            {previewText(
                                                                job.description,
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="text-right">
                                                    <span
                                                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                                            statusClassByKey[
                                                                job.status
                                                            ] ??
                                                            statusClassByKey.pending
                                                        }`}
                                                    >
                                                        {statusLabelByKey[
                                                            job.status
                                                        ] ?? "PENDING"}
                                                    </span>
                                                    <p className="mt-2 text-sm text-slate-500">
                                                        {formatDate(job.date)}
                                                    </p>
                                                </div>
                                            </div>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            </div>

            <MobileBottomNav />

            {selectedJob && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
                    <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h4 className="text-xl font-semibold text-slate-900 md:text-2xl">
                                    {selectedJob.title}
                                </h4>
                                <p className="mt-1 text-base text-slate-500">
                                    Detail pekerjaan terbaru
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedJob(null)}
                                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="rounded-xl bg-slate-50 p-4">
                                <p className="text-xs uppercase tracking-wide text-slate-500">
                                    Status
                                </p>
                                <p className="mt-2 text-sm font-semibold text-slate-800">
                                    {statusLabelByKey[selectedJob.status] ??
                                        "PENDING"}
                                </p>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-4">
                                <p className="text-xs uppercase tracking-wide text-slate-500">
                                    Tanggal
                                </p>
                                <p className="mt-2 text-sm font-semibold text-slate-800">
                                    {formatDate(selectedJob.date)}
                                </p>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-4 md:col-span-2">
                                <p className="text-xs uppercase tracking-wide text-slate-500">
                                    Order ID
                                </p>
                                <p className="mt-2 break-all text-sm font-semibold text-slate-800">
                                    <span title={selectedJob.id ?? "-"}>
                                        {formatOrderId(selectedJob.id)}
                                    </span>
                                </p>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-4 md:col-span-2">
                                <p className="text-xs uppercase tracking-wide text-slate-500">
                                    Lokasi
                                </p>
                                <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                                    <MapPin size={14} />
                                    {selectedJob.location}
                                </p>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-4">
                                <p className="text-xs uppercase tracking-wide text-slate-500">
                                    Customer
                                </p>
                                <p className="mt-2 text-sm font-semibold text-slate-800">
                                    {selectedJob.customer}
                                </p>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-4">
                                <p className="text-xs uppercase tracking-wide text-slate-500">
                                    Teknisi
                                </p>
                                <p className="mt-2 text-sm font-semibold text-slate-800">
                                    {selectedJob.technician}
                                </p>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-4 md:col-span-2">
                                <p className="text-xs uppercase tracking-wide text-slate-500">
                                    Catatan
                                </p>
                                <p className="mt-2 text-sm font-semibold text-slate-800">
                                    {selectedJob.description}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default AdminDashboard;
