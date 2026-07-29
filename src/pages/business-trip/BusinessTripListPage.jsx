import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
    ChevronDown,
    ChevronUp,
    ClipboardList,
    Eye,
    FileText,
    Filter,
    Hotel,
    MoreHorizontal,
    Pencil,
    Plane,
    Plus,
    RotateCcw,
    Search,
    Trash2,
    X,
} from "lucide-react";
import BusinessTripLayout from "./BusinessTripLayout";
import { useBusinessTripDraft } from "./BusinessTripDraftContext";
import { useAuth } from "../../context/useAuth";
import {
    BUSINESS_TRIP_STATUS,
    BUSINESS_TRIP_STATUS_LABELS,
} from "./businessTripConstants";
import {
    Button,
    EmptyState,
    PhotoPreviewGrid,
    StatusBadge,
} from "./BusinessTripShared";
import {
    formatAccommodationAmount,
    hasAccommodationRequest,
} from "./businessTripAccommodationModel";
import { getBusinessTripCardStyle } from "./businessTripCardStyle";
import { getAgendaObjective, getAgendaTitle } from "./businessTripAgendaModel";
import { startBusinessTrip } from "../../services/businessTripService";

const STATUS_FILTERS = [
    { value: BUSINESS_TRIP_STATUS.DRAFT, label: "Draft" },
    { value: BUSINESS_TRIP_STATUS.PENDING_APPROVAL, label: "Menunggu Approval" },
    { value: BUSINESS_TRIP_STATUS.REJECTED, label: "Ditolak" },
    { value: "needs-realization", label: "Perlu Realisasi" },
    { value: BUSINESS_TRIP_STATUS.REALIZATION_SUBMITTED, label: "Verifikasi" },
    { value: "Settlement", label: "Settlement" },
    { value: BUSINESS_TRIP_STATUS.COMPLETED, label: "Selesai" },
];

const STATUS_FILTER_STYLES = {
    [BUSINESS_TRIP_STATUS.DRAFT]:
        "border-sky-200 bg-sky-50 text-sky-700 data-[active=true]:border-sky-400 data-[active=true]:bg-sky-100",
    [BUSINESS_TRIP_STATUS.PENDING_APPROVAL]:
        "border-amber-200 bg-amber-50 text-amber-800 data-[active=true]:border-amber-400 data-[active=true]:bg-amber-100",
    [BUSINESS_TRIP_STATUS.REJECTED]:
        "border-red-200 bg-red-50 text-red-700 data-[active=true]:border-red-400 data-[active=true]:bg-red-100",
    "needs-realization":
        "border-cyan-200 bg-cyan-50 text-cyan-800 data-[active=true]:border-cyan-400 data-[active=true]:bg-cyan-100",
    [BUSINESS_TRIP_STATUS.REALIZATION_SUBMITTED]:
        "border-violet-200 bg-violet-50 text-violet-800 data-[active=true]:border-violet-400 data-[active=true]:bg-violet-100",
    Settlement:
        "border-orange-200 bg-orange-50 text-orange-800 data-[active=true]:border-orange-400 data-[active=true]:bg-orange-100",
    [BUSINESS_TRIP_STATUS.COMPLETED]:
        "border-emerald-200 bg-emerald-50 text-emerald-800 data-[active=true]:border-emerald-400 data-[active=true]:bg-emerald-100",
};

