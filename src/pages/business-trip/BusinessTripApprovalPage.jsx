import { useEffect, useMemo, useState } from "react";
import {
    CalendarDays,
    CheckCircle2,
    ChevronDown,
    ClipboardList,
    Eye,
    FolderKanban,
    RotateCcw,
    Search,
    ShieldCheck,
    UserRound,
    X,
    XCircle,
} from "lucide-react";
import { useAuth } from "../../context/useAuth";
import {
    APPROVAL_STATUS_FILTERS,
    approveBusinessTrip,
    getBusinessTripApprovalCounts,
    getBusinessTripApprovalDetail,
    getBusinessTripsForApproval,
    rejectBusinessTrip,
} from "../../services/businessTripService";
import BusinessTripLayout from "./BusinessTripLayout";
import {
    ActionFooter,
    Button,
    DetailRow,
    EmptyState,
    SectionCard,
    StatusBadge,
} from "./BusinessTripShared";
import { formatAccommodationAmount } from "./businessTripAccommodationModel";
import { getAgendaObjective, getAgendaTitle } from "./businessTripAgendaModel";
import { BUSINESS_TRIP_STATUS } from "./businessTripConstants";

const PAGE_SIZE = 20;

const statusFilters = [
    {
        value: APPROVAL_STATUS_FILTERS.PENDING,
        label: "Menunggu Approval",
        className:
            "border-amber-200 bg-amber-50 text-amber-800 data-[active=true]:border-amber-400 data-[active=true]:bg-amber-100",
    },
    {
        value: APPROVAL_STATUS_FILTERS.APPROVED,
        label: "Disetujui",
        className:
            "border-emerald-200 bg-emerald-50 text-emerald-700 data-[active=true]:border-emerald-400 data-[active=true]:bg-emerald-100",
    },
    {
        value: APPROVAL_STATUS_FILTERS.REJECTED,
        label: "Ditolak",
        className:
            "border-red-200 bg-red-50 text-red-700 data-[active=true]:border-red-400 data-[active=true]:bg-red-100",
    },
];

const sortOptions = [
    { value: "oldest", label: "Terlama" },
    { value: "newest", label: "Terbaru" },
    { value: "trip-nearest", label: "Tanggal Trip Terdekat" },
];

const toDateInput = (date) => date.toISOString().slice(0, 10);

const getDefaultDates = () => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 29);
    return {
        startDate: toDateInput(startDate),
        endDate: toDateInput(endDate),
    };
};

const formatDate = (value) =>
    value
        ? new Intl.DateTimeFormat("id-ID", {
              day: "2-digit",
              month: "short",
              year: "numeric",
          }).format(new Date(value))
        : "-";

const formatDateTime = (value) =>
    value
        ? new Intl.DateTimeFormat("id-ID", {
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              month: "short",
              year: "numeric",
          }).format(new Date(value))
        : "-";

const getTripDateLabel = (trip) =>
    trip.dateMode === "range"
        ? `${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}`
        : formatDate(trip.tripDate);

const getProjectLabel = (project, trip) =>
    trip.projectLabel ||
    [project?.project_name, project?.customer_name].filter(Boolean).join(" - ") ||
    "Belum dipilih";

const getStatusCount = (counts, status) => Number(counts[status] ?? 0);

const getActionErrorMessage = (error, fallback) => {
    const message = String(error?.message ?? "");
    if (message.includes("sudah diproses")) {
        return "Pengajuan ini sudah diproses oleh approver lain.";
    }
    if (message.includes("sendiri")) {
        return "Pemohon tidak dapat memproses pengajuannya sendiri.";
    }
    return fallback;
};

