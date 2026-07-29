import { useEffect, useMemo, useState } from "react";
import {
    AlertCircle,
    CheckCircle2,
    ClipboardCheck,
    Eye,
    FileText,
    RotateCcw,
    Search,
    WalletCards,
    X,
} from "lucide-react";
import { useAuth } from "../../context/useAuth";
import {
    BUSINESS_TRIP_PAYMENT_METHODS,
    getBusinessTripRealizationVerificationCounts,
    getBusinessTripRealizationVerificationDetail,
    getBusinessTripsForRealizationVerification,
    payBusinessTripRealizationShortfall,
    REALIZATION_VERIFICATION_STATUS_FILTERS,
    recordBusinessTripAdvanceRefund,
    requestBusinessTripRealizationRevision,
    verifyBusinessTripRealization,
} from "../../services/businessTripService";
import BusinessTripLayout from "./BusinessTripLayout";
import {
    ActionFooter,
    Button,
    DetailRow,
    EmptyState,
    PhotoPreviewGrid,
    SectionCard,
    StatusBadge,
} from "./BusinessTripShared";
import {
    formatAccommodationAmount,
} from "./businessTripAccommodationModel";
import { getAgendaObjective, getAgendaTitle } from "./businessTripAgendaModel";
import { BUSINESS_TRIP_STATUS } from "./businessTripConstants";
import { businessTripUi } from "./businessTripUi";

const PAGE_SIZE = 20;

