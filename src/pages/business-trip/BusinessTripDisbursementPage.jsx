import { useEffect, useState } from "react";
import {
    Banknote,
    CalendarDays,
    ChevronDown,
    CheckCircle2,
    Eye,
    RotateCcw,
    Search,
    Wallet,
    X,
} from "lucide-react";
import {
    BUSINESS_TRIP_PAYMENT_METHODS,
    disburseBusinessTripAdvance,
    getBusinessTripDisbursementDetail,
    getBusinessTripsReadyForDisbursement,
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

const PAGE_SIZE = 20;

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

const sortOptions = [
    { value: "oldest", label: "Terlama" },
    { value: "newest", label: "Terbaru" },
    { value: "trip-nearest", label: "Tanggal Trip Terdekat" },
];

export default function BusinessTripDisbursementPage() {
    const [filters, setFilters] = useState(getDefaultDates);
    const [draftFilters, setDraftFilters] = useState(getDefaultDates);
    const [query, setQuery] = useState("");
    const [projectId, setProjectId] = useState("");
    const [sortMode, setSortMode] = useState("oldest");
    const [page, setPage] = useState(1);
    const [filterOpen, setFilterOpen] = useState(false);
    const [items, setItems] = useState([]);
    const [projects, setProjects] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [selectedTrip, setSelectedTrip] = useState(null);
    const [form, setForm] = useState({
        amount: "",
        notes: "",
        paymentMethod: "transfer",
        referenceNumber: "",
    });
    const [submitting, setSubmitting] = useState(false);
    const [toast, setToast] = useState("");
    const [error, setError] = useState("");

    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

    const showToast = (message) => {
        setToast(message);
        window.setTimeout(() => setToast(""), 2800);
    };

    const loadData = async () => {
        setLoading(true);
        setError("");
        try {
            const result = await getBusinessTripsReadyForDisbursement({
                endDate: filters.endDate,
                page,
                pageSize: PAGE_SIZE,
                projectId,
                search: query,
                sortMode,
                startDate: filters.startDate,
            });
            setItems(result.items);
            setProjects(result.projects);
            setTotalCount(result.total);
        } catch (loadError) {
            console.error("[BusinessTripDisbursement] load failed", loadError);
            setItems([]);
            setTotalCount(0);
            setError("Gagal memuat daftar pencairan.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timeoutId = window.setTimeout(loadData, query.trim() ? 350 : 0);
        return () => window.clearTimeout(timeoutId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        filters.endDate,
        filters.startDate,
        page,
        projectId,
        query,
        sortMode,
    ]);

    const openDetail = async (trip) => {
        setDetailLoading(true);
        try {
            const result = await getBusinessTripDisbursementDetail(trip.id);
            setProjects(result.projects);
            setSelectedTrip(result.trip);
            setForm({
                amount: String(result.trip.accommodationRequest.requestedAmount),
                notes: "",
                paymentMethod: "transfer",
                referenceNumber: "",
            });
        } catch (detailError) {
            console.error("[BusinessTripDisbursement] detail failed", detailError);
            showToast("Gagal memuat detail pencairan.");
        } finally {
            setDetailLoading(false);
        }
    };

    const resetFilters = () => {
        const nextDates = getDefaultDates();
        setDraftFilters(nextDates);
        setFilters(nextDates);
        setProjectId("");
        setQuery("");
        setSortMode("oldest");
        setPage(1);
    };

    const submitDisbursement = async () => {
        if (!selectedTrip || submitting) return;
        setSubmitting(true);
        try {
            const disbursedTrip = await disburseBusinessTripAdvance({
                amount: form.amount,
                notes: form.notes.trim(),
                paymentMethod: form.paymentMethod,
                referenceNumber: form.referenceNumber.trim(),
                tripId: selectedTrip.id,
            });
            setSelectedTrip(disbursedTrip);
            showToast("Uang muka Business Trip berhasil dicairkan.");
            await loadData();
        } catch (submitError) {
            console.error("[BusinessTripDisbursement] submit failed", submitError);
            showToast(submitError.message || "Gagal mencairkan uang muka.");
            if (selectedTrip?.id) openDetail(selectedTrip);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <BusinessTripLayout
            title="Pencairan Uang Muka"
            activeIcon={Wallet}
            showBack={false}
        >
            <div className="space-y-3">
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

                <FilterPanel
                    draftFilters={draftFilters}
                    filterOpen={filterOpen}
                    filters={filters}
                    onApply={() => {
                        setFilters(draftFilters);
                        setFilterOpen(false);
                        setPage(1);
                    }}
                    onReset={resetFilters}
                    onToggle={() => setFilterOpen((current) => !current)}
                    projectId={projectId}
                    projects={projects}
                    setDraftFilters={setDraftFilters}
                    setProjectId={(value) => {
                        setProjectId(value);
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
                    <DisbursementSkeleton />
                ) : items.length === 0 ? (
                    <EmptyState icon={Wallet} title="Tidak ada pencairan siap proses">
                        Business Trip yang disetujui dan memiliki uang muka akan tampil di sini.
                    </EmptyState>
                ) : (
                    <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                        {items.map((trip) => (
                            <DisbursementCard
                                key={trip.id}
                                project={projects.find(
                                    (project) => project.id === trip.projectId,
                                )}
                                trip={trip}
                                onOpen={() => openDetail(trip)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {(selectedTrip || detailLoading) && (
                <DisbursementSheet
                    detailLoading={detailLoading}
                    form={form}
                    onChange={setForm}
                    onClose={() => setSelectedTrip(null)}
                    onSubmit={submitDisbursement}
                    project={projects.find(
                        (project) => project.id === selectedTrip?.projectId,
                    )}
                    submitting={submitting}
                    trip={selectedTrip}
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

function SearchBar({ onChange, onClear, query }) {
    return (
        <label className="relative block">
            <span className="sr-only">Cari pencairan Business Trip</span>
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
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    aria-label="Hapus pencarian"
                >
                    <X size={15} />
                </button>
            )}
        </label>
    );
}

function FilterPanel({
    draftFilters,
    filterOpen,
    filters,
    onApply,
    onReset,
    onToggle,
    projectId,
    projects,
    setDraftFilters,
    setProjectId,
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
                    <label className="block">
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
                {count} siap cair
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

function DisbursementCard({ onOpen, project, trip }) {
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
                <Meta label="Disetujui" value={formatDate(trip.approvedAt)} />
                <Meta
                    label="Requested Amount"
                    value={formatAccommodationAmount(
                        trip.accommodationRequest.requestedAmount,
                    )}
                />
            </div>

            <Button icon={Banknote} onClick={onOpen} className="mt-3 w-full">
                Cairkan
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

function DisbursementSheet({
    detailLoading,
    form,
    onChange,
    onClose,
    onSubmit,
    project,
    submitting,
    trip,
}) {
    const requestedAmount = trip?.accommodationRequest?.requestedAmount ?? 0;
    const amountValid = Number(form.amount) === Number(requestedAmount);
    const alreadyDisbursed = Boolean(trip?.advanceDisbursement);

    return (
        <div className="fixed inset-0 z-90 flex items-end bg-slate-950/40 p-3 md:items-center md:justify-center">
            <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white p-4">
                    <div>
                        <p className="text-[11px] font-bold tracking-wide text-sky-600">
                            {trip?.businessTripNo || "Memuat"}
                        </p>
                        <h3 className="mt-1 text-base font-bold text-slate-950">
                            Pencairan Uang Muka
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
                        <SectionCard icon={Wallet} title="Ringkasan">
                            <div className="grid gap-2 sm:grid-cols-2">
                                <DetailRow label="Business Trip No" value={trip.businessTripNo} />
                                <DetailRow label="Judul" value={trip.title} />
                                <DetailRow label="Pemohon" value={trip.requesterName} />
                                <DetailRow
                                    label="Project"
                                    value={getProjectLabel(project, trip)}
                                />
                                <DetailRow label="Tanggal Trip" value={getTripDateLabel(trip)} />
                                <DetailRow
                                    label="Requested Amount"
                                    value={formatAccommodationAmount(requestedAmount)}
                                />
                            </div>
                        </SectionCard>

                        {alreadyDisbursed ? (
                            <SectionCard icon={CheckCircle2} title="Sudah Dicairkan">
                                <div className="grid gap-2 sm:grid-cols-2">
                                    <DetailRow
                                        label="Nominal Dicairkan"
                                        value={formatAccommodationAmount(
                                            trip.advanceDisbursement.amount,
                                        )}
                                    />
                                    <DetailRow
                                        label="Tanggal Pencairan"
                                        value={formatDateTime(
                                            trip.advanceDisbursement.disbursedAt,
                                        )}
                                    />
                                    <DetailRow
                                        label="Metode"
                                        value={
                                            trip.advanceDisbursement.paymentMethodLabel
                                        }
                                    />
                                    <DetailRow
                                        label="Reference"
                                        value={
                                            trip.advanceDisbursement.referenceNumber ||
                                            "-"
                                        }
                                    />
                                </div>
                            </SectionCard>
                        ) : (
                            <SectionCard icon={Banknote} title="Form Pencairan">
                                <div className="space-y-3">
                                    <label className="block">
                                        <span className="text-[13px] font-semibold text-slate-700">
                                            Nominal Dicairkan
                                        </span>
                                        <input
                                            type="number"
                                            value={form.amount}
                                            onChange={(event) =>
                                                onChange((current) => ({
                                                    ...current,
                                                    amount: event.target.value,
                                                }))
                                            }
                                            className={`mt-1.5 h-11 w-full rounded-xl border px-3 text-[13px] outline-none focus:ring-4 ${
                                                amountValid
                                                    ? "border-slate-200 focus:border-sky-400 focus:ring-sky-100"
                                                    : "border-red-300 focus:border-red-400 focus:ring-red-100"
                                            }`}
                                        />
                                        {!amountValid && (
                                            <p className="mt-1 text-xs font-semibold text-red-600">
                                                Nominal harus sama dengan Requested Amount.
                                            </p>
                                        )}
                                    </label>
                                    <label className="block">
                                        <span className="text-[13px] font-semibold text-slate-700">
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
                                            className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-[13px] outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                                        >
                                            {BUSINESS_TRIP_PAYMENT_METHODS.map((item) => (
                                                <option key={item.value} value={item.value}>
                                                    {item.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="block">
                                        <span className="text-[13px] font-semibold text-slate-700">
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
                                            placeholder="Nomor referensi pembayaran"
                                            className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-[13px] outline-none placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="text-[13px] font-semibold text-slate-700">
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
                                            placeholder="Catatan pencairan bila diperlukan"
                                            className="mt-1.5 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] leading-5 outline-none placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                                        />
                                    </label>
                                </div>
                            </SectionCard>
                        )}
                    </div>
                )}

                {trip && !alreadyDisbursed && (
                    <ActionFooter columns={1}>
                        <Button
                            tone="success"
                            icon={Banknote}
                            onClick={onSubmit}
                            disabled={submitting || !amountValid}
                        >
                            {submitting ? "Memproses..." : "Cairkan Uang Muka"}
                        </Button>
                    </ActionFooter>
                )}
            </section>
        </div>
    );
}

function DisbursementSkeleton() {
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