export default function BusinessTripApprovalPage() {
    const { role } = useAuth();
    const canApprove = ["admin", "management"].includes(role);
    const [filters, setFilters] = useState(getDefaultDates);
    const [draftFilters, setDraftFilters] = useState(getDefaultDates);
    const [query, setQuery] = useState("");
    const [requester, setRequester] = useState("");
    const [projectId, setProjectId] = useState("");
    const [statusFilter, setStatusFilter] = useState(APPROVAL_STATUS_FILTERS.PENDING);
    const [sortMode, setSortMode] = useState("oldest");
    const [page, setPage] = useState(1);
    const [filterOpen, setFilterOpen] = useState(false);
    const [items, setItems] = useState([]);
    const [projects, setProjects] = useState([]);
    const [counts, setCounts] = useState({});
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [selectedTrip, setSelectedTrip] = useState(null);
    const [rejectOpen, setRejectOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState("");
    const [rejectTouched, setRejectTouched] = useState(false);
    const [actionLoading, setActionLoading] = useState("");
    const [toast, setToast] = useState("");
    const [error, setError] = useState("");

    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    const selectedProject = useMemo(
        () => projects.find((project) => project.id === selectedTrip?.projectId),
        [projects, selectedTrip?.projectId],
    );
    const rejectError =
        rejectTouched && rejectReason.trim().length < 10
            ? "Alasan penolakan wajib diisi minimal 10 karakter."
            : "";

    const showToast = (message) => {
        setToast(message);
        window.setTimeout(() => setToast(""), 2800);
    };

    const loadData = async () => {
        if (!canApprove) return;
        setLoading(true);
        setError("");
        try {
            const [listResult, countResult] = await Promise.all([
                getBusinessTripsForApproval({
                    endDate: filters.endDate,
                    page,
                    pageSize: PAGE_SIZE,
                    projectId,
                    requester,
                    search: query,
                    sortMode,
                    startDate: filters.startDate,
                    statusFilter,
                }),
                getBusinessTripApprovalCounts({
                    endDate: filters.endDate,
                    projectId,
                    requester,
                    search: query,
                    startDate: filters.startDate,
                }),
            ]);
            setItems(listResult.items);
            setProjects(listResult.projects);
            setTotalCount(listResult.total);
            setCounts(countResult);
        } catch (loadError) {
            console.error("[BusinessTripApproval] load failed", loadError);
            setItems([]);
            setTotalCount(0);
            setError("Gagal memuat daftar approval.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timeoutId = window.setTimeout(loadData, query.trim() ? 350 : 0);
        return () => window.clearTimeout(timeoutId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        canApprove,
        filters.endDate,
        filters.startDate,
        page,
        projectId,
        query,
        requester,
        sortMode,
        statusFilter,
    ]);

    const openDetail = async (tripId) => {
        setDetailLoading(true);
        try {
            const result = await getBusinessTripApprovalDetail(tripId);
            setProjects(result.projects);
            setSelectedTrip(result.trip);
        } catch (detailError) {
            console.error("[BusinessTripApproval] detail failed", detailError);
            showToast("Gagal memuat ringkasan pengajuan.");
        } finally {
            setDetailLoading(false);
        }
    };

    const resetFilters = () => {
        const nextDates = getDefaultDates();
        setDraftFilters(nextDates);
        setFilters(nextDates);
        setProjectId("");
        setRequester("");
        setQuery("");
        setStatusFilter(APPROVAL_STATUS_FILTERS.PENDING);
        setSortMode("oldest");
        setPage(1);
    };

    const approveSelectedTrip = async () => {
        if (!selectedTrip || actionLoading) return;
        setActionLoading("approve");
        try {
            await approveBusinessTrip({
                tripId: selectedTrip.id,
            });
            setSelectedTrip(null);
            showToast("Pengajuan Business Trip disetujui.");
            await loadData();
        } catch (approveError) {
            console.error("[BusinessTripApproval] approve failed", approveError);
            showToast(
                getActionErrorMessage(
                    approveError,
                    "Gagal menyetujui pengajuan. Silakan coba kembali.",
                ),
            );
            openDetail(selectedTrip.id);
        } finally {
            setActionLoading("");
        }
    };

    const rejectSelectedTrip = async () => {
        setRejectTouched(true);
        if (!selectedTrip || rejectReason.trim().length < 10 || actionLoading) return;
        setActionLoading("reject");
        try {
            await rejectBusinessTrip({
                rejectionReason: rejectReason.trim(),
                tripId: selectedTrip.id,
            });
            setSelectedTrip(null);
            setRejectOpen(false);
            setRejectReason("");
            setRejectTouched(false);
            showToast("Pengajuan Business Trip ditolak.");
            await loadData();
        } catch (rejectErrorResult) {
            console.error("[BusinessTripApproval] reject failed", rejectErrorResult);
            showToast(
                getActionErrorMessage(
                    rejectErrorResult,
                    "Gagal menolak pengajuan. Silakan coba kembali.",
                ),
            );
            openDetail(selectedTrip.id);
        } finally {
            setActionLoading("");
        }
    };

    if (!canApprove) {
        return (
            <BusinessTripLayout title="Approval Business Trip" activeIcon={ShieldCheck}>
                <EmptyState icon={ShieldCheck} title="Akses tidak tersedia">
                    Menu approval hanya tersedia untuk Admin dan Management.
                </EmptyState>
            </BusinessTripLayout>
        );
    }

    return (
        <BusinessTripLayout
            title="Approval Business Trip"
            activeIcon={ShieldCheck}
            showBack={false}
        >
            <div className="space-y-3">
                <ApprovalSummary
                    activeStatus={statusFilter}
                    counts={counts}
                    onChange={(value) => {
                        setStatusFilter(value);
                        setPage(1);
                    }}
                />

                <SearchBar
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

                <ApprovalFilters
                    draftFilters={draftFilters}
                    filters={filters}
                    filterOpen={filterOpen}
                    onApply={() => {
                        setFilters(draftFilters);
                        setFilterOpen(false);
                        setPage(1);
                    }}
                    onReset={resetFilters}
                    onToggle={() => setFilterOpen((current) => !current)}
                    projectId={projectId}
                    projects={projects}
                    requester={requester}
                    setDraftFilters={setDraftFilters}
                    setProjectId={(value) => {
                        setProjectId(value);
                        setPage(1);
                    }}
                    setRequester={(value) => {
                        setRequester(value);
                        setPage(1);
                    }}
                />

                <ResultToolbar
                    count={totalCount}
                    page={page}
                    sortMode={sortMode}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    onSortChange={(value) => {
                        setSortMode(value);
                        setPage(1);
                    }}
                />

                {error ? (
                    <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
                        <p className="text-sm font-bold text-red-700">{error}</p>
                        <Button
                            tone="secondary"
                            icon={RotateCcw}
                            onClick={loadData}
                            className="mt-3"
                        >
                            Coba Lagi
                        </Button>
                    </section>
                ) : loading ? (
                    <ApprovalSkeleton />
                ) : items.length === 0 ? (
                    <EmptyState icon={ClipboardList} title="Tidak ada pengajuan">
                        Tidak ada Business Trip yang sesuai filter approval saat ini.
                    </EmptyState>
                ) : (
                    <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                        {items.map((trip) => (
                            <ApprovalCard
                                key={trip.id}
                                project={projects.find(
                                    (project) => project.id === trip.projectId,
                                )}
                                trip={trip}
                                onOpen={() => openDetail(trip.id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {(selectedTrip || detailLoading) && (
                <ApprovalDetailSheet
                    actionLoading={actionLoading}
                    detailLoading={detailLoading}
                    onApprove={approveSelectedTrip}
                    onClose={() => setSelectedTrip(null)}
                    onReject={() => setRejectOpen(true)}
                    project={selectedProject}
                    trip={selectedTrip}
                />
            )}

            {rejectOpen && (
                <RejectModal
                    error={rejectError}
                    loading={actionLoading === "reject"}
                    onCancel={() => {
                        setRejectOpen(false);
                        setRejectReason("");
                        setRejectTouched(false);
                    }}
                    onChange={setRejectReason}
                    onSubmit={rejectSelectedTrip}
                    reason={rejectReason}
                    setTouched={setRejectTouched}
                />
            )}

            {toast && (
                <div className="fixed inset-x-4 top-5 z-100 mx-auto max-w-md rounded-xl bg-slate-950 px-4 py-2.5 text-center text-[13px] font-semibold text-white shadow-xl md:top-6">
                    {toast}
                </div>
            )}
        </BusinessTripLayout>
    );
}

function ApprovalSummary({ activeStatus, counts, onChange }) {
    return (
        <div className="max-w-full overflow-x-auto pb-2">
            <div className="flex w-max min-w-full gap-2 xl:w-full">
                {statusFilters.map((item) => (
                    <button
                        key={item.value}
                        type="button"
                        data-active={activeStatus === item.value}
                        onClick={() => onChange(item.value)}
                        className={`min-w-[132px] shrink-0 rounded-xl border px-3 py-2 text-left shadow-sm transition focus:outline-none focus:ring-4 focus:ring-sky-100 xl:min-w-0 xl:flex-1 ${item.className}`}
                    >
                        <span className="block truncate text-[11px] font-semibold">
                            {item.label}
                        </span>
                        <span className="mt-1 block text-lg font-bold leading-none">
                            {getStatusCount(counts, item.value)}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}

function SearchBar({ onChange, onClear, query }) {
    return (
        <label className="relative block">
            <span className="sr-only">Cari approval Business Trip</span>
            <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
                value={query}
                onChange={(event) => onChange(event.target.value)}
                placeholder="Cari nomor, judul, pemohon, atau project"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-10 text-[13px] text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            />
            {query && (
                <button
                    type="button"
                    onClick={onClear}
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    aria-label="Hapus pencarian"
                >
                    <X size={15} />
                </button>
            )}
        </label>
    );
}

function ApprovalFilters({
    draftFilters,
    filterOpen,
    filters,
    onApply,
    onReset,
    onToggle,
    projectId,
    projects,
    requester,
    setDraftFilters,
    setProjectId,
    setRequester,
}) {
    return (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <button
                type="button"
                onClick={onToggle}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
            >
                <span className="inline-flex items-center gap-2 text-[13px] font-bold text-slate-800">
                    <CalendarDays size={16} className="text-sky-500" />
                    {formatDate(filters.startDate)} - {formatDate(filters.endDate)}
                </span>
                <ChevronDown
                    size={17}
                    className={`text-slate-400 transition ${
                        filterOpen ? "rotate-180" : ""
                    }`}
                />
            </button>

            {filterOpen && (
                <div className="space-y-3 border-t border-slate-100 p-3">
                    <div className="grid grid-cols-2 gap-2 max-[360px]:grid-cols-1">
                        <label>
                            <span className="text-[11px] font-semibold text-slate-500">
                                Dari
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
                                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                            />
                        </label>
                        <label>
                            <span className="text-[11px] font-semibold text-slate-500">
                                Sampai
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
                                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                            />
                        </label>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        <label>
                            <span className="text-[11px] font-semibold text-slate-500">
                                Project
                            </span>
                            <select
                                value={projectId}
                                onChange={(event) => setProjectId(event.target.value)}
                                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                            >
                                <option value="">Semua project</option>
                                {projects.map((project) => (
                                    <option key={project.id} value={project.id}>
                                        {project.project_name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            <span className="text-[11px] font-semibold text-slate-500">
                                Pemohon
                            </span>
                            <input
                                value={requester}
                                onChange={(event) => setRequester(event.target.value)}
                                placeholder="Nama pemohon"
                                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-[13px] outline-none placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                            />
                        </label>
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

function ResultToolbar({
    count,
    onPageChange,
    onSortChange,
    page,
    sortMode,
    totalPages,
}) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-slate-700">
                {count} pengajuan
            </p>
            <div className="flex items-center gap-2">
                <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
                    <button
                        type="button"
                        onClick={() => onPageChange((current) => Math.max(1, current - 1))}
                        disabled={page <= 1}
                        className="h-8 rounded-md px-2 text-[12px] font-bold text-slate-600 disabled:text-slate-300"
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
                        className="h-8 rounded-md px-2 text-[12px] font-bold text-slate-600 disabled:text-slate-300"
                    >
                        Next
                    </button>
                </div>
                <select
                    value={sortMode}
                    onChange={(event) => onSortChange(event.target.value)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-700 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                >
                    {sortOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}

function ApprovalCard({ onOpen, project, trip }) {
    return (
        <article className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold tracking-wide text-sky-600">
                        {trip.businessTripNo}
                    </p>
                    <h3 className="mt-1 line-clamp-2 text-[15px] font-bold leading-5 text-slate-950">
                        {trip.title || "Pengajuan tanpa judul"}
                    </h3>
                    <p className="mt-1 truncate text-xs text-slate-500">
                        {getProjectLabel(project, trip)}
                    </p>
                </div>
                <StatusBadge status={trip.status} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 border-y border-slate-100 py-3">
                <Meta label="Pemohon" value={trip.requesterName} />
                <Meta label="Tanggal Trip" value={getTripDateLabel(trip)} />
                <Meta label="Diajukan" value={formatDate(trip.submittedAt || trip.createdAt)} />
                <Meta label="Agenda" value={`${trip.agendas.length} agenda`} />
                <Meta
                    label="Requested Amount"
                    value={
                        trip.accommodationRequest.requestedAmount > 0
                            ? formatAccommodationAmount(
                                  trip.accommodationRequest.requestedAmount,
                              )
                            : "Tidak ada"
                    }
                />
                <Meta label="Inisiator" value={trip.initiatorName} />
            </div>

            <Button icon={Eye} onClick={onOpen} className="mt-3 w-full">
                Review
            </Button>
        </article>
    );
}

function Meta({ label, value }) {
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

function ApprovalDetailSheet({
    actionLoading,
    detailLoading,
    onApprove,
    onClose,
    onReject,
    project,
    trip,
}) {
    const actionVisible =
        trip?.dbStatus === "submitted" || trip?.dbStatus === "pending_approval";

    return (
        <div className="fixed inset-0 z-90 flex items-end bg-slate-950/40 p-3 md:items-center md:justify-center">
            <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white p-4">
                    <div>
                        <p className="text-[11px] font-bold tracking-wide text-sky-600">
                            {trip?.businessTripNo || "Memuat"}
                        </p>
                        <h3 className="mt-1 text-base font-bold text-slate-950">
                            Ringkasan Approval
                        </h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
                        aria-label="Tutup"
                    >
                        <X size={17} />
                    </button>
                </div>

                {detailLoading || !trip ? (
                    <div className="space-y-3 p-4">
                        <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
                        <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
                    </div>
                ) : (
                    <div className="space-y-4 p-4">
                        <SectionCard
                            icon={ShieldCheck}
                            title="Informasi Utama"
                            trailing={<StatusBadge status={trip.status} />}
                        >
                            <div className="grid gap-2 sm:grid-cols-2">
                                <DetailRow label="Business Trip No" value={trip.businessTripNo} />
                                <DetailRow label="Pemohon" value={trip.requesterName} />
                                <DetailRow
                                    label="Tanggal Pengajuan"
                                    value={formatDateTime(trip.submittedAt || trip.createdAt)}
                                />
                                <DetailRow label="Tanggal Trip" value={getTripDateLabel(trip)} />
                                <DetailRow label="Judul" value={trip.title} />
                                <DetailRow
                                    label="Project"
                                    value={getProjectLabel(project, trip)}
                                />
                                <DetailRow label="Inisiator" value={trip.initiatorName} />
                                <DetailRow label="Status" value={trip.status} />
                            </div>
                        </SectionCard>

                        <SectionCard icon={ClipboardList} title="Agenda">
                            {trip.agendas.length === 0 ? (
                                <EmptyState icon={ClipboardList} title="Belum ada agenda" />
                            ) : (
                                <div className="space-y-2">
                                    {trip.agendas.map((agenda, index) => (
                                        <article
                                            key={agenda.id}
                                            className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                                        >
                                            <p className="text-[11px] font-bold uppercase text-slate-400">
                                                Agenda {index + 1}
                                            </p>
                                            <p className="mt-1 text-[13px] font-bold text-slate-900">
                                                {getAgendaTitle(agenda) || "-"}
                                            </p>
                                            <p className="mt-1 text-xs leading-5 text-slate-600">
                                                {getAgendaObjective(agenda) || "-"}
                                            </p>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </SectionCard>

                        <SectionCard icon={FolderKanban} title="Pengajuan Akomodasi">
                            <p className="rounded-lg bg-slate-50 px-3 py-3 text-[13px] font-semibold text-slate-700">
                                {trip.accommodationRequest.requestedAmount > 0
                                    ? formatAccommodationAmount(
                                          trip.accommodationRequest.requestedAmount,
                                      )
                                    : "Tidak mengajukan dana akomodasi"}
                            </p>
                        </SectionCard>

                        <SectionCard icon={UserRound} title="Approval History">
                            <ApprovalHistory trip={trip} />
                        </SectionCard>
                    </div>
                )}

                {trip && (
                    <ActionFooter>
                        <Button
                            tone="danger"
                            icon={XCircle}
                            onClick={onReject}
                            disabled={!actionVisible || Boolean(actionLoading)}
                        >
                            Tolak
                        </Button>
                        <Button
                            tone="success"
                            icon={CheckCircle2}
                            onClick={onApprove}
                            disabled={!actionVisible || Boolean(actionLoading)}
                        >
                            {actionLoading === "approve" ? "Memproses..." : "Setujui"}
                        </Button>
                    </ActionFooter>
                )}
            </section>
        </div>
    );
}

function ApprovalHistory({ trip }) {
    if (!trip.statusHistory?.length) {
        return (
            <p className="rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500">
                Belum ada history approval.
            </p>
        );
    }

    return (
        <div className="space-y-2">
            {trip.statusHistory.map((item) => (
                <div
                    key={item.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                    <div className="flex items-start justify-between gap-3">
                        <p className="text-[13px] font-bold text-slate-800">
                            {item.action}
                        </p>
                        <p className="shrink-0 text-[11px] font-semibold text-slate-400">
                            {formatDateTime(item.actedAt)}
                        </p>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                        {item.fromStatus || "-"} ke {item.toStatus || "-"} oleh{" "}
                        {item.actedByName || "-"}
                    </p>
                    {item.notes && (
                        <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                            {item.notes}
                        </p>
                    )}
                </div>
            ))}
        </div>
    );
}

function RejectModal({
    error,
    loading,
    onCancel,
    onChange,
    onSubmit,
    reason,
    setTouched,
}) {
    return (
        <div className="fixed inset-0 z-100 flex items-end bg-slate-950/40 p-4 md:items-center md:justify-center">
            <section className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
                <h3 className="text-base font-bold text-slate-950">
                    Tolak Pengajuan
                </h3>
                <label className="mt-4 block">
                    <span className="text-[13px] font-semibold text-slate-700">
                        Alasan Penolakan
                    </span>
                    <textarea
                        value={reason}
                        onBlur={() => setTouched(true)}
                        onChange={(event) => onChange(event.target.value)}
                        maxLength={1000}
                        placeholder="Jelaskan alasan pengajuan ditolak dan bagian yang perlu diperbaiki."
                        className={`mt-1.5 min-h-32 w-full resize-y rounded-xl border px-3 py-2 text-[13px] leading-5 outline-none placeholder:text-slate-400 focus:ring-4 ${
                            error
                                ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                                : "border-slate-200 focus:border-sky-400 focus:ring-sky-100"
                        }`}
                    />
                </label>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-400">{reason.length}/1000</span>
                    {error && <span className="font-semibold text-red-600">{error}</span>}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                    <Button tone="secondary" onClick={onCancel} disabled={loading}>
                        Batal
                    </Button>
                    <Button tone="danger" icon={XCircle} onClick={onSubmit} disabled={loading}>
                        {loading ? "Memproses..." : "Tolak Pengajuan"}
                    </Button>
                </div>
            </section>
        </div>
    );
}

function ApprovalSkeleton() {
    return (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {[1, 2, 3].map((item) => (
                <div
                    key={item}
                    className="animate-pulse rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm"
                >
                    <div className="h-3 w-28 rounded bg-slate-200" />
                    <div className="mt-3 h-4 w-3/4 rounded bg-slate-200" />
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
