import { useCallback, useEffect, useState } from "react";
import {
    ChevronRight,
    CircleCheckBig,
    Clock3,
    MapPin,
    Wrench,
    X,
} from "lucide-react";
import { Link } from "react-router-dom";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import Card from "../../components/card";
import useRequestStats from "../../hooks/useRequestStats";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import supabase from "../../supabaseClient";

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
        status,
        description: pickFirst(
            row,
            ["description", "notes", "issue_detail", "problem"],
            "-",
        ),
        customer: pickFirst(row, ["customer_name", "customer"], "-"),
        technician: pickFirst(row, ["technician_name", "technician"], "-"),
        date: pickFirst(row, ["updated_at", "created_at"], null),
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

function AdminDashboard() {
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const [latestJobs, setLatestJobs] = useState([]);
    const [selectedJob, setSelectedJob] = useState(null);
    const [loadingJobs, setLoadingJobs] = useState(true);
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
            supabase.removeChannel(channel);
        };
    }, [loadLatestJobs]);

    return (
        <div className="min-h-screen bg-sky-50">
            <div className="flex min-h-screen">
                <Sidebar
                    collapsed={sidebarCollapsed}
                    onToggle={toggleSidebar}
                />

                <div className="flex-1 p-4 pb-24 md:p-8 md:pb-8">
                    <h2 className="text-3xl font-semibold text-slate-800">
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
                        <div className="flex items-center justify-between">
                            <h3 className="text-3xl font-semibold text-slate-900">
                                Pekerjaan Terbaru
                            </h3>
                            <Link
                                to="/requests"
                                className="inline-flex items-center gap-1 text-md font-medium text-sky-500 no-underline hover:text-sky-600"
                                style={{ textDecoration: "none" }}
                            >
                                Lihat semua <ChevronRight size={18} />
                            </Link>
                        </div>

                        {loadingJobs ? (
                            <div className="mt-4 rounded-2xl bg-white p-6 shadow-sm">
                                <p className="text-base text-slate-500">
                                    Memuat pekerjaan terbaru...
                                </p>
                            </div>
                        ) : latestJobs.length === 0 ? (
                            <div className="mt-4 rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50 p-8">
                                <p className="text-lg text-sky-700">
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
                        ) : (
                            <ul className="mt-4 space-y-3">
                                {latestJobs.map((job) => (
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
                                                    <div>
                                                        <p className="text-xl font-medium text-slate-900">
                                                            {job.title}
                                                        </p>
                                                        <p className="mt-1 text-base text-slate-500">
                                                            {job.location}
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
                                <h4 className="text-2xl font-semibold text-slate-900">
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
