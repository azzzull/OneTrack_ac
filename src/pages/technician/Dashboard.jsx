import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Wrench } from "lucide-react";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import { useAuth } from "../../context/useAuth";
import supabase from "../../supabaseClient";

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

const formatDate = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(date);
};

function TechnicianDashboard() {
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [tasks, setTasks] = useState([]);

    const loadTasks = useCallback(async () => {
        if (!user?.id) return;

        setLoading(true);
        try {
            const { data, error } = await supabase
                .from("requests")
                .select("*")
                .eq("created_by", user.id)
                .order("created_at", { ascending: false });
            if (error) throw error;
            setTasks(data ?? []);
        } catch (error) {
            console.error("Error loading technician tasks:", error);
            setTasks([]);
        } finally {
            setLoading(false);
        }
    }, [user?.id]);

    useEffect(() => {
        loadTasks();
    }, [loadTasks]);

    useEffect(() => {
        if (!user?.id) return undefined;

        const channel = supabase
            .channel(`technician-tasks-${user.id}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "requests" },
                () => loadTasks(),
            )
            .subscribe();

        return () => {
            channel.unsubscribe();
        };
    }, [loadTasks, user?.id]);

    return (
        <div className="min-h-screen bg-sky-50">
            <div className="flex min-h-screen">
                <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />

                <main className="min-w-0 flex-1 p-4 pb-24 md:p-8 md:pb-8">
                    <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">
                        Dashboard Teknisi
                    </h1>
                    <p className="mt-1 text-slate-600">
                        Daftar pekerjaan yang Anda kerjakan.
                    </p>

                    <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm md:p-5">
                        <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
                            <Wrench size={18} />
                            Pekerjaan Saya
                        </h2>

                        {loading ? (
                            <p className="mt-4 text-sm text-slate-500">Memuat pekerjaan...</p>
                        ) : tasks.length === 0 ? (
                            <p className="mt-4 rounded-xl border border-dashed border-sky-300 bg-sky-50 p-4 text-sm text-sky-700">
                                Belum ada pekerjaan yang Anda kerjakan.
                            </p>
                        ) : (
                            <div className="mt-4 space-y-3">
                                {tasks.map((item) => (
                                    <article key={item.id} className="rounded-xl border border-slate-200 p-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <p className="text-base font-semibold text-slate-900">
                                                    {item.title ?? "Pekerjaan Tanpa Judul"}
                                                </p>
                                                <p className="mt-1 text-sm text-slate-600">
                                                    {item.location ?? item.address ?? "-"}
                                                </p>
                                            </div>
                                            <span
                                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                                    STATUS_STYLES[item.status] ?? STATUS_STYLES.pending
                                                }`}
                                            >
                                                {STATUS_LABELS[item.status] ?? "PENDING"}
                                            </span>
                                        </div>
                                        <div className="mt-3 inline-flex items-center gap-1 text-xs text-slate-500">
                                            <CalendarDays size={13} />
                                            {formatDate(item.created_at)}
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>
                </main>
            </div>

            <MobileBottomNav />
        </div>
    );
}

export default TechnicianDashboard;