const ACTION_CONFIG = {
    [BUSINESS_TRIP_STATUS.DRAFT]: {
        primary: { label: "Edit", type: "edit", icon: Pencil },
        secondary: { label: "Ringkasan", type: "summary" },
        overflow: [{ label: "Hapus Draft", type: "delete", danger: true }],
    },
    [BUSINESS_TRIP_STATUS.SUBMITTED]: {
        secondary: { label: "Ringkasan", type: "summary" },
        info: "Menunggu persetujuan atasan",
    },
    [BUSINESS_TRIP_STATUS.PENDING_APPROVAL]: {
        secondary: { label: "Ringkasan", type: "summary" },
        info: "Menunggu persetujuan atasan",
    },
    [BUSINESS_TRIP_STATUS.REJECTED]: {
        primary: { label: "Edit", type: "resubmit", icon: Pencil },
        secondary: { label: "Ringkasan", type: "summary" },
    },
    [BUSINESS_TRIP_STATUS.APPROVED]: {
        secondary: { label: "Ringkasan", type: "summary" },
        info: "Pengajuan disetujui dan menunggu pencairan uang muka",
    },
    [BUSINESS_TRIP_STATUS.ADVANCE_DISBURSED]: {
        primary: { label: "Mulai", type: "start-trip", icon: Plane },
        secondary: { label: "Ringkasan", type: "summary" },
        info: "Uang muka telah dicairkan",
    },
    [BUSINESS_TRIP_STATUS.IN_PROGRESS]: {
        primary: { label: "Laporan", type: "realization", icon: FileText },
        secondary: { label: "Ringkasan", type: "summary" },
    },
    [BUSINESS_TRIP_STATUS.REALIZATION_DRAFT]: {
        primary: { label: "Realisasi", type: "realization", icon: FileText },
        secondary: { label: "Ringkasan", type: "summary" },
    },
    [BUSINESS_TRIP_STATUS.REALIZATION_REVISION_REQUIRED]: {
        primary: { label: "Perbaiki", type: "realization", icon: FileText },
        secondary: { label: "Ringkasan", type: "summary" },
    },
    [BUSINESS_TRIP_STATUS.REALIZATION_SUBMITTED]: {
        secondary: { label: "Lihat Realisasi", type: "realization" },
        info: "Laporan realisasi sedang diverifikasi",
    },
    [BUSINESS_TRIP_STATUS.PENDING_REFUND]: {
        secondary: { label: "Lihat Realisasi", type: "realization" },
    },
    [BUSINESS_TRIP_STATUS.PENDING_ADDITIONAL_PAYMENT]: {
        secondary: { label: "Lihat Realisasi", type: "realization" },
    },
    [BUSINESS_TRIP_STATUS.COMPLETED]: {
        secondary: { label: "Lihat Hasil Realisasi", type: "realization" },
    },
};

const SORT_OPTIONS = [
    { value: "newest", label: "Terbaru" },
    { value: "oldest", label: "Terlama" },
    { value: "trip-nearest", label: "Tanggal Trip Terdekat" },
];

const PAGE_SIZE = 20;

const toDateInput = (date) => date.toISOString().slice(0, 10);

const getDefaultFilterDates = () => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 29);
    return {
        startDate: toDateInput(startDate),
        endDate: toDateInput(endDate),
    };
};

const normalizeStatusParam = (value) => {
    if (!value) return BUSINESS_TRIP_STATUS.DRAFT;
    if (value === "submitted" || value === "pending_approval") {
        return BUSINESS_TRIP_STATUS.PENDING_APPROVAL;
    }
    return STATUS_FILTERS.some((item) => item.value === value)
        ? value
        : BUSINESS_TRIP_STATUS.DRAFT;
};

const formatDate = (value, options = {}) =>
    value
        ? new Intl.DateTimeFormat("id-ID", {
              day: "2-digit",
              month: options.short ? "short" : "2-digit",
              year: "numeric",
          }).format(new Date(value))
        : "-";

const getTripDateLabel = (trip) =>
    trip.dateMode === "range"
        ? `${formatDate(trip.startDate, { short: true })} - ${formatDate(
              trip.endDate,
              { short: true },
          )}`
        : formatDate(trip.tripDate, { short: true });

const getProjectLabel = (project) =>
    project ? `${project.project_name} - ${project.customer_name}` : "Belum dipilih";

const getCardInfo = (trip, fallbackInfo) => {
    if (trip.status !== BUSINESS_TRIP_STATUS.ADVANCE_DISBURSED) {
        if (trip.status === BUSINESS_TRIP_STATUS.REALIZATION_REVISION_REQUIRED) {
            return trip.realizationRevisionNote
                ? `Revisi: ${trip.realizationRevisionNote}`
                : "Laporan realisasi perlu diperbaiki.";
        }
        if (trip.status === BUSINESS_TRIP_STATUS.PENDING_REFUND) {
            return `Sisa uang muka ${formatAccommodationAmount(
                Math.abs(trip.settlementDifference ?? 0),
            )} perlu dikembalikan.`;
        }
        if (trip.status === BUSINESS_TRIP_STATUS.PENDING_ADDITIONAL_PAYMENT) {
            return `Perusahaan perlu membayar ${formatAccommodationAmount(
                Math.abs(trip.settlementDifference ?? 0),
            )}.`;
        }
        return fallbackInfo;
    }

    const disbursement = trip.advanceDisbursement;
    if (!disbursement) return "Uang muka telah dicairkan.";

    return `Uang muka ${formatAccommodationAmount(
        disbursement.amount,
    )} telah dicairkan pada ${formatDate(disbursement.disbursedAt, {
        short: true,
    })}.`;
};