const statusFilters = [
    {
        value: REALIZATION_VERIFICATION_STATUS_FILTERS.PENDING,
        label: "Verifikasi",
    },
    {
        value: REALIZATION_VERIFICATION_STATUS_FILTERS.REVISION,
        label: "Revisi",
    },
    {
        value: REALIZATION_VERIFICATION_STATUS_FILTERS.PENDING_REFUND,
        label: "Refund",
    },
    {
        value: REALIZATION_VERIFICATION_STATUS_FILTERS.PENDING_ADDITIONAL_PAYMENT,
        label: "Bayar",
    },
    {
        value: REALIZATION_VERIFICATION_STATUS_FILTERS.COMPLETED,
        label: "Selesai",
    },
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

const getTripDateLabel = (trip) =>
    trip.dateMode === "range"
        ? `${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}`
        : formatDate(trip.tripDate);

const getProjectLabel = (project, trip) =>
    trip.projectLabel ||
    [project?.project_name, project?.customer_name].filter(Boolean).join(" - ") ||
    "Belum dipilih";

const getDisbursedAmount = (trip) =>
    Number(trip.disbursedAmount ?? trip.advanceDisbursement?.amount ?? 0);

const getSettlementLabel = (difference) => {
    if (difference > 0) return "Sisa yang harus dikembalikan";
    if (difference < 0) return "Kekurangan yang harus dibayarkan";
    return "Tidak ada selisih settlement";
};

export default function BusinessTripRealizationVerificationPage() {
    const { role } = useAuth();
    const canVerify = ["admin", "management"].includes(role);
    const [filters, setFilters] = useState(getDefaultDates);
    const [query, setQuery] = useState("");
    const [requester, setRequester] = useState("");
    const [projectId, setProjectId] = useState("");
    const [statusFilter, setStatusFilter] = useState(
        REALIZATION_VERIFICATION_STATUS_FILTERS.PENDING,
    );
    const [sortMode, setSortMode] = useState("oldest");
    const [page, setPage] = useState(1);
    const [items, setItems] = useState([]);
    const [projects, setProjects] = useState([]);
    const [counts, setCounts] = useState({});
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [selectedTrip, setSelectedTrip] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [revisionOpen, setRevisionOpen] = useState(false);
    const [revisionNote, setRevisionNote] = useState("");
    const [settlementOpen, setSettlementOpen] = useState(false);
    const [settlementForm, setSettlementForm] = useState({
        accountLabel: "",
        notes: "",
        paymentMethod: "transfer",
        referenceNumber: "",
        transactionDate: toDateInput(new Date()),
    });
    const [actionLoading, setActionLoading] = useState("");
    const [toast, setToast] = useState("");
    const [error, setError] = useState("");

    const selectedProject = useMemo(
        () => projects.find((project) => project.id === selectedTrip?.projectId),
        [projects, selectedTrip?.projectId],
    );

    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    const settlementAmount = Math.abs(Number(selectedTrip?.settlementDifference ?? 0));
    const settlementType =
        selectedTrip?.status === BUSINESS_TRIP_STATUS.PENDING_REFUND
            ? "refund"
            : "additional_payment";

    const showToast = (message) => {
        setToast(message);
        window.setTimeout(() => setToast(""), 2800);
    };

    const loadData = async () => {
        if (!canVerify) return;
        setLoading(true);
        setError("");
        try {
            const [listResult, countResult] = await Promise.all([
                getBusinessTripsForRealizationVerification({
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
                getBusinessTripRealizationVerificationCounts({
                    endDate: filters.endDate,
                    startDate: filters.startDate,
                }),
            ]);
            setItems(listResult.items);
            setProjects(listResult.projects);
            setTotalCount(listResult.total);
            setCounts(countResult);
        } catch (loadError) {
            console.error("[BusinessTripRealizationVerification] load failed", loadError);
            setItems([]);
            setError("Gagal memuat laporan realisasi.");
            setTotalCount(0);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timeoutId = window.setTimeout(loadData, query.trim() ? 350 : 0);
        return () => window.clearTimeout(timeoutId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        canVerify,
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
            const result = await getBusinessTripRealizationVerificationDetail(tripId);
            setProjects(result.projects);
            setSelectedTrip(result.trip);
        } catch (detailError) {
            console.error("[BusinessTripRealizationVerification] detail failed", detailError);
            showToast("Gagal memuat detail laporan realisasi.");
        } finally {
            setDetailLoading(false);
        }
    };

    const refreshSelectedTrip = async (tripId) => {
        const result = await getBusinessTripRealizationVerificationDetail(tripId);
        setSelectedTrip(result.trip);
        return result.trip;
    };

    const submitRevision = async () => {
        if (!selectedTrip || revisionNote.trim().length < 10) return;
        setActionLoading("revision");
        try {
            await requestBusinessTripRealizationRevision({
                revisionNote,
                tripId: selectedTrip.id,
            });
            setRevisionOpen(false);
            setRevisionNote("");
            setSelectedTrip(null);
            showToast("Laporan dikembalikan untuk revisi.");
            loadData();
        } catch (revisionError) {
            console.error("[BusinessTripRealizationVerification] revision failed", revisionError);
            showToast(
                revisionError.message ||
                    "Gagal mengembalikan laporan untuk revisi.",
            );
            if (selectedTrip?.id) refreshSelectedTrip(selectedTrip.id).catch(() => {});
        } finally {
            setActionLoading("");
        }
    };

    const verifyRealization = async () => {
        if (!selectedTrip) return;
        setActionLoading("verify");
        try {
            await verifyBusinessTripRealization(selectedTrip.id);
            setSelectedTrip(null);
            showToast("Laporan realisasi berhasil diverifikasi.");
            loadData();
        } catch (verifyError) {
            console.error("[BusinessTripRealizationVerification] verify failed", verifyError);
            showToast(
                verifyError.message || "Gagal memverifikasi laporan realisasi.",
            );
            if (selectedTrip?.id) refreshSelectedTrip(selectedTrip.id).catch(() => {});
        } finally {
            setActionLoading("");
        }
    };

    const submitSettlement = async () => {
        if (!selectedTrip || settlementAmount <= 0) return;
        setActionLoading("settlement");
        const payload = {
            ...settlementForm,
            amount: settlementAmount,
            tripId: selectedTrip.id,
        };
        try {
            const trip =
                settlementType === "refund"
                    ? await recordBusinessTripAdvanceRefund(payload)
                    : await payBusinessTripRealizationShortfall(payload);
            setSelectedTrip(trip);
            setSettlementOpen(false);
            showToast(
                settlementType === "refund"
                    ? "Pengembalian sisa uang muka dicatat."
                    : "Pembayaran kekurangan dicatat.",
            );
            loadData();
        } catch (settlementError) {
            console.error("[BusinessTripRealizationVerification] settlement failed", settlementError);
            showToast(
                settlementError.message ||
                    (settlementType === "refund"
                        ? "Gagal mencatat pengembalian."
                        : "Gagal membayar kekurangan."),
            );
            if (selectedTrip?.id) refreshSelectedTrip(selectedTrip.id).catch(() => {});
        } finally {
            setActionLoading("");
        }
    };

    if (!canVerify) {
        return (
            <BusinessTripLayout
                title="Verifikasi Realisasi Trip"
                activeIcon={ClipboardCheck}
            >
                <EmptyState icon={AlertCircle} title="Akses tidak tersedia">
                    Halaman ini hanya untuk Admin dan Management.
                </EmptyState>
            </BusinessTripLayout>
        );
    }

    return (
        <BusinessTripLayout
            title="Verifikasi Realisasi Trip"
            activeIcon={ClipboardCheck}
        >
            <div className={businessTripUi.pageGap}>
                <VerificationFilters
                    counts={counts}
                    filters={filters}
                    projectId={projectId}
                    projects={projects}
                    query={query}
                    requester={requester}
                    sortMode={sortMode}
                    statusFilter={statusFilter}
                    onFiltersChange={setFilters}
                    onProjectChange={(value) => {
                        setProjectId(value);
                        setPage(1);
                    }}
                    onQueryChange={(value) => {
                        setQuery(value);
                        setPage(1);
                    }}
                    onRequesterChange={(value) => {
                        setRequester(value);
                        setPage(1);
                    }}
                    onSortChange={(value) => {
                        setSortMode(value);
                        setPage(1);
                    }}
                    onStatusChange={(value) => {
                        setStatusFilter(value);
                        setPage(1);
                    }}
                />

                <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] font-semibold text-slate-700">
                        {totalCount} laporan
                    </p>
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                        <button
                            type="button"
                            disabled={page <= 1}
                            onClick={() => setPage((current) => Math.max(1, current - 1))}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 disabled:text-slate-300"
                        >
                            Prev
                        </button>
                        <span>{page}/{totalPages}</span>
                        <button
                            type="button"
                            disabled={page >= totalPages}
                            onClick={() =>
                                setPage((current) => Math.min(totalPages, current + 1))
                            }
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 disabled:text-slate-300"
                        >
                            Next
                        </button>
                    </div>
                </div>

                {error ? (
                    <EmptyState icon={AlertCircle} title="Gagal memuat data">
                        {error}
                    </EmptyState>
                ) : loading ? (
                    <VerificationSkeleton />
                ) : items.length === 0 ? (
                    <EmptyState icon={ClipboardCheck} title="Tidak ada laporan">
                        Tidak ada laporan realisasi sesuai filter.
                    </EmptyState>
                ) : (
                    <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                        {items.map((trip) => (
                            <VerificationCard
                                key={trip.id}
                                trip={trip}
                                project={projects.find(
                                    (project) => project.id === trip.projectId,
                                )}
                                onOpen={() => openDetail(trip.id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {selectedTrip && (
                <VerificationDetailSheet
                    actionLoading={actionLoading}
                    detailLoading={detailLoading}
                    project={selectedProject}
                    trip={selectedTrip}
                    onClose={() => setSelectedTrip(null)}
                    onOpenRevision={() => setRevisionOpen(true)}
                    onOpenSettlement={() => setSettlementOpen(true)}
                    onVerify={verifyRealization}
                />
            )}

            {revisionOpen && (
                <Modal title="Kembalikan Laporan untuk Revisi">
                    <label className="block">
                        <span className="text-sm font-semibold text-slate-700">
                            Catatan Revisi
                        </span>
                        <textarea
                            value={revisionNote}
                            onChange={(event) => setRevisionNote(event.target.value)}
                            maxLength={1000}
                            placeholder="Jelaskan data atau bukti yang perlu diperbaiki."
                            className={businessTripUi.textarea}
                        />
                        {revisionNote.trim().length > 0 &&
                            revisionNote.trim().length < 10 && (
                                <p className="mt-2 text-xs font-semibold text-red-600">
                                    Minimal 10 karakter.
                                </p>
                            )}
                    </label>
                    <div className="mt-5 grid grid-cols-2 gap-3">
                        <Button
                            tone="secondary"
                            onClick={() => setRevisionOpen(false)}
                            disabled={Boolean(actionLoading)}
                        >
                            Batal
                        </Button>
                        <Button
                            tone="danger"
                            icon={RotateCcw}
                            onClick={submitRevision}
                            disabled={
                                actionLoading === "revision" ||
                                revisionNote.trim().length < 10
                            }
                        >
                            {actionLoading === "revision" ? "Memproses..." : "Revisi"}
                        </Button>
                    </div>
                </Modal>
            )}

            {settlementOpen && selectedTrip && (
                <Modal
                    title={
                        settlementType === "refund"
                            ? "Catat Pengembalian"
                            : "Bayar Kekurangan"
                    }
                >
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <DetailRow
                            label="Nominal"
                            value={formatAccommodationAmount(settlementAmount)}
                        />
                    </div>
                    <SettlementForm
                        form={settlementForm}
                        onChange={setSettlementForm}
                    />
                    <div className="mt-5 grid grid-cols-2 gap-3">
                        <Button
                            tone="secondary"
                            onClick={() => setSettlementOpen(false)}
                            disabled={Boolean(actionLoading)}
                        >
                            Batal
                        </Button>
                        <Button
                            icon={WalletCards}
                            onClick={submitSettlement}
                            disabled={actionLoading === "settlement"}
                        >
                            {actionLoading === "settlement" ? "Memproses..." : "Simpan"}
                        </Button>
                    </div>
                </Modal>
            )}

            {toast && (
                <div className="fixed inset-x-4 top-5 z-80 mx-auto max-w-md rounded-xl bg-slate-950 px-4 py-3 text-center text-sm font-semibold text-white shadow-xl md:top-6">
                    {toast}
                </div>
            )}
        </BusinessTripLayout>
    );
}

function VerificationFilters({
    counts,
    filters,
    onFiltersChange,
    onProjectChange,
    onQueryChange,
    onRequesterChange,
    onSortChange,
    onStatusChange,
    projectId,
    projects,
    query,
    requester,
    sortMode,
    statusFilter,
}) {
    return (
        <div className="space-y-3">
            <div className="max-w-full overflow-x-auto pb-2">
                <div className="flex w-max min-w-full gap-2 xl:w-full">
                    {statusFilters.map((item) => (
                        <button
                            key={item.value}
                            type="button"
                            data-active={statusFilter === item.value}
                            onClick={() => onStatusChange(item.value)}
                            className="min-w-[118px] shrink-0 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-left text-sky-800 shadow-sm transition data-[active=true]:border-sky-400 data-[active=true]:bg-sky-100 xl:min-w-0 xl:flex-1"
                        >
                            <span className="block text-[11px] font-semibold">
                                {item.label}
                            </span>
                            <span className="mt-1 block text-lg font-bold leading-none">
                                {counts[item.value] ?? 0}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            <label className="relative block">
                <span className="sr-only">Cari laporan realisasi</span>
                <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                    value={query}
                    onChange={(event) => onQueryChange(event.target.value)}
                    placeholder="Cari nomor, judul, pemohon, atau project"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-10 text-[13px] text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                />
            </label>

            <section className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-5">
                <input
                    type="date"
                    value={filters.startDate}
                    onChange={(event) =>
                        onFiltersChange((current) => ({
                            ...current,
                            startDate: event.target.value,
                        }))
                    }
                    className={businessTripUi.input}
                />
                <input
                    type="date"
                    value={filters.endDate}
                    onChange={(event) =>
                        onFiltersChange((current) => ({
                            ...current,
                            endDate: event.target.value,
                        }))
                    }
                    className={businessTripUi.input}
                />
                <select
                    value={projectId}
                    onChange={(event) => onProjectChange(event.target.value)}
                    className={businessTripUi.input}
                >
                    <option value="">Semua Project</option>
                    {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                            {project.project_name}
                        </option>
                    ))}
                </select>
                <input
                    value={requester}
                    onChange={(event) => onRequesterChange(event.target.value)}
                    placeholder="Pemohon"
                    className={businessTripUi.input}
                />
                <select
                    value={sortMode}
                    onChange={(event) => onSortChange(event.target.value)}
                    className={businessTripUi.input}
                >
                    <option value="oldest">Terlama</option>
                    <option value="newest">Terbaru</option>
                </select>
            </section>
        </div>
    );
}

function VerificationCard({ onOpen, project, trip }) {
    const formatSignedAmount = (value) => {
        const amount = Number(value ?? 0);
        if (!Number.isFinite(amount) || amount === 0) return "Rp 0";
        const prefix = amount < 0 ? "-" : "";
        return `${prefix}${formatAccommodationAmount(Math.abs(amount))}`;
    };

    return (
        <article className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[11px] font-bold text-sky-600">
                        {trip.businessTripNo}
                    </p>
                    <h3 className="mt-1 line-clamp-2 text-[15px] font-bold text-slate-950">
                        {trip.title}
                    </h3>
                    <p className="mt-1 truncate text-xs text-slate-500">
                        {getProjectLabel(project, trip)}
                    </p>
                </div>
                <StatusBadge status={trip.status} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-y border-slate-100 py-3">
                <DetailRow label="Pemohon" value={trip.requesterName} />
                <DetailRow label="Tanggal Trip" value={getTripDateLabel(trip)} />
                <DetailRow
                    label="Requested"
                    value={formatAccommodationAmount(
                        trip.accommodationRequest?.requestedAmount ?? 0,
                    )}
                />
                <DetailRow
                    label="Disbursed"
                    value={formatAccommodationAmount(getDisbursedAmount(trip))}
                />
                <DetailRow
                    label="Total Realisasi"
                    value={formatAccommodationAmount(trip.totalRealizationAmount)}
                />
                <DetailRow
                    label="Selisih"
                    value={formatSignedAmount(trip.settlementDifference)}
                />
            </div>
            <Button icon={Eye} onClick={onOpen} className="mt-3 w-full">
                Detail
            </Button>
        </article>
    );
}

function VerificationDetailSheet({
    actionLoading,
    detailLoading,
    onClose,
    onOpenRevision,
    onOpenSettlement,
    onVerify,
    project,
    trip,
}) {
    const canVerify = trip.status === BUSINESS_TRIP_STATUS.REALIZATION_SUBMITTED;
    const canSettle = [
        BUSINESS_TRIP_STATUS.PENDING_REFUND,
        BUSINESS_TRIP_STATUS.PENDING_ADDITIONAL_PAYMENT,
    ].includes(trip.status);

    return (
        <div className="fixed inset-0 z-70 flex items-end bg-slate-950/45 md:items-center md:justify-center">
            <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-slate-50 p-4 shadow-2xl md:max-w-4xl md:rounded-2xl">
                <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                        <p className="text-[11px] font-bold uppercase text-sky-600">
                            Verifikasi Realisasi
                        </p>
                        <h2 className="mt-1 text-base font-bold text-slate-950">
                            {trip.businessTripNo}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-2 text-slate-500 hover:bg-white"
                        aria-label="Tutup detail"
                    >
                        <X size={18} />
                    </button>
                </div>

                {detailLoading ? (
                    <VerificationSkeleton />
                ) : (
                    <div className="space-y-3">
                        <SectionCard
                            title="Informasi Business Trip"
                            trailing={<StatusBadge status={trip.status} />}
                        >
                            <div className="grid gap-3 sm:grid-cols-2">
                                <DetailRow label="Pemohon" value={trip.requesterName} />
                                <DetailRow
                                    label="Project"
                                    value={getProjectLabel(project, trip)}
                                />
                                <DetailRow label="Judul" value={trip.title} />
                                <DetailRow
                                    label="Tanggal"
                                    value={getTripDateLabel(trip)}
                                />
                                <DetailRow
                                    label="Inisiator"
                                    value={trip.initiatorName}
                                />
                                <DetailRow
                                    label="Submit Realisasi"
                                    value={formatDate(trip.realizationSubmittedAt)}
                                />
                            </div>
                        </SectionCard>

                        <SectionCard icon={FileText} title="Realisasi per Agenda">
                            <div className="space-y-3">
                                {trip.agendas.map((agenda, index) => (
                                    <article
                                        key={agenda.id}
                                        className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                                    >
                                        <p className="text-xs font-semibold uppercase text-slate-500">
                                            Agenda {index + 1}
                                        </p>
                                        <h3 className="mt-1 text-sm font-bold text-slate-950">
                                            {getAgendaTitle(agenda)}
                                        </h3>
                                        <p className="mt-1 text-sm leading-6 text-slate-600">
                                            {getAgendaObjective(agenda) || "-"}
                                        </p>
                                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                            <DetailRow
                                                label="Hasil"
                                                value={
                                                    agenda.realization?.result || "-"
                                                }
                                            />
                                            <DetailRow
                                                label="Realisasi Biaya"
                                                value={formatAccommodationAmount(
                                                    agenda.realization
                                                        ?.realizedAmount ?? 0,
                                                )}
                                            />
                                            <DetailRow
                                                label="Jumlah Foto"
                                                value={`${
                                                    agenda.realization?.photos
                                                        ?.length ?? 0
                                                } foto`}
                                            />
                                        </div>
                                        <PhotoPreviewGrid
                                            photos={agenda.realization?.photos ?? []}
                                            readOnly
                                        />
                                    </article>
                                ))}
                            </div>
                        </SectionCard>

                        <FinancialSummary trip={trip} />

                        {(canVerify || canSettle) && (
                            <ActionFooter columns={canVerify ? 2 : 1}>
                                {canVerify && (
                                    <>
                                        <Button
                                            tone="secondary"
                                            icon={RotateCcw}
                                            onClick={onOpenRevision}
                                            disabled={Boolean(actionLoading)}
                                        >
                                            Revisi
                                        </Button>
                                        <Button
                                            icon={CheckCircle2}
                                            onClick={onVerify}
                                            disabled={actionLoading === "verify"}
                                        >
                                            {actionLoading === "verify"
                                                ? "Memverifikasi..."
                                                : "Verifikasi"}
                                        </Button>
                                    </>
                                )}
                                {canSettle && (
                                    <Button
                                        icon={WalletCards}
                                        onClick={onOpenSettlement}
                                        disabled={Boolean(actionLoading)}
                                    >
                                        {trip.status ===
                                        BUSINESS_TRIP_STATUS.PENDING_REFUND
                                            ? "Catat Pengembalian"
                                            : "Bayar Kekurangan"}
                                    </Button>
                                )}
                            </ActionFooter>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function FinancialSummary({ trip }) {
    return (
        <SectionCard icon={WalletCards} title="Ringkasan Keuangan">
            <div className="grid gap-3 sm:grid-cols-2">
                <DetailRow
                    label="Requested Amount"
                    value={formatAccommodationAmount(
                        trip.accommodationRequest?.requestedAmount ?? 0,
                    )}
                />
                <DetailRow
                    label="Disbursed Amount"
                    value={formatAccommodationAmount(getDisbursedAmount(trip))}
                />
                <DetailRow
                    label="Total Realisasi"
                    value={formatAccommodationAmount(trip.totalRealizationAmount)}
                />
                <DetailRow
                    label={getSettlementLabel(trip.settlementDifference)}
                    value={formatAccommodationAmount(
                        Math.abs(trip.settlementDifference),
                    )}
                />
            </div>
            {trip.settlements?.length > 0 && (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    {trip.settlements.map((settlement) => (
                        <div key={settlement.id} className="text-sm text-emerald-800">
                            <span className="font-semibold">
                                {settlement.type === "refund"
                                    ? "Pengembalian"
                                    : "Pembayaran"}
                            </span>{" "}
                            {formatAccommodationAmount(settlement.amount)} via{" "}
                            {settlement.paymentMethodLabel}
                            {settlement.referenceNumber
                                ? ` - Ref ${settlement.referenceNumber}`
                                : ""}
                        </div>
                    ))}
                </div>
            )}
        </SectionCard>
    );
}

function SettlementForm({ form, onChange }) {
    return (
        <div className="mt-3 grid gap-3">
            <label>
                <span className="text-sm font-semibold text-slate-700">
                    Tanggal
                </span>
                <input
                    type="date"
                    value={form.transactionDate}
                    onChange={(event) =>
                        onChange((current) => ({
                            ...current,
                            transactionDate: event.target.value,
                        }))
                    }
                    className={businessTripUi.input}
                />
            </label>
            <label>
                <span className="text-sm font-semibold text-slate-700">
                    Metode Pembayaran
                </span>
                <select
                    value={form.paymentMethod}
                    onChange={(event) =>
                        onChange((current) => ({
                            ...current,
                            paymentMethod: event.target.value,
                        }))
                    }
                    className={businessTripUi.input}
                >
                    {BUSINESS_TRIP_PAYMENT_METHODS.map((method) => (
                        <option key={method.value} value={method.value}>
                            {method.label}
                        </option>
                    ))}
                </select>
            </label>
            <label>
                <span className="text-sm font-semibold text-slate-700">
                    Rekening/Cash Account
                </span>
                <input
                    value={form.accountLabel}
                    onChange={(event) =>
                        onChange((current) => ({
                            ...current,
                            accountLabel: event.target.value,
                        }))
                    }
                    placeholder="Contoh: BCA Operasional"
                    className={businessTripUi.input}
                />
            </label>
            <label>
                <span className="text-sm font-semibold text-slate-700">
                    Reference Number
                </span>
                <input
                    value={form.referenceNumber}
                    onChange={(event) =>
                        onChange((current) => ({
                            ...current,
                            referenceNumber: event.target.value,
                        }))
                    }
                    placeholder="Nomor transfer / bukti kas"
                    className={businessTripUi.input}
                />
            </label>
            <label>
                <span className="text-sm font-semibold text-slate-700">
                    Catatan
                </span>
                <textarea
                    value={form.notes}
                    onChange={(event) =>
                        onChange((current) => ({
                            ...current,
                            notes: event.target.value,
                        }))
                    }
                    placeholder="Opsional"
                    className={businessTripUi.textarea}
                />
            </label>
        </div>
    );
}

function Modal({ children, title }) {
    return (
        <div className="fixed inset-0 z-90 flex items-end bg-slate-950/40 p-4 md:items-center md:justify-center">
            <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
                <h3 className="text-base font-semibold text-slate-950">{title}</h3>
                <div className="mt-4">{children}</div>
            </div>
        </div>
    );
}

function VerificationSkeleton() {
    return (
        <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
                <div
                    key={index}
                    className="h-36 animate-pulse rounded-xl border border-slate-200 bg-white"
                />
            ))}
        </div>
    );
}
