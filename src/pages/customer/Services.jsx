import { useEffect, useMemo, useState } from "react";
import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    Download,
    MapPin,
    Phone,
    RotateCcw,
    Search,
    Wrench,
    X,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import ScopeDetailsCard from "../../components/ScopeDetailsCard";
import CustomSelect from "../../components/ui/CustomSelect";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import { useAuth } from "../../context/useAuth";
import useCustomerRequests from "../../hooks/useCustomerRequests";
import {
    getScopeSummaryMeta,
} from "../../utils/jobScopeCatalog";
import {
    exportStyledExcel,
    makeExcelFileName,
    parseExcelDate,
} from "../../utils/excelExport";

const FILTERS = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "in_progress", label: "In Progress" },
    { key: "completed", label: "Completed" },
];

const PERIOD_OPTIONS = [
    { value: "all", label: "Semua Periode" },
    { value: "today", label: "Hari Ini" },
    { value: "week", label: "Minggu Ini" },
    { value: "month", label: "Bulan Ini" },
    { value: "year", label: "Tahun Ini" },
    { value: "custom", label: "Custom Periode" },
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

const normalizeStatusKey = (value) => {
    const raw = String(value ?? "")
        .trim()
        .toLowerCase()
        .replaceAll("-", "_")
        .replaceAll(" ", "_");
    if (raw === "inprogress") return "in_progress";
    if (raw === "in_progress") return "in_progress";
    if (raw === "completed" || raw === "done") return "completed";
    if (raw === "requested") return "pending";
    if (raw === "pending" || raw === "") return "pending";
    return "pending";
};

const getExportStatusLabel = (value) => {
    const status = normalizeStatusKey(value);
    if (status === "in_progress") return "Dalam Progress";
    if (status === "completed") return "Selesai";
    return "Pending";
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

const startOfDay = (date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate());

const endOfDay = (date) =>
    new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        23,
        59,
        59,
        999,
    );

const getDateRangeForPeriod = (period, customStartDate, customEndDate) => {
    const now = new Date();
    let start = null;
    let end = null;

    if (period === "today") {
        start = startOfDay(now);
        end = endOfDay(now);
    } else if (period === "week") {
        const currentDay = now.getDay();
        const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
        start = startOfDay(
            new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset),
        );
        end = endOfDay(
            new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6),
        );
    } else if (period === "month") {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    } else if (period === "year") {
        start = new Date(now.getFullYear(), 0, 1);
        end = endOfDay(new Date(now.getFullYear(), 11, 31));
    } else if (period === "custom") {
        start = customStartDate ? startOfDay(new Date(customStartDate)) : null;
        end = customEndDate ? endOfDay(new Date(customEndDate)) : null;
    }

    return { start, end };
};

const isDateInRange = (value, range) => {
    if (!range.start && !range.end) return true;
    if (!value) return false;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    if (range.start && date < range.start) return false;
    if (range.end && date > range.end) return false;
    return true;
};

const getPeriodLabel = (period, customStartDate, customEndDate) => {
    if (period === "custom") {
        if (customStartDate && customEndDate) {
            return `${customStartDate} sampai ${customEndDate}`;
        }
        if (customStartDate) return `mulai ${customStartDate}`;
        if (customEndDate) return `sampai ${customEndDate}`;
    }

    return (
        PERIOD_OPTIONS.find((item) => item.value === period)?.label ??
        "Semua Periode"
    );
};

const getTechnicianFilterKey = (item) => {
    const id = String(item?.technician_id ?? "").trim();
    if (id) return `id:${id}`;
    const name = String(item?.technician_names ?? item?.technician_name ?? "").trim();
    return name && name !== "-" ? `name:${name.toLowerCase()}` : "";
};

const stringifyMetaValue = (value) => {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) {
        return value
            .map((item) =>
                typeof item === "object" && item
                    ? item.item_label ?? item.label ?? item.name ?? ""
                    : item,
            )
            .filter(Boolean)
            .join(", ");
    }
    if (typeof value === "object") {
        return String(value.name ?? value.label ?? value.value ?? "").trim();
    }
    return String(value).trim();
};