const getQuickFilterDates = (mode) => {
    const today = new Date();
    const startDate = new Date(today);

    if (mode === "7d") startDate.setDate(today.getDate() - 6);
    if (mode === "30d") startDate.setDate(today.getDate() - 29);
    if (mode === "month") startDate.setDate(1);
    if (mode === "3m") startDate.setMonth(today.getMonth() - 3);

    return {
        startDate: toDateInput(startDate),
        endDate: toDateInput(today),
    };
};

export default function BusinessTripListPage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { user } = useAuth();
    const {
        businessTrips,
        createTrip,
        deleteTrip,
        error,
        getProjectById,
        loadBusinessTripById,
        loadBusinessTrips,
        loading: isLoading,
        statusCounts,
        totalCount,
    } = useBusinessTripDraft();
    const [filters, setFilters] = useState(getDefaultFilterDates);
    const [draftFilters, setDraftFilters] = useState(getDefaultFilterDates);
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState(() =>
        normalizeStatusParam(searchParams.get("status")),
    );
    const [sortMode, setSortMode] = useState("newest");
    const [page, setPage] = useState(1);
    const [filterOpen, setFilterOpen] = useState(false);
    const [summaryTripId, setSummaryTripId] = useState("");
    const [overflowTripId, setOverflowTripId] = useState("");
    const [toast, setToast] = useState("");

    useEffect(() => {
        if (!user?.id) return undefined;

        const timeoutId = window.setTimeout(() => {
            loadBusinessTrips({
                endDate: filters.endDate,
                page,
                pageSize: PAGE_SIZE,
                search: query,
                sortMode,
                startDate: filters.startDate,
                statusFilter,
            }).catch(() => {});
        }, query.trim() ? 350 : 0);

        return () => window.clearTimeout(timeoutId);
    }, [
        filters.endDate,
        filters.startDate,
        loadBusinessTrips,
        page,
        query,
        sortMode,
        statusFilter,
        user?.id,
    ]);

    const showToast = (message) => {
        setToast(message);
        window.setTimeout(() => setToast(""), 2600);
    };

    const updateStatusFilter = (value) => {
        setStatusFilter(value);
        setPage(1);
        setSearchParams(
            (current) => {
                const next = new URLSearchParams(current);
                if (value === BUSINESS_TRIP_STATUS.DRAFT) {
                    next.delete("status");
                } else {
                    next.set("status", value);
                }
                return next;
            },
            { replace: true },
        );
    };

    const selectedSummaryTrip = businessTrips.find(
        (trip) => trip.id === summaryTripId,
    );
    const hasNarrowFilter =
        Boolean(query.trim()) || statusFilter !== BUSINESS_TRIP_STATUS.DRAFT;

    const createNewTrip = async () => {
        try {
            const tripId = await createTrip();
            showToast("Draft pengajuan baru dibuat.");
            navigate(`/business-trip/form/${tripId}`);
        } catch (createError) {
            console.error("[BusinessTrip] create draft failed", createError);
            showToast("Draft gagal dibuat. Coba lagi.");
        }
    };

    const resetDateFilter = () => {
        const nextDates = getDefaultFilterDates();
        setDraftFilters(nextDates);
        setFilters(nextDates);
        setPage(1);
    };

    const resetAllFilters = () => {
        const nextDates = getDefaultFilterDates();
        setDraftFilters(nextDates);
        setFilters(nextDates);
        setQuery("");
        updateStatusFilter(BUSINESS_TRIP_STATUS.DRAFT);
        setSortMode("newest");
        setPage(1);
    };

    const applyDateFilter = () => {
        setFilters(draftFilters);
        setFilterOpen(false);
        setPage(1);
    };

    const runAction = async (trip, actionType) => {
        setOverflowTripId("");
        if (actionType === "summary") {
            setSummaryTripId(trip.id);
            loadBusinessTripById(trip.id).catch((summaryError) => {
                console.warn("[BusinessTrip] summary detail skipped:", summaryError);
            });
        }
        if (actionType === "edit") navigate(`/business-trip/form/${trip.id}`);
        if (actionType === "resubmit") navigate(`/business-trip/form/${trip.id}`);
        if (actionType === "realization") {
            navigate(`/business-trip/realization/${trip.id}`);
        }
        if (actionType === "delete") {
            const confirmed = window.confirm("Hapus draft Business Trip ini?");
            if (!confirmed) return;
            try {
                await deleteTrip(trip.id);
                showToast("Draft pengajuan dihapus.");
                loadBusinessTrips({
                    endDate: filters.endDate,
                    page,
                    pageSize: PAGE_SIZE,
                    search: query,
                    sortMode,
                    startDate: filters.startDate,
                    statusFilter,
                }).catch(() => {});
            } catch (deleteError) {
                console.error("[BusinessTrip] delete draft failed", deleteError);
                showToast("Draft gagal dihapus.");
            }
        }
        if (actionType === "disburse") {
            showToast("Approval dan pencairan belum masuk step integrasi ini.");
        }
        if (actionType === "start-trip") {
            try {
                await startBusinessTrip(trip.id);
                showToast("Perjalanan Business Trip dimulai.");
                loadBusinessTrips({
                    endDate: filters.endDate,
                    page,
                    pageSize: PAGE_SIZE,
                    search: query,
                    sortMode,
                    startDate: filters.startDate,
                    statusFilter,
                }).catch(() => {});
            } catch (startError) {
                console.error("[BusinessTrip] start trip failed", startError);
                showToast(startError.message || "Gagal memulai perjalanan.");
            }
        }
    };

    return (
        <BusinessTripLayout title="Business Trip" showBack={false}>
            <div className="space-y-3">
                <BusinessTripPageHeader onCreate={createNewTrip} />

                <BusinessTripSearch
                    query={query}
                    onChange={(value) => {
                        setQuery(value);
                        setPage(1);
                    }}
                    onClear={() => {
                        setQuery("");
                        setPage(1);
                    }}
                />

                <BusinessTripStatusSummary
                    activeStatus={statusFilter}
                    counts={statusCounts}
                    onChange={updateStatusFilter}
                />

                <BusinessTripHistoryFilter
                    draftFilters={draftFilters}
                    filters={filters}
                    open={filterOpen}
                    onApply={applyDateFilter}
                    onQuickFilter={(mode) =>
                        setDraftFilters(getQuickFilterDates(mode))
                    }
                    onReset={resetDateFilter}
                    onToggle={() => setFilterOpen((current) => !current)}
                    setDraftFilters={setDraftFilters}
                />

                <ResultToolbar
                    count={totalCount}
                    page={page}
                    pageSize={PAGE_SIZE}
                    sortMode={sortMode}
                    onPageChange={setPage}
                    onSortChange={(value) => {
                        setSortMode(value);
                        setPage(1);
                    }}
                />

                {error ? (
                    <BusinessTripErrorState
                        onRetry={() =>
                            loadBusinessTrips({
                                endDate: filters.endDate,
                                page,
                                pageSize: PAGE_SIZE,
                                search: query,
                                sortMode,
                                startDate: filters.startDate,
                                statusFilter,
                            }).catch(() => {})
                        }
                    />
                ) : isLoading ? (
                    <BusinessTripCardSkeleton />
                ) : businessTrips.length === 0 && hasNarrowFilter ? (
                    <EmptyState icon={Search} title="Tidak ada pengajuan ditemukan">
                        Coba ubah kata pencarian atau status filter.
                        <span className="mt-3 block">
                            <Button
                                tone="secondary"
                                icon={RotateCcw}
                                onClick={resetAllFilters}
                            >
                                Reset Filter
                            </Button>
                        </span>
                    </EmptyState>
                ) : businessTrips.length === 0 ? (
                    <EmptyState
                        icon={ClipboardList}
                        title="Belum ada pengajuan Business Trip"
                    >
                        Buat pengajuan pertama untuk memulai proses Business Trip.
                        <span className="mt-3 block">
                            <Button icon={Plus} onClick={createNewTrip}>
                                Buat Pengajuan
                            </Button>
                        </span>
                    </EmptyState>
                ) : (
                    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                        {businessTrips.map((trip) => (
                            <BusinessTripCard
                                key={trip.id}
                                trip={trip}
                                project={getProjectById(trip.projectId)}
                                overflowOpen={overflowTripId === trip.id}
                                onAction={(actionType) => runAction(trip, actionType)}
                                onToggleOverflow={() =>
                                    setOverflowTripId((current) =>
                                        current === trip.id ? "" : trip.id,
                                    )
                                }
                            />
                        ))}
                    </div>
                )}

                {selectedSummaryTrip && (
                    <BusinessTripSummarySheet
                        project={getProjectById(selectedSummaryTrip.projectId)}
                        trip={selectedSummaryTrip}
                        onClose={() => setSummaryTripId("")}
                    />
                )}

                {toast && (
                    <div className="fixed inset-x-4 top-5 z-80 mx-auto max-w-md rounded-xl bg-slate-950 px-4 py-2.5 text-center text-[13px] font-semibold text-white shadow-xl md:top-6">
                        {toast}
                    </div>
                )}
            </div>
        </BusinessTripLayout>
    );
}

