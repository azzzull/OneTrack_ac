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

function CustomerDashboard() {
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const { user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [requests, setRequests] = useState([]);

    const fetchCustomerRequests = useCallback(async () => {
        if (!user?.id) return;

        setLoading(true);
        try {
            const email = String(user.email ?? "").trim();
            const [customersByUserRes, customersByEmailRes] = await Promise.all([
                supabase
                    .from("master_customers")
                    .select("id")
                    .eq("user_id", user.id),
                email
                    ? supabase
                          .from("master_customers")
                          .select("id")
                          .eq("email", email)
                    : Promise.resolve({ data: [], error: null }),
            ]);

            if (customersByUserRes.error) throw customersByUserRes.error;
            if (customersByEmailRes?.error) throw customersByEmailRes.error;

            const customerIds = [
                ...(customersByUserRes.data ?? []).map((item) => item.id),
                ...(customersByEmailRes?.data ?? []).map((item) => item.id),
            ];
            const uniqueCustomerIds = [...new Set(customerIds)];

            if (uniqueCustomerIds.length === 0) {
                setRequests([]);
                return;
            }

            const { data: requestData, error: requestError } = await supabase
                .from("requests")
                .select("*")
                .in("customer_id", uniqueCustomerIds)
                .order("created_at", { ascending: false });

            if (requestError) throw requestError;
            setRequests(requestData ?? []);
        } catch (error) {
            console.error("Error loading customer dashboard:", error);
            setRequests([]);
        } finally {
            setLoading(false);
        }
    }, [user?.email, user?.id]);

    useEffect(() => {
        fetchCustomerRequests();
    }, [fetchCustomerRequests]);

    useEffect(() => {
        if (!user?.id) return undefined;

        const channel = supabase
            .channel(`customer-dashboard-${user.id}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "requests" },
                () => fetchCustomerRequests(),
            )
            .subscribe();

        return () => {
            channel.unsubscribe();
        };
    }, [fetchCustomerRequests, user?.id]);

    return (
        <div className="min-h-screen bg-sky-50">
            <div className="flex min-h-screen">
                <Sidebar
                    collapsed={sidebarCollapsed}
                    onToggle={toggleSidebar}
                />

                <main className="min-w-0 flex-1 p-4 pb-24 md:p-8 md:pb-8">
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-800 md:text-3xl">
                            My Services
                        </h1>
                        <p className="mt-1 text-slate-600">
                            Seluruh daftar pekerjaan anda.
                        </p>
                    </div>

                    <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm md:p-5">
                        <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
                            <Wrench size={18} />
                            Daftar Pekerjaan Anda
                        </h2>

                        {loading ? (
                            <p className="mt-4 text-sm text-slate-500">
                                Memuat data pekerjaan...
                            </p>
                        ) : requests.length === 0 ? (
                            <p className="mt-4 rounded-xl border border-dashed border-sky-300 bg-sky-50 p-4 text-sm text-sky-700">
                                Belum ada pekerjaan untuk akun customer ini.
                            </p>
                        ) : (
                            <div className="mt-4 space-y-3">
                                {requests.map((item) => (
                                    <article
                                        key={item.id}
                                        className="rounded-xl border border-slate-200 p-4"
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <p className="text-base font-semibold text-slate-900">
                                                    {item.title}
                                                </p>
                                                <p className="mt-1 text-sm text-slate-600">
                                                    {item.room_location ?? "-"}
                                                </p>
                                            </div>
                                            <span
                                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                                    STATUS_STYLES[
                                                        item.status
                                                    ] ?? STATUS_STYLES.pending
                                                }`}
                                            >
                                                {STATUS_LABELS[item.status] ??
                                                    "PENDING"}
                                            </span>
                                        </div>

                                        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                                            <span className="inline-flex items-center gap-1">
                                                <CalendarDays size={13} />
                                                {formatDate(item.created_at)}
                                            </span>
                                            <span>{item.ac_brand ?? "-"}</span>
                                            <span>{item.ac_type ?? "-"}</span>
                                            <span>
                                                {item.ac_capacity_pk ?? "-"}
                                            </span>
                                            <span className="font-medium text-slate-600">
                                                Teknisi:{" "}
                                                {item.technician_name ?? "-"}
                                            </span>
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

export default CustomerDashboard;
