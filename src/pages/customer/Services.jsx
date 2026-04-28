import { useEffect, useMemo, useState } from "react";
import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    Download,
    MapPin,
    Phone,
    Search,
    Wrench,
    X,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import { useAuth } from "../../context/useAuth";
import useCustomerRequests from "../../hooks/useCustomerRequests";

const FILTERS = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "in_progress", label: "In Progress" },
    { key: "completed", label: "Completed" },
];

const getValidFilter = (value) =>
    FILTERS.some((filter) => filter.key === value) ? value : "all";

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

const escapeCsvValue = (value) => {
    const raw = String(value ?? "").replace(/\r?\n|\r/g, " ").trim();
    return `"${raw.replace(/"/g, '""')}"`;
};

function CustomerServicesPage() {
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const { user } = useAuth();

    const [searchParams, setSearchParams] = useSearchParams();
    const [search, setSearch] = useState("");
    const [activeFilter, setActiveFilter] = useState(
        getValidFilter(searchParams.get("status") ?? "all"),
    );
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [photoPreview, setPhotoPreview] = useState({
        open: false,
        url: "",
        label: "",
    });
    const ITEMS_PER_PAGE = 5;
    const { loading, requests } = useCustomerRequests(user);

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
        return requests.filter((item) => {
            const matchFilter =
                activeFilter === "all" ? true : item.status === activeFilter;
            const matchSearch = keyword
                ? `${item.title ?? ""} ${item.room_location ?? ""} ${item.trouble_description ?? ""} ${item.customer_name ?? ""} ${item.technician_name ?? ""} ${item.id ?? ""} ${formatOrderId(item.id)}`
                      .toLowerCase()
                      .includes(keyword)
                : true;
            return matchFilter && matchSearch;
        });
    }, [activeFilter, requests, search]);

    const totalPages = Math.ceil(filteredRequests.length / ITEMS_PER_PAGE);
    const paginatedRequests = useMemo(() => {
        const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIdx = startIdx + ITEMS_PER_PAGE;
        return filteredRequests.slice(startIdx, endIdx);
    }, [currentPage, filteredRequests]);

    const requestCounts = useMemo(() => {
        return requests.reduce(
            (acc, item) => {
                const status = String(item.status ?? "").trim().toLowerCase();
                acc.all += 1;
                if (status === "pending") acc.pending += 1;
                if (status === "in_progress") acc.in_progress += 1;
                if (status === "completed") acc.completed += 1;
                return acc;
            },
            {
                all: 0,
                pending: 0,
                in_progress: 0,
                completed: 0,
            },
        );
    }, [requests]);

    useEffect(() => {
        setCurrentPage(1);
    }, [activeFilter, search]);

    useEffect(() => {
        const nextFilter = getValidFilter(searchParams.get("status") ?? "all");
        if (nextFilter !== activeFilter) {
            setActiveFilter(nextFilter);
        }
    }, [activeFilter, searchParams]);

    const openPhotoPreview = (url, label) => {
        if (!url) return;
        setPhotoPreview({ open: true, url, label });
    };

    const downloadCsv = () => {
        if (filteredRequests.length === 0) return;

        const headers = [
            "Order ID",
            "Tanggal Dibuat",
            "Status",
            "Judul Pekerjaan",
            "Customer",
            "No. Telepon Customer",
            "Teknisi",
            "Lokasi",
            "Alamat",
            "Ruangan",
            "Merk AC",
            "Tipe AC",
            "Kapasitas AC",
            "Serial Number",
            "Deskripsi Kendala",
            "Part Diganti",
            "Part Direkondisi",
        ];

        const rows = filteredRequests.map((item) => [
            formatOrderId(item.id),
            formatDate(item.created_at),
            STATUS_LABELS[item.status] ?? "PENDING",
            item.title ?? "-",
            item.customer_name ?? "-",
            item.customer_phone ?? "-",
            item.technician_name ?? "-",
            item.location ?? "-",
            item.address ?? "-",
            item.room_location ?? "-",
            item.ac_brand ?? "-",
            item.ac_type ?? "-",
            item.ac_capacity_pk ?? "-",
            item.serial_number ?? "-",
            item.trouble_description ?? "-",
            item.replaced_parts ?? "-",
            item.reconditioned_parts ?? "-",
        ]);

        const csvContent = [
            headers.map(escapeCsvValue).join(","),
            ...rows.map((row) => row.map(escapeCsvValue).join(",")),
        ].join("\n");

        const blob = new Blob([`\uFEFF${csvContent}`], {
            type: "text/csv;charset=utf-8;",
        });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        const suffix =
            activeFilter === "all" ? "semua-status" : activeFilter.toLowerCase();
        const today = new Date().toISOString().split("T")[0];

        anchor.href = url;
        anchor.download = `customer-jobs-${suffix}-${today}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        window.URL.revokeObjectURL(url);
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
                            <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
                                <label className="flex w-full items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-slate-500 md:min-w-sm md:max-w-sm">
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
                                <button
                                    type="button"
                                    onClick={downloadCsv}
                                    disabled={filteredRequests.length === 0}
                                    className="inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                                >
                                    <Download size={16} />
                                    Download CSV
                                </button>
                            </div>
                        </div>

                        <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-1 md:inline-flex md:grid-cols-none md:gap-0 md:rounded-full">
                            {FILTERS.map((filter) => (
                                <button
                                    key={filter.key}
                                    type="button"
                                    onClick={() => {
                                        setActiveFilter(filter.key);
                                        if (filter.key === "all") {
                                            setSearchParams({});
                                            return;
                                        }
                                        setSearchParams({
                                            status: filter.key,
                                        });
                                    }}
                                    className={`cursor-pointer rounded-xl px-3 py-2 text-xs transition md:rounded-full md:px-6 md:text-sm ${
                                        activeFilter === filter.key
                                            ? "bg-sky-500 font-semibold text-white"
                                            : "font-medium text-slate-600 hover:bg-slate-100"
                                    }`}
                                >
                                    <span className="inline-flex items-center gap-2">
                                        <span>{filter.label}</span>
                                        <span
                                            className={`inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                                activeFilter === filter.key
                                                    ? "bg-white/20 text-white"
                                                    : "bg-slate-200 text-slate-700"
                                            }`}
                                        >
                                            {requestCounts[filter.key] ?? 0}
                                        </span>
                                    </span>
                                </button>
                            ))}
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
                                {paginatedRequests.map((item) => (
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

                                {filteredRequests.length > ITEMS_PER_PAGE && (
                                    <div className="mt-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
                                        <div className="text-sm text-slate-600">
                                            Page{" "}
                                            <span className="font-semibold">
                                                {currentPage}
                                            </span>{" "}
                                            of{" "}
                                            <span className="font-semibold">
                                                {totalPages}
                                            </span>{" "}
                                            • Showing{" "}
                                            <span className="font-semibold">
                                                {paginatedRequests.length}
                                            </span>{" "}
                                            of{" "}
                                            <span className="font-semibold">
                                                {filteredRequests.length}
                                            </span>{" "}
                                            results
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setCurrentPage((page) =>
                                                        Math.max(
                                                            1,
                                                            page - 1,
                                                        ),
                                                    )
                                                }
                                                disabled={currentPage === 1}
                                                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white p-2 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                                title="Previous page"
                                            >
                                                <ChevronLeft size={18} />
                                            </button>

                                            <div className="flex gap-1">
                                                {Array.from(
                                                    { length: totalPages },
                                                    (_, index) => index + 1,
                                                ).map((page) => (
                                                    <button
                                                        key={page}
                                                        type="button"
                                                        onClick={() =>
                                                            setCurrentPage(
                                                                page,
                                                            )
                                                        }
                                                        className={`inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition ${
                                                            currentPage ===
                                                            page
                                                                ? "bg-sky-500 text-white"
                                                                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                                        }`}
                                                    >
                                                        {page}
                                                    </button>
                                                ))}
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setCurrentPage((page) =>
                                                        Math.min(
                                                            totalPages,
                                                            page + 1,
                                                        ),
                                                    )
                                                }
                                                disabled={
                                                    currentPage === totalPages
                                                }
                                                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white p-2 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                                title="Next page"
                                            >
                                                <ChevronRight size={18} />
                                            </button>
                                        </div>
                                    </div>
                                )}
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

export default CustomerServicesPage;