function BusinessTripPageHeader({ onCreate }) {
    return (
        <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <Button icon={Plus} onClick={onCreate} className="w-full">
                Pengajuan Baru
            </Button>
        </section>
    );
}

function BusinessTripSearch({ query, onChange, onClear }) {
    return (
        <label className="relative block">
            <span className="sr-only">Cari nomor, judul, atau project</span>
            <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
                value={query}
                onChange={(event) => onChange(event.target.value)}
                placeholder="Cari nomor, judul, atau project"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-10 text-[13px] text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            />
            {query && (
                <button
                    type="button"
                    onClick={onClear}
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-4 focus:ring-sky-100"
                    aria-label="Hapus pencarian"
                    title="Hapus pencarian"
                >
                    <X size={15} />
                </button>
            )}
        </label>
    );
}

function BusinessTripStatusSummary({ activeStatus, counts, onChange }) {
    return (
        <div
            className="max-w-full overflow-x-auto overscroll-x-contain pb-2"
            aria-label="Filter status Business Trip"
        >
            <div className="flex w-max min-w-full touch-pan-x gap-2 xl:w-full">
                {STATUS_FILTERS.map((item) => {
                    const selected = activeStatus === item.value;
                    return (
                        <button
                            key={item.value}
                            type="button"
                            data-active={selected}
                            onClick={() => onChange(item.value)}
                            className={`min-w-[118px] shrink-0 rounded-xl border px-3 py-2 text-left shadow-sm transition focus:outline-none focus:ring-4 focus:ring-sky-100 xl:min-w-0 xl:flex-1 ${
                                STATUS_FILTER_STYLES[item.value]
                            }`}
                        >
                            <span className="block truncate text-[11px] font-semibold">
                                {item.label}
                            </span>
                            <span className="mt-1 block text-lg font-bold leading-none">
                                {counts[item.value] ?? 0}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function BusinessTripHistoryFilter({
    draftFilters,
    filters,
    onApply,
    onQuickFilter,
    onReset,
    onToggle,
    open,
    setDraftFilters,
}) {
    const periodLabel = `${formatDate(filters.startDate)} - ${formatDate(
        filters.endDate,
    )}`;
    const quickFilters = [
        ["7d", "7 Hari"],
        ["30d", "30 Hari"],
        ["month", "Bulan Ini"],
        ["3m", "3 Bulan Terakhir"],
    ];

    return (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <button
                type="button"
                onClick={onToggle}
                className="flex w-full items-center gap-3 p-3 text-left focus:outline-none focus:ring-4 focus:ring-sky-100"
                aria-expanded={open}
            >
                <span className="rounded-lg bg-slate-100 p-2 text-slate-500">
                    <Filter size={16} />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold text-slate-900">
                        Filter Histori
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {periodLabel}
                    </span>
                </span>
                {open ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
            </button>

            {open && (
                <div className="space-y-3 border-t border-slate-100 p-3">
                    <div className="grid grid-cols-2 gap-2 max-[340px]:grid-cols-1">
                        <label>
                            <span className="text-[11px] font-semibold text-slate-500">
                                Tanggal Mulai
                            </span>
                            <input
                                type="date"
                                value={draftFilters.startDate}
                                onChange={(event) =>
                                    setDraftFilters((current) => ({
                                        ...current,
                                        startDate: event.target.value,
                                    }))
                                }
                                className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-800 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                            />
                        </label>
                        <label>
                            <span className="text-[11px] font-semibold text-slate-500">
                                Tanggal Selesai
                            </span>
                            <input
                                type="date"
                                value={draftFilters.endDate}
                                onChange={(event) =>
                                    setDraftFilters((current) => ({
                                        ...current,
                                        endDate: event.target.value,
                                    }))
                                }
                                className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-800 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                            />
                        </label>
                    </div>

                    <div>
                        <p className="text-[11px] font-semibold text-slate-500">
                            Filter Cepat
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {quickFilters.map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => onQuickFilter(value)}
                                    className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-sky-100"
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <Button tone="secondary" onClick={onReset}>
                            Reset
                        </Button>
                        <Button onClick={onApply}>Terapkan</Button>
                    </div>
                </div>
            )}
        </section>
    );
}

function ResultToolbar({ count, onPageChange, onSortChange, page, pageSize, sortMode }) {
    const totalPages = Math.max(1, Math.ceil(count / pageSize));
    return (
        <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-slate-700">
                Menampilkan {count} pengajuan
            </p>
            <div className="flex shrink-0 items-center gap-2">
                <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
                    <button
                        type="button"
                        onClick={() => onPageChange((current) => Math.max(1, current - 1))}
                        disabled={page <= 1}
                        className="h-8 rounded-md px-2 text-[12px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:text-slate-300"
                    >
                        Prev
                    </button>
                    <span className="min-w-10 text-center text-[12px] font-bold text-slate-600">
                        {page}/{totalPages}
                    </span>
                    <button
                        type="button"
                        onClick={() =>
                            onPageChange((current) => Math.min(totalPages, current + 1))
                        }
                        disabled={page >= totalPages}
                        className="h-8 rounded-md px-2 text-[12px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:text-slate-300"
                    >
                        Next
                    </button>
                </div>
                <label className="flex shrink-0 items-center gap-2">
                    <span className="sr-only">Urutkan</span>
                    <select
                        value={sortMode}
                        onChange={(event) => onSortChange(event.target.value)}
                        className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-700 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    >
                        {SORT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
        </div>
    );
}

function BusinessTripCard({
    onAction,
    onToggleOverflow,
    overflowOpen,
    project,
    trip,
}) {
    const baseConfig =
        ACTION_CONFIG[trip.status] ??
        ACTION_CONFIG[BUSINESS_TRIP_STATUS.PENDING_APPROVAL];
    const config =
        trip.status === BUSINESS_TRIP_STATUS.APPROVED &&
        Number(trip.accommodationRequest?.requestedAmount ?? 0) <= 0
            ? {
                  ...baseConfig,
                  primary: { label: "Mulai", type: "start-trip", icon: Plane },
                  info: "Pengajuan disetujui. Perjalanan dapat dimulai.",
              }
            : baseConfig;
    const agendaCount = trip.agendas.length;
    const cardStyle = getBusinessTripCardStyle(trip.status);

    return (
        <article
            className="relative rounded-xl border p-3.5 shadow-[0_4px_16px_rgba(15,23,42,0.05)] transition duration-200 active:opacity-95 md:hover:-translate-y-0.5 md:hover:shadow-[0_8px_22px_rgba(15,23,42,0.08)]"
            style={cardStyle}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold tracking-wide text-sky-600">
                        {trip.businessTripNo}
                    </p>
                    <h3 className="mt-1 line-clamp-2 text-[15px] font-bold leading-5 text-slate-950">
                        {trip.title || "Pengajuan belum diberi judul"}
                    </h3>
                    <p className="mt-1 truncate text-xs text-slate-500">
                        {getProjectLabel(project)}
                    </p>
                    {hasAccommodationRequest(trip.accommodationRequest) && (
                        <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-sky-100 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                            <Hotel size={12} />
                            Akomodasi{" "}
                            {formatAccommodationAmount(
                                trip.accommodationRequest.requestedAmount,
                            )}
                        </span>
                    )}
                </div>
                <div className="max-w-[42%] shrink-0 text-right">
                    <StatusBadge status={trip.status} />
                </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-y border-white/60 py-3">
                <TripMeta label="Tanggal Trip" value={getTripDateLabel(trip)} />
                <TripMeta
                    label="Tanggal Pengajuan"
                    value={formatDate(trip.createdAt, { short: true })}
                />
                <TripMeta label="Inisiator" value={trip.initiatorName} />
                <TripMeta label="Agenda" value={`${agendaCount} agenda`} />
            </div>

            {config.info && <InfoStrip>{getCardInfo(trip, config.info)}</InfoStrip>}

            {trip.status === BUSINESS_TRIP_STATUS.REJECTED && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-[11px] font-bold uppercase text-red-700">
                        Alasan Penolakan
                    </p>
                    <p className="mt-1 text-xs leading-5 text-red-700">
                        {trip.rejectionReason || "Tidak ada alasan penolakan."}
                    </p>
                </div>
            )}

            <div className="mt-3 flex items-center gap-2">
                {config.primary && (
                    <Button
                        icon={config.primary.icon}
                        onClick={() => onAction(config.primary.type)}
                        className="min-w-0 flex-1"
                    >
                        {config.primary.label}
                    </Button>
                )}
                {config.secondary && (
                    <Button
                        tone="secondary"
                        onClick={() => onAction(config.secondary.type)}
                        className="h-10 w-10 shrink-0 px-0"
                        aria-label={config.secondary.label}
                        title={config.secondary.label}
                    >
                        <Eye size={16} />
                    </Button>
                )}
                {config.overflow?.length > 0 && (
                    <div className="relative">
                        <button
                            type="button"
                            onClick={onToggleOverflow}
                            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-sky-100"
                            aria-label={`Menu aksi ${trip.businessTripNo}`}
                            title="Menu aksi"
                        >
                            <MoreHorizontal size={17} />
                        </button>
                        {overflowOpen && (
                            <div className="absolute right-0 top-11 z-20 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                                {config.overflow.map((item) => (
                                    <button
                                        key={item.type}
                                        type="button"
                                        onClick={() => onAction(item.type)}
                                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-semibold transition hover:bg-slate-50 ${
                                            item.danger
                                                ? "text-red-600 hover:bg-red-50"
                                                : "text-slate-700"
                                        }`}
                                    >
                                        {item.danger && <Trash2 size={15} />}
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </article>
    );
}

function TripMeta({ label, value }) {
    return (
        <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                {label}
            </p>
            <p className="mt-0.5 truncate text-[12px] font-semibold text-slate-800">
                {value || "-"}
            </p>
        </div>
    );
}

function InfoStrip({ children }) {
    return (
        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-600">
            {children}
        </p>
    );
}

function BusinessTripSummarySheet({ onClose, project, trip }) {
    return (
        <div className="fixed inset-0 z-90 flex items-end bg-slate-950/40 p-3 md:items-center md:justify-center">
            <section className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl">
                <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-100 bg-white p-4">
                    <div className="min-w-0">
                        <p className="text-[11px] font-bold tracking-wide text-sky-600">
                            {trip.businessTripNo}
                        </p>
                        <h3 className="mt-1 text-base font-bold text-slate-950">
                            Ringkasan Business Trip
                        </h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-4 focus:ring-sky-100"
                        aria-label="Tutup ringkasan"
                        title="Tutup"
                    >
                        <X size={17} />
                    </button>
                </div>

                <div className="space-y-4 p-4">
                    <div className="grid grid-cols-2 gap-2">
                        <SummaryItem label="Judul" value={trip.title} wide />
                        <SummaryItem
                            label="Project"
                            value={getProjectLabel(project)}
                            wide
                        />
                        <SummaryItem
                            label="Tanggal Trip"
                            value={getTripDateLabel(trip)}
                        />
                        <SummaryItem
                            label="Tanggal Pengajuan"
                            value={formatDate(trip.createdAt, { short: true })}
                        />
                        <SummaryItem label="Inisiator" value={trip.initiatorName} />
                        <SummaryItem
                            label="Status"
                            value={BUSINESS_TRIP_STATUS_LABELS[trip.status] ?? trip.status}
                        />
                    </div>

                    <div>
                        <h4 className="text-[13px] font-bold text-slate-900">
                            Daftar Agenda
                        </h4>
                        <div className="mt-2 space-y-2">
                            {trip.agendas.length === 0 ? (
                                <p className="rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500">
                                    Belum ada agenda.
                                </p>
                            ) : (
                                trip.agendas.map((agenda, index) => (
                                    <article
                                        key={agenda.id}
                                        className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                                    >
                                        <p className="text-[11px] font-bold uppercase text-slate-400">
                                            Agenda {index + 1}
                                        </p>
                                        <p className="mt-1 text-[13px] font-bold text-slate-900">
                                            {getAgendaTitle(agenda) ||
                                                "Agenda belum diberi nama"}
                                        </p>
                                        <p className="mt-1 text-xs leading-5 text-slate-600">
                                            {getAgendaObjective(agenda) ||
                                                "Belum ada tujuan agenda."}
                                        </p>
                                        {agenda.realization?.result && (
                                            <div className="mt-3">
                                                <p className="text-[11px] font-bold uppercase text-slate-400">
                                                    Hasil Realisasi
                                                </p>
                                                <p className="mt-1 text-xs leading-5 text-slate-700">
                                                    {agenda.realization.result}
                                                </p>
                                                <PhotoPreviewGrid
                                                    photos={
                                                        agenda.realization?.photos ?? []
                                                    }
                                                    readOnly
                                                />
                                            </div>
                                        )}
                                    </article>
                                ))
                            )}
                        </div>
                    </div>

                    <div>
                        <h4 className="text-[13px] font-bold text-slate-900">
                            Uang Muka
                        </h4>
                        <BusinessTripAdvanceSummary trip={trip} />
                    </div>

                    <div>
                        <h4 className="text-[13px] font-bold text-slate-900">
                            Histori Status
                        </h4>
                        {trip.statusHistory?.length ? (
                            <div className="mt-2 space-y-2">
                                {trip.statusHistory.map((item) => (
                                    <div
                                        key={item.id}
                                        className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                                    >
                                        <p className="text-[12px] font-bold text-slate-800">
                                            {item.action}
                                        </p>
                                        <p className="mt-1 text-[11px] text-slate-500">
                                            {formatDate(item.actedAt, {
                                                short: true,
                                            })}{" "}
                                            oleh {item.actedByName || "System"}
                                        </p>
                                        {item.notes && (
                                            <p className="mt-1 text-xs leading-5 text-slate-600">
                                                {item.notes}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500">
                                Histori status belum tersedia.
                            </p>
                        )}
                    </div>
                </div>
            </section>
        </div>
    );
}

function BusinessTripAdvanceSummary({ trip }) {
    if (!hasAccommodationRequest(trip.accommodationRequest)) {
        return (
            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500">
                Tidak mengajukan uang muka akomodasi.
            </p>
        );
    }

    const disbursement = trip.advanceDisbursement;

    return (
        <div className="mt-2 grid grid-cols-2 gap-2">
            <SummaryItem
                label="Requested Amount"
                value={formatAccommodationAmount(
                    trip.accommodationRequest.requestedAmount,
                )}
            />
            <SummaryItem
                label="Status"
                value={disbursement ? "Dicairkan" : "Menunggu Pencairan"}
            />
            {disbursement && (
                <>
                    <SummaryItem
                        label="Nominal Dicairkan"
                        value={formatAccommodationAmount(disbursement.amount)}
                    />
                    <SummaryItem
                        label="Tanggal Pencairan"
                        value={formatDate(disbursement.disbursedAt, {
                            short: true,
                        })}
                    />
                    <SummaryItem
                        label="Metode"
                        value={disbursement.paymentMethodLabel}
                    />
                    <SummaryItem
                        label="Reference"
                        value={disbursement.referenceNumber || "-"}
                    />
                </>
            )}
        </div>
    );
}

function SummaryItem({ label, value, wide = false }) {
    return (
        <div
            className={`rounded-lg border border-slate-200 bg-slate-50 p-3 ${
                wide ? "col-span-2" : ""
            }`}
        >
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                {label}
            </p>
            <p className="mt-1 break-words text-[12px] font-semibold text-slate-800">
                {value || "-"}
            </p>
        </div>
    );
}

function BusinessTripCardSkeleton() {
    return (
        <div className="grid gap-3 lg:grid-cols-2">
            {[1, 2, 3].map((item) => (
                <div
                    key={item}
                    className="animate-pulse rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm"
                >
                    <div className="h-3 w-28 rounded bg-slate-200" />
                    <div className="mt-3 h-4 w-3/4 rounded bg-slate-200" />
                    <div className="mt-2 h-3 w-1/2 rounded bg-slate-100" />
                    <div className="mt-4 grid grid-cols-2 gap-2">
                        {[1, 2, 3, 4].map((meta) => (
                            <div key={meta} className="h-10 rounded bg-slate-100" />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

function BusinessTripErrorState({ onRetry }) {
    return (
        <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-sm font-bold text-red-700">
                Data Business Trip gagal dimuat
            </p>
            <p className="mt-1 text-xs leading-5 text-red-600">
                Coba lagi untuk memuat ulang state halaman.
            </p>
            <Button tone="secondary" onClick={onRetry} className="mt-3">
                Coba Lagi
            </Button>
        </section>
    );
}