const pickFirstMetaValue = (sources, keys) => {
    for (const source of sources) {
        if (!source || typeof source !== "object") continue;
        for (const key of keys) {
            const value = stringifyMetaValue(source[key]);
            if (value) return value;
        }
    }
    return "";
};

const pickFirstMetaValueByKeyPattern = (source, patterns) => {
    if (!source || typeof source !== "object") return "";

    for (const [key, value] of Object.entries(source)) {
        const normalizedKey = String(key ?? "").toLowerCase();
        if (!patterns.some((pattern) => pattern.test(normalizedKey))) {
            continue;
        }
        const text = stringifyMetaValue(value);
        if (text) return text;
    }

    return "";
};

const getRequestMetaItems = (item) => {
    const details =
        item?.dynamic_data && typeof item.dynamic_data === "object"
            ? item.dynamic_data
            : {};
    const type =
        pickFirstMetaValue([item, details], [
            "ac_type",
            "type",
            "jenis",
            "jenis_pekerjaan",
            "jenis_perangkat",
            "device_type",
            "equipment_type",
            "unit_type",
            "asset_type",
            "service_type",
            "work_type",
            "category",
            "kategori",
        ]) ||
        pickFirstMetaValueByKeyPattern(details, [
            /(^|_)jenis($|_)/,
            /jenis.*perangkat/,
            /(^|_)type($|_)/,
            /(^|_)tipe($|_)/,
            /(^|_)kategori($|_)/,
            /(^|_)category($|_)/,
        ]);
    const brand =
        pickFirstMetaValue([item, details], [
            "ac_brand",
            "brand",
            "merk",
            "merek",
            "unit_brand",
            "device_brand",
            "equipment_brand",
            "manufacturer",
        ]) ||
        pickFirstMetaValueByKeyPattern(details, [
            /(^|_)brand($|_)/,
            /(^|_)merk($|_)/,
            /(^|_)merek($|_)/,
        ]);
    const room =
        pickFirstMetaValue(
            [
                { room_location: item?.room_location },
                details,
            ],
            [
                "room_location",
                "room",
                "ruangan",
                "lokasi_ruangan",
                "unit_location",
                "panel_location",
                "door_location",
            ],
        ) ||
        pickFirstMetaValueByKeyPattern(details, [
            /(^|_)room($|_)/,
            /(^|_)ruangan($|_)/,
            /lokasi_ruangan/,
        ]);

    const metaItems = [
        {
            label: "Jenis",
            value: type || "-",
        },
        {
            label: "Merk",
            value: brand || "-",
        },
        {
            label: "Ruangan",
            value: room || "-",
        },
    ];

    return metaItems;
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
    const [periodFilter, setPeriodFilter] = useState("all");
    const [customStartDate, setCustomStartDate] = useState("");
    const [customEndDate, setCustomEndDate] = useState("");
    const [selectedTechnicianKey, setSelectedTechnicianKey] = useState("all");
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedRequestId, setSelectedRequestId] = useState(null);
    const [photoPreview, setPhotoPreview] = useState({
        open: false,
        url: "",
        label: "",
    });
    const ITEMS_PER_PAGE = 5;
    const { loading, requests } = useCustomerRequests(user);

    const selectedRequest = useMemo(
        () => requests.find((item) => item.id === selectedRequestId) ?? null,
        [requests, selectedRequestId],
    );

    // Check if selected request still exists (not deleted by admin elsewhere)
    useEffect(() => {
        if (!selectedRequest || !requests) return;
        const requestExists = requests.some(
            (req) => req.id === selectedRequest.id,
        );

        if (!requestExists) {
            // Request was deleted, close modal and clear selection
            setSelectedRequestId(null);
            setPhotoPreview({ open: false, url: "", label: "" });
        }
    }, [requests, selectedRequest]);

    const technicianOptions = useMemo(() => {
        const map = new Map();
        requests.forEach((item) => {
            const key = getTechnicianFilterKey(item);
            const name = String(
                item.technician_names ?? item.technician_name ?? "",
            ).trim();
            if (!key || !name || name === "-") return;
            map.set(key, name);
        });

        return [
            { value: "all", label: "Semua Teknisi" },
            ...[...map.entries()]
                .sort((left, right) => left[1].localeCompare(right[1]))
                .map(([value, label]) => ({ value, label })),
        ];
    }, [requests]);

    const selectedTechnicianLabel = useMemo(() => {
        if (selectedTechnicianKey === "all") return "";
        return (
            technicianOptions.find((item) => item.value === selectedTechnicianKey)
                ?.label ?? ""
        );
    }, [selectedTechnicianKey, technicianOptions]);

    const activePeriodLabel = useMemo(
        () => getPeriodLabel(periodFilter, customStartDate, customEndDate),
        [customEndDate, customStartDate, periodFilter],
    );

    const baseFilteredRequests = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        const dateRange = getDateRangeForPeriod(
            periodFilter,
            customStartDate,
            customEndDate,
        );

        return requests.filter((item) => {
            const scopeSummary = getScopeSummaryMeta(
                item.job_scope,
                item.dynamic_data,
                item.room_location,
            );
            const matchPeriod = isDateInRange(item.created_at, dateRange);
            const matchTechnician =
                selectedTechnicianKey === "all"
                    ? true
                    : getTechnicianFilterKey(item) === selectedTechnicianKey;
            const matchSearch = keyword
                ? `${item.title ?? ""} ${scopeSummary.value ?? ""} ${item.job_brief ?? ""} ${item.trouble_description ?? ""} ${item.customer_name ?? ""} ${item.technician_names ?? item.technician_name ?? ""} ${item.id ?? ""} ${formatOrderId(item.id)}`
                      .toLowerCase()
                      .includes(keyword)
                : true;
            return matchPeriod && matchTechnician && matchSearch;
        });
    }, [
        customEndDate,
        customStartDate,
        periodFilter,
        requests,
        search,
        selectedTechnicianKey,
    ]);

    const filteredRequests = useMemo(() => {
        if (activeFilter === "all") return baseFilteredRequests;
        return baseFilteredRequests.filter(
            (item) => normalizeStatusKey(item.status) === activeFilter,
        );
    }, [activeFilter, baseFilteredRequests]);

    const totalPages = Math.ceil(filteredRequests.length / ITEMS_PER_PAGE);
    const paginatedRequests = useMemo(() => {
        const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIdx = startIdx + ITEMS_PER_PAGE;
        return filteredRequests.slice(startIdx, endIdx);
    }, [currentPage, filteredRequests]);

    const requestCounts = useMemo(() => {
        return baseFilteredRequests.reduce(
            (acc, item) => {
                const status = normalizeStatusKey(item.status);
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
    }, [baseFilteredRequests]);

    const hasActiveAdvancedFilter =
        search.trim() !== "" ||
        activeFilter !== "all" ||
        periodFilter !== "all" ||
        selectedTechnicianKey !== "all";

    const filterSummary = useMemo(() => {
        const statusLabel =
            activeFilter === "all"
                ? "semua status"
                : FILTERS.find((item) => item.key === activeFilter)?.label ??
                  activeFilter;
        const periodLabel =
            periodFilter === "all"
                ? "semua periode"
                : activePeriodLabel.toLowerCase();
        const technicianLabel = selectedTechnicianLabel
            ? ` oleh ${selectedTechnicianLabel}`
            : "";

        return `Menampilkan ${filteredRequests.length} pekerjaan ${statusLabel} ${periodLabel}${technicianLabel}.`;
    }, [
        activeFilter,
        activePeriodLabel,
        filteredRequests.length,
        periodFilter,
        selectedTechnicianLabel,
    ]);

    useEffect(() => {
        setCurrentPage(1);
    }, [
        activeFilter,
        customEndDate,
        customStartDate,
        periodFilter,
        search,
        selectedTechnicianKey,
    ]);

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

    const resetFilters = () => {
        setSearch("");
        setActiveFilter("all");
        setPeriodFilter("all");
        setCustomStartDate("");
        setCustomEndDate("");
        setSelectedTechnicianKey("all");
        setSearchParams({});
    };

    const downloadExcel = async () => {
        if (filteredRequests.length === 0) return;

        const columns = [
            { key: "orderId", header: "Order ID" },
            { key: "createdAt", header: "Tanggal Dibuat" },
            { key: "status", header: "Status" },
            { key: "title", header: "Judul Pekerjaan" },
            { key: "customer", header: "Customer" },
            { key: "customerPhone", header: "No. Telepon Customer" },
            { key: "technician", header: "Teknisi" },
            { key: "location", header: "Lokasi" },
            { key: "address", header: "Alamat" },
            { key: "roomLocation", header: "Ruangan" },
            { key: "acBrand", header: "Merk AC" },
            { key: "acType", header: "Tipe AC" },
            { key: "acCapacityPk", header: "Kapasitas AC" },
            { key: "serialNumber", header: "Serial Number" },
            { key: "jobBrief", header: "Brief Pekerjaan" },
            { key: "troubleDescription", header: "Deskripsi Kendala" },
            { key: "replacedParts", header: "Part Diganti" },
            { key: "reconditionedParts", header: "Part Direkondisi" },
        ];

        const rows = filteredRequests.map((item) => ({
            orderId: formatOrderId(item.id),
            createdAt: parseExcelDate(item.created_at),
            status: getExportStatusLabel(item.status),
            title: item.title ?? "-",
            customer: item.customer_name ?? "-",
            customerPhone: item.customer_phone ?? "-",
            technician: item.technician_names ?? item.technician_name ?? "-",
            location: item.location ?? "-",
            address: item.address ?? "-",
            roomLocation: item.room_location ?? "-",
            acBrand: item.ac_brand ?? "-",
            acType: item.ac_type ?? "-",
            acCapacityPk: item.ac_capacity_pk ?? "-",
            serialNumber: item.serial_number ?? "-",
            jobBrief: item.job_brief ?? "-",
            troubleDescription: item.trouble_description ?? "-",
            replacedParts: item.replaced_parts ?? "-",
            reconditionedParts: item.reconditioned_parts ?? "-",
        }));

        const suffix =
            activeFilter === "all"
                ? "Semua Status"
                : FILTERS.find((item) => item.key === activeFilter)?.label ??
                  activeFilter;
        const today = new Date().toISOString().split("T")[0];
        const statusSummary = filteredRequests.reduce(
            (acc, item) => {
                const status = normalizeStatusKey(item.status);
                acc.total += 1;
                if (status === "pending") acc.pending += 1;
                if (status === "in_progress") acc.in_progress += 1;
                if (status === "completed") acc.completed += 1;
                return acc;
            },
            { total: 0, pending: 0, in_progress: 0, completed: 0 },
        );

        try {
            await exportStyledExcel({
                fileName: makeExcelFileName([
                    "Laporan",
                    "Pekerjaan",
                    "Customer",
                    selectedTechnicianLabel,
                    activePeriodLabel,
                    suffix,
                    today,
                ]),
                sheetName: "Pekerjaan Customer",
                title: "Laporan Pekerjaan Customer OneTrack",
                filterRows: [
                    ["Customer", user?.email ?? "Customer"],
                    ["Periode", activePeriodLabel],
                    ["Status", suffix],
                    ["Teknisi", selectedTechnicianLabel || "Semua Teknisi"],
                    ["Pencarian", search.trim() || "Semua Data"],
                    ["Tanggal Export", new Date()],
                ],
                columns,
                rows,
                summaryTitle: "Ringkasan Pekerjaan",
                summaryRows: [
                    ["Total Pekerjaan", statusSummary.total],
                    ["Pending", statusSummary.pending],
                    ["In Progress", statusSummary.in_progress],
                    ["Completed", statusSummary.completed],
                ],
                dateKeys: ["createdAt"],
                wrapKeys: [
                    "title",
                    "location",
                    "address",
                    "roomLocation",
                    "troubleDescription",
                    "replacedParts",
                    "reconditionedParts",
                ],
            });
        } catch (error) {
            console.error("Customer services Excel export failed:", error);
            alert("Gagal menyiapkan file Excel. Restart dev server jika perlu.");
        }
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

                    <section className="mt-6 rounded-2xl bg-white p-4 py-8 shadow-sm md:px-10">
                        <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
                            <Wrench size={18} />
                            Daftar Pekerjaan Anda
                        </h2>

                        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
                            <label className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500 md:px-4 md:py-3">
                                <Search size={16} />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(event) =>
                                        setSearch(event.target.value)
                                    }
                                    placeholder="Cari teknisi, customer, alamat, lokasi, atau nomor pekerjaan..."
                                    className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 md:text-base"
                                />
                            </label>

                            <div className="mt-4 grid gap-3 lg:grid-cols-[auto_220px_220px] lg:items-end">
                                <div>
                                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        Status
                                    </p>
                                    <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-1 md:inline-flex md:grid-cols-none md:gap-0 md:rounded-full">
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
                                                className={`cursor-pointer rounded-xl px-3 py-2 text-xs transition md:rounded-full md:px-5 md:text-sm ${
                                                    activeFilter === filter.key
                                                        ? "bg-sky-500 font-semibold text-white"
                                                        : "font-medium text-slate-600 hover:bg-slate-100"
                                                }`}
                                            >
                                                <span className="inline-flex items-center gap-2">
                                                    <span>{filter.label}</span>
                                                    <span
                                                        className={`inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                                            activeFilter ===
                                                            filter.key
                                                                ? "bg-white/20 text-white"
                                                                : "bg-slate-200 text-slate-700"
                                                        }`}
                                                    >
                                                        {requestCounts[
                                                            filter.key
                                                        ] ?? 0}
                                                    </span>
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <label className="block">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        Periode
                                    </span>
                                    <CustomSelect
                                        value={periodFilter}
                                        onChange={setPeriodFilter}
                                        options={PERIOD_OPTIONS}
                                    />
                                </label>

                                <label className="block">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        Teknisi
                                    </span>
                                    <CustomSelect
                                        value={selectedTechnicianKey}
                                        onChange={setSelectedTechnicianKey}
                                        options={technicianOptions}
                                    />
                                </label>
                            </div>

                            {periodFilter === "custom" && (
                                <div className="mt-3 grid gap-3 md:grid-cols-2 lg:max-w-xl">
                                    <label className="block">
                                        <span className="text-xs font-medium text-slate-600">
                                            Start Date
                                        </span>
                                        <input
                                            type="date"
                                            value={customStartDate}
                                            onChange={(event) =>
                                                setCustomStartDate(
                                                    event.target.value,
                                                )
                                            }
                                            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-300 focus:bg-white"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs font-medium text-slate-600">
                                            End Date
                                        </span>
                                        <input
                                            type="date"
                                            value={customEndDate}
                                            onChange={(event) =>
                                                setCustomEndDate(
                                                    event.target.value,
                                                )
                                            }
                                            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-300 focus:bg-white"
                                        />
                                    </label>
                                </div>
                            )}

                            <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 md:flex-row md:items-center md:justify-between">
                                <p className="text-sm text-slate-600">
                                    {filterSummary}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={resetFilters}
                                        disabled={!hasActiveAdvancedFilter}
                                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <RotateCcw size={15} />
                                        Reset Filter
                                    </button>
                                    <button
                                        type="button"
                                        onClick={downloadExcel}
                                        disabled={filteredRequests.length === 0}
                                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                                    >
                                        <Download size={16} />
                                        Download Excel
                                    </button>
                                </div>
                            </div>
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
                                Tidak ada pekerjaan yang sesuai dengan filter.
                            </p>
                        ) : (
                            <div className="mt-4 space-y-3">
                                {paginatedRequests.map((item) => {
                                    const metaItems = getRequestMetaItems(item);
                                    return (
                                        <article
                                            key={item.id}
                                            className="cursor-pointer rounded-xl border border-slate-200 p-4 transition hover:border-sky-300 hover:bg-sky-50/40"
                                            onClick={() =>
                                                setSelectedRequestId(item.id)
                                            }
                                        >
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            {(() => {
                                                const scopeSummary =
                                                    getScopeSummaryMeta(
                                                        item.job_scope,
                                                        item.dynamic_data,
                                                        item.room_location,
                                                    );
                                                return (
                                                    <>
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
                                                    {scopeSummary.label}:{" "}
                                                    {previewText(
                                                        scopeSummary.value,
                                                        48,
                                                    )}
                                                </p>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    Brief:{" "}
                                                    {previewText(
                                                        item.job_brief,
                                                    )}
                                                </p>
                                            </div>
                                            <span
                                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                                    STATUS_STYLES[
                                                        normalizeStatusKey(
                                                            item.status,
                                                        )
                                                    ] ?? STATUS_STYLES.pending
                                                }`}
                                            >
                                                {STATUS_LABELS[
                                                    normalizeStatusKey(
                                                        item.status,
                                                    )
                                                ] ?? "PENDING"}
                                            </span>
                                                    </>
                                                );
                                            })()}
                                        </div>

                                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                            <span className="inline-flex items-center gap-1">
                                                <CalendarDays size={13} />
                                                {formatDate(item.created_at)}
                                            </span>
                                            {metaItems.map((meta) => (
                                                <span
                                                    key={`${meta.label}-${meta.value}`}
                                                    className="inline-flex max-w-full items-center rounded-full bg-slate-100 px-2 py-1 text-slate-600"
                                                    title={`${meta.label}: ${meta.value}`}
                                                >
                                                    <span className="font-medium">
                                                        {meta.label}:
                                                    </span>
                                                    <span className="ml-1 max-w-40 truncate">
                                                        {meta.value}
                                                    </span>
                                                </span>
                                            ))}
                                            <span className="font-medium text-slate-600">
                                                Teknisi:{" "}
                                                {item.technician_names ??
                                                    item.technician_name ??
                                                    "-"}
                                            </span>
                                        </div>
                                    </article>
                                    );
                                })}

                                {filteredRequests.length > ITEMS_PER_PAGE && (
                                    <div className="mt-6 flex items-center justify-center sm:justify-between">
                                        <div className="hidden text-sm text-slate-600 sm:block">
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

                                        <div className="flex max-w-full items-center gap-1 sm:gap-2">
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
                                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white p-1.5 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:h-auto sm:w-auto sm:p-2"
                                                title="Previous page"
                                            >
                                                <ChevronLeft size={16} />
                                            </button>

                                            <div className="flex max-w-full flex-nowrap gap-1 overflow-hidden">
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
                                                        className={`inline-flex h-8 min-w-7 shrink-0 items-center justify-center rounded-lg px-1.5 py-1.5 text-xs font-medium transition sm:h-auto sm:min-w-10 sm:px-3 sm:py-2 sm:text-sm ${
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
                                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white p-1.5 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:h-auto sm:w-auto sm:p-2"
                                                title="Next page"
                                            >
                                                <ChevronRight size={16} />
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
                                    setSelectedRequestId(null);
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
                                                normalizeStatusKey(
                                                    selectedRequest.status,
                                                )
                                            ] ?? STATUS_STYLES.pending
                                        }`}
                                    >
                                        {STATUS_LABELS[
                                            normalizeStatusKey(
                                                selectedRequest.status,
                                            )
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
                                <ScopeDetailsCard
                                    jobScope={selectedRequest.job_scope}
                                    dynamicData={selectedRequest.dynamic_data}
                                    acDetails={{
                                        brand: selectedRequest.ac_brand,
                                        type: selectedRequest.ac_type,
                                        capacity:
                                            selectedRequest.ac_capacity_pk,
                                        roomLocation:
                                            selectedRequest.room_location,
                                        serialNumber:
                                            selectedRequest.serial_number,
                                    }}
                                />
                            </div>

                            <div className="rounded-xl border border-slate-200 p-4">
                                <p className="text-xs uppercase tracking-wide text-slate-500">
                                    Teknisi
                                </p>
                                <p className="mt-2 text-sm font-medium text-slate-700">
                                    {selectedRequest.technician_names ??
                                        selectedRequest.technician_name ??
                                        "-"}
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
                                    Brief Pekerjaan
                                </p>
                                <p className="mt-2 text-sm text-slate-700">
                                    {selectedRequest.job_brief ?? "-"}
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
