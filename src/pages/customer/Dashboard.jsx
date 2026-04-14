import { useCallback, useEffect, useMemo, useState } from "react";
import {
    CalendarDays,
    ClipboardList,
    MapPin,
    Phone,
    Search,
    Wrench,
    X,
} from "lucide-react";
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

function CustomerDashboard() {
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const { user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [requests, setRequests] = useState([]);
    const [search, setSearch] = useState("");
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [photoPreview, setPhotoPreview] = useState({
        open: false,
        url: "",
        label: "",
    });

    const fetchCustomerRequests = useCallback(async () => {
        if (!user?.id) return;

        setLoading(true);
        try {
            const email = String(user.email ?? "").trim();
            const [customersByUserRes, customersByEmailRes] = await Promise.all(
                [
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
                ],
            );

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
                { event: "DELETE", schema: "public", table: "requests" },
                () => {
                    // Immediately refresh on delete
                    fetchCustomerRequests();
                },
            )
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "requests" },
                () => {
                    fetchCustomerRequests();
                },
            )
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "requests" },
                () => {
                    fetchCustomerRequests();
                },
            )
            .subscribe();

        return () => {
            channel.unsubscribe();
        };
    }, [fetchCustomerRequests, user?.id]);

    // Check if selected request still exists (not deleted by admin elsewhere)
    useEffect(() => {
        if (!selectedRequest || !requests) return;
        const requestExists = requests.some(
            (req) => req.id === selectedRequest.id,
        );

        if (!requestExists) {
            // Request was deleted, close modal and clear selection
            setSelectedRequest(null);
            setPhotoPreview({ open: false, url: "", label: "" });
        }
    }, [requests, selectedRequest]);

    const filteredRequests = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        if (!keyword) return requests;
        return requests.filter((item) =>
            `${item.title ?? ""} ${item.room_location ?? ""} ${item.trouble_description ?? ""} ${item.customer_name ?? ""} ${item.technician_name ?? ""} ${item.id ?? ""} ${formatOrderId(item.id)}`
                .toLowerCase()
                .includes(keyword),
        );
    }, [requests, search]);

    const openPhotoPreview = (url, label) => {
        if (!url) return;
        setPhotoPreview({ open: true, url, label });
    };

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

                    <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm md:px-10 py-8">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
                                <Wrench size={18} />
                                Daftar Pekerjaan Anda
                            </h2>
                            <label className="flex w-full items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-slate-500 md:max-w-sm">
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
                        </div>

                        {loading ? (
                            <p className="mt-4 text-sm text-slate-500">
                                Memuat data pekerjaan...
                            </p>
                        ) : requests.length === 0 ? (
                            <p className="mt-4 rounded-xl border border-dashed border-sky-300 bg-sky-50 p-4 text-sm text-sky-700">
                                Belum ada pekerjaan untuk akun customer ini.
                            </p>
                        ) : filteredRequests.length === 0 ? (
                            <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                                Tidak ada pekerjaan yang cocok dengan pencarian.
                            </p>
                        ) : (
                            <div className="mt-4 space-y-3">
                                {filteredRequests.map((item) => (
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
                                                <p className="mt-1 break-all text-xs text-slate-500">
                                                    Order ID:{" "}
                                                    <span
                                                        title={item.id ?? "-"}
                                                    >
                                                        {formatOrderId(item.id)}
                                                    </span>
                                                </p>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    Ruangan:{" "}
                                                    {previewText(
                                                        item.room_location,
                                                        48,
                                                    )}
                                                </p>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    Deskripsi:{" "}
                                                    {previewText(
                                                        item.trouble_description,
                                                    )}
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
                                onClick={() => {
                                    setSelectedRequest(null);
                                    setPhotoPreview({
                                        open: false,
                                        url: "",
                                        label: "",
                                    });
                                }}
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
                                        <p className="mt-1 break-all text-xs text-slate-500">
                                            Order ID:{" "}
                                            <span
                                                title={
                                                    selectedRequest.id ?? "-"
                                                }
                                            >
                                                {formatOrderId(
                                                    selectedRequest.id,
                                                )}
                                            </span>
                                        </p>
                                        <p className="mt-1 text-sm text-slate-600">
                                            {selectedRequest.room_location ??
                                                "-"}
                                        </p>
                                    </div>
                                    <span
                                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                            STATUS_STYLES[
                                                selectedRequest.status
                                            ] ?? STATUS_STYLES.pending
                                        }`}
                                    >
                                        {STATUS_LABELS[
                                            selectedRequest.status
                                        ] ?? "PENDING"}
                                    </span>
                                </div>
                            </div>

                            <div className="rounded-xl border border-slate-200 p-4">
                                <p className="text-xs uppercase tracking-wide text-slate-500">
                                    Informasi Lokasi
                                </p>
                                <p className="mt-2 inline-flex items-start gap-2 text-sm font-medium text-slate-700">
                                    <MapPin size={14} />
                                    {selectedRequest.location ??
                                        selectedRequest.address ??
                                        "-"}
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
                                    Unit AC & Ruangan
                                </p>
                                <div className="mt-2 space-y-1 text-sm text-slate-700">
                                    <p>
                                        <span className="font-medium">
                                            Merk AC:
                                        </span>{" "}
                                        {selectedRequest.ac_brand ?? "-"}
                                    </p>
                                    <p>
                                        <span className="font-medium">
                                            Tipe AC:
                                        </span>{" "}
                                        {selectedRequest.ac_type ?? "-"}
                                    </p>
                                    <p>
                                        <span className="font-medium">
                                            Kapasitas AC:
                                        </span>{" "}
                                        {selectedRequest.ac_capacity_pk ?? "-"}
                                    </p>
                                    <p>
                                        <span className="font-medium">
                                            Serial Number AC:
                                        </span>{" "}
                                        {selectedRequest.serial_number ?? "-"}
                                    </p>
                                    <p>
                                        <span className="font-medium">
                                            Ruangan Dikerjakan:
                                        </span>{" "}
                                        {selectedRequest.room_location ?? "-"}
                                    </p>
                                </div>
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
                                    Dibuat{" "}
                                    {formatDate(selectedRequest.created_at)}
                                </p>
                            </div>

                            <div className="rounded-xl border border-slate-200 p-4 md:col-span-2">
                                <p className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                                    <ClipboardList size={14} />
                                    Detail Perbaikan
                                </p>
                                <div className="mt-2 space-y-1 text-sm text-slate-700">
                                    <p>
                                        Problem:{" "}
                                        {selectedRequest.trouble_description ??
                                            "-"}
                                    </p>
                                    <p>
                                        Part Diganti:{" "}
                                        {selectedRequest.replaced_parts ?? "-"}
                                    </p>
                                    <p>
                                        Part Rekondisi:{" "}
                                        {selectedRequest.reconditioned_parts ??
                                            "-"}
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-xl border border-slate-200 p-4 md:col-span-2">
                                <p className="text-xs uppercase tracking-wide text-slate-500">
                                    Foto Proses
                                </p>
                                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                                    {[
                                        {
                                            label: "Preview Foto Before",
                                            url: selectedRequest.before_photo_url,
                                        },
                                        {
                                            label: "Preview Foto Proses",
                                            url: selectedRequest.progress_photo_url,
                                        },
                                        {
                                            label: "Preview Foto After",
                                            url: selectedRequest.after_photo_url,
                                        },
                                    ].map((item) => (
                                        <button
                                            key={item.label}
                                            type="button"
                                            disabled={!item.url}
                                            onClick={() =>
                                                openPhotoPreview(
                                                    item.url,
                                                    item.label,
                                                )
                                            }
                                            className="w-full rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm font-medium text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:hover:bg-slate-100"
                                        >
                                            {item.url
                                                ? item.label
                                                : "foto belum di ambil"}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {photoPreview.open && (
                <div className="fixed inset-0 z-55 flex items-center justify-center bg-slate-900/70 p-4">
                    <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl">
                        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                            <h3 className="text-sm font-semibold text-slate-900">
                                Preview Foto {photoPreview.label}
                            </h3>
                            <button
                                type="button"
                                onClick={() =>
                                    setPhotoPreview({
                                        open: false,
                                        url: "",
                                        label: "",
                                    })
                                }
                                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="bg-black">
                            <img
                                src={photoPreview.url}
                                alt={`Foto ${photoPreview.label}`}
                                className="max-h-[75vh] w-full object-contain"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default CustomerDashboard;
