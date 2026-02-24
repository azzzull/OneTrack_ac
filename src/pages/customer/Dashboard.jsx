import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ClipboardList, MapPin, Phone, Wrench, X } from "lucide-react";
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
    const [selectedRequest, setSelectedRequest] = useState(null);

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
                                        className="cursor-pointer rounded-xl border border-slate-200 p-4 transition hover:border-sky-300 hover:bg-sky-50/40"
                                        onClick={() => setSelectedRequest(item)}
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

            {selectedRequest && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 md:items-center md:p-4">
                    <div className="max-h-[92vh] w-full overflow-auto rounded-t-3xl bg-white p-4 shadow-xl md:max-w-3xl md:rounded-2xl md:p-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-semibold text-slate-900 md:text-2xl">
                                Detail Pekerjaan
                            </h2>
                            <button
                                type="button"
                                onClick={() => setSelectedRequest(null)}
                                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="rounded-xl border border-slate-200 p-4 md:col-span-2">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-lg font-semibold text-slate-900">
                                            {selectedRequest.title ?? "-"}
                                        </h3>
                                        <p className="mt-1 text-sm text-slate-600">
                                            {selectedRequest.room_location ?? "-"}
                                        </p>
                                    </div>
                                    <span
                                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                            STATUS_STYLES[selectedRequest.status] ??
                                            STATUS_STYLES.pending
                                        }`}
                                    >
                                        {STATUS_LABELS[selectedRequest.status] ?? "PENDING"}
                                    </span>
                                </div>
                            </div>

                            <div className="rounded-xl border border-slate-200 p-4">
                                <p className="text-xs uppercase tracking-wide text-slate-500">
                                    Informasi Lokasi
                                </p>
                                <p className="mt-2 inline-flex items-start gap-2 text-sm font-medium text-slate-700">
                                    <MapPin size={14} />
                                    {selectedRequest.location ?? selectedRequest.address ?? "-"}
                                </p>
                            </div>

                            <div className="rounded-xl border border-slate-200 p-4">
                                <p className="text-xs uppercase tracking-wide text-slate-500">
                                    Customer & Kontak
                                </p>
                                <p className="mt-2 text-sm font-medium text-slate-700">
                                    {selectedRequest.customer_name ?? "-"}
                                </p>
                                <p className="mt-1 inline-flex items-center gap-2 text-sm text-slate-600">
                                    <Phone size={13} />
                                    {selectedRequest.customer_phone ?? "-"}
                                </p>
                            </div>

                            <div className="rounded-xl border border-slate-200 p-4">
                                <p className="text-xs uppercase tracking-wide text-slate-500">
                                    Unit AC
                                </p>
                                <p className="mt-2 text-sm text-slate-700">
                                    {selectedRequest.ac_brand ?? "-"} |{" "}
                                    {selectedRequest.ac_type ?? "-"} |{" "}
                                    {selectedRequest.ac_capacity_pk ?? "-"}
                                </p>
                                <p className="mt-1 text-sm text-slate-600">
                                    Serial: {selectedRequest.serial_number ?? "-"}
                                </p>
                            </div>

                            <div className="rounded-xl border border-slate-200 p-4">
                                <p className="text-xs uppercase tracking-wide text-slate-500">
                                    Teknisi
                                </p>
                                <p className="mt-2 text-sm font-medium text-slate-700">
                                    {selectedRequest.technician_name ?? "-"}
                                </p>
                                <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500">
                                    <CalendarDays size={12} />
                                    Dibuat {formatDate(selectedRequest.created_at)}
                                </p>
                            </div>

                            <div className="rounded-xl border border-slate-200 p-4 md:col-span-2">
                                <p className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                                    <ClipboardList size={14} />
                                    Detail Perbaikan
                                </p>
                                <div className="mt-2 space-y-1 text-sm text-slate-700">
                                    <p>
                                        Problem: {selectedRequest.trouble_description ?? "-"}
                                    </p>
                                    <p>
                                        Part Diganti: {selectedRequest.replaced_parts ?? "-"}
                                    </p>
                                    <p>
                                        Part Rekondisi: {selectedRequest.reconditioned_parts ?? "-"}
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-xl border border-slate-200 p-4 md:col-span-2">
                                <p className="text-xs uppercase tracking-wide text-slate-500">
                                    Foto Proses
                                </p>
                                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                                    {[
                                        {
                                            label: "Before",
                                            url: selectedRequest.before_photo_url,
                                        },
                                        {
                                            label: "Progress",
                                            url: selectedRequest.progress_photo_url,
                                        },
                                        {
                                            label: "After",
                                            url: selectedRequest.after_photo_url,
                                        },
                                    ].map((item) => (
                                        <div
                                            key={item.label}
                                            className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                                        >
                                            {item.url ? (
                                                <a
                                                    href={item.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="block"
                                                >
                                                    <img
                                                        src={item.url}
                                                        alt={`Foto ${item.label}`}
                                                        className="h-40 w-full object-cover"
                                                    />
                                                </a>
                                            ) : (
                                                <div className="flex h-40 items-center justify-center text-sm text-slate-400">
                                                    Belum ada foto
                                                </div>
                                            )}
                                            <p className="border-t border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">
                                                {item.label}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default CustomerDashboard;
