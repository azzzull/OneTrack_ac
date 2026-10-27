import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ArrowLeft,
    Banknote,
    CheckCircle2,
    Clock3,
    Download,
    Eye,
    FileImage,
    Filter,
    Loader,
    Receipt,
    Search,
    Wallet,
    X,
    XCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import ImagePreviewModal from "../../components/ImagePreviewModal";
import ReportSummaryCard from "../../components/reports/ReportSummaryCard";
import CustomSelect from "../../components/ui/CustomSelect";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import { useAuth } from "../../context/useAuth";
import supabase from "../../supabaseClient";
import { createUniqueChannelName } from "../../utils/realtimeChannelManager";
import {
    exportStyledExcel,
    makeExcelFileName,
    parseExcelDate,
} from "../../utils/excelExport";
import {
    REIMBURSEMENT_STATUS_LABELS,
    REIMBURSEMENT_STATUS_STYLES,
    formatCurrency,
    getDisplayName,
    loadReimbursementRequesters,
    loadReimbursements,
} from "../../services/reimbursementService";
import {
    groupReimbursementsByRequester,
    normalizePaymentStatus,
    summarizeReimbursements,
    validateReimbursementItem,
} from "../../services/reimbursementAggregation";

const todayKey = () => new Date().toISOString().slice(0, 10);

const formatDate = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
};

const toDateKey = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
};

const getWeekStart = (date) => {
    const next = new Date(date);
    const day = next.getDay() || 7;
    next.setDate(next.getDate() - day + 1);
    next.setHours(0, 0, 0, 0);
    return next.toISOString().slice(0, 10);
};

const matchesPeriod = (row, filters) => {
    if (filters.period === "all") return true;

    const dateKey = toDateKey(row.transaction_date);
    if (!dateKey) return false;
    const now = new Date();

    if (filters.period === "today") return dateKey === todayKey();
    if (filters.period === "week") return dateKey >= getWeekStart(now);
    if (filters.period === "month") {
        return dateKey.startsWith(todayKey().slice(0, 7));
    }
    if (filters.period === "year") {
        return dateKey.startsWith(String(now.getFullYear()));
    }
    if (filters.period === "custom") {
        if (filters.dateFrom && dateKey < filters.dateFrom) return false;
        if (filters.dateTo && dateKey > filters.dateTo) return false;
    }
    return true;
};

const isImageUrl = (url) =>
    /\.(png|jpe?g|webp|gif|bmp|avif)(\?.*)?$/i.test(String(url ?? ""));

const GROUP_STATUS_LABELS = {
    pending: "Pending",
    partial_approved: "Sebagian Disetujui",
    awaiting_payment: "Menunggu Pembayaran",
    paid: "Selesai Dibayar",
    approved: "Approved",
    rejected: "Rejected",
};

const groupStatusStyle = (status) => {
    if (status === "awaiting_payment") return "bg-orange-100 text-orange-700";
    if (status === "paid") return "bg-emerald-100 text-emerald-700";
    return (
        REIMBURSEMENT_STATUS_STYLES[
            status.startsWith("partial_") ? "pending" : status
        ] ?? REIMBURSEMENT_STATUS_STYLES.pending
    );
};

export default function ReimbursementReports() {
    const { collapsed, toggle } = useSidebarCollapsed();
    const { user, role } = useAuth();
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [requesters, setRequesters] = useState([]);
    const [selectedRequesterId, setSelectedRequesterId] = useState(null);
    const [preview, setPreview] = useState({ src: "", title: "" });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [filters, setFilters] = useState({
        period: "all",
        dateFrom: "",
        dateTo: "",
        requesterId: "",
        status: "all",
        search: "",
    });
    const channelRef = useRef(null);
    const userId = user?.id;

    const loadData = useCallback(async () => {
        if (!userId || !role) return;
        setLoading(true);
        setError("");
        try {
            const [reimbursements, requesterRows] = await Promise.all([
                loadReimbursements({ role, userId }),
                loadReimbursementRequesters(),
            ]);
            setRows(reimbursements);
            setRequesters(requesterRows);
        } catch (loadError) {
            console.error("Reimbursement reports load failed:", loadError);
            setError(loadError.message || "Gagal memuat report reimburse.");
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [role, userId]);

    useEffect(() => {
        queueMicrotask(loadData);
    }, [loadData]);

    useEffect(() => {
        if (!userId) return undefined;
        const channelName = createUniqueChannelName(
            "reimbursement-reports",
            userId,
        );
        channelRef.current = supabase
            .channel(channelName)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "reimbursements" },
                loadData,
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "reimbursement_attachments",
                },
                loadData,
            )
            .subscribe();

        return () => {
            if (channelRef.current) supabase.removeChannel(channelRef.current);
        };
    }, [loadData, userId]);

    const filteredRows = useMemo(() => {
        const search = filters.search.trim().toLowerCase();
        return rows.filter((row) => {
            if (filters.status !== "all" && row.status !== filters.status) {
                return false;
            }
            if (
                filters.requesterId &&
                row.requester_id !== filters.requesterId
            ) {
                return false;
            }
            if (!matchesPeriod(row, filters)) return false;
            if (search) {
                const text = [
                    getDisplayName(row.requester),
                    row.description,
                    row.claim_amount,
                    row.approved_amount,
                    REIMBURSEMENT_STATUS_LABELS[row.status],
                ]
                    .join(" ")
                    .toLowerCase();
                if (!text.includes(search)) return false;
            }
            return true;
        });
    }, [filters, rows]);

    const summary = useMemo(() => {
        const aggregate = summarizeReimbursements(filteredRows);
        const result = {
            total: filteredRows.length,
            pending: aggregate.pending,
            approved: aggregate.approved,
            rejected: aggregate.rejected,
            claimAmount: aggregate.totalReimburse,
            approvedAmount: aggregate.approvedAmount,
        };
        return {
            ...result,
            difference: result.claimAmount - result.approvedAmount,
        };
    }, [filteredRows]);

    // Unlike the review page, this report intentionally groups every matching
    // record, including paid and rejected reimbursements.
    const requesterGroups = useMemo(
        () => groupReimbursementsByRequester(filteredRows),
        [filteredRows],
    );

    const selectedRequesterGroup = useMemo(
        () =>
            requesterGroups.find((group) => group.id === selectedRequesterId) ??
            null,
        [requesterGroups, selectedRequesterId],
    );

    const openFile = (url, title) => {
        if (!url) return;
        if (isImageUrl(url)) {
            setPreview({ src: url, title });
            return;
        }
        window.open(url, "_blank", "noopener,noreferrer");
    };

    const exportExcel = async () => {
        const rowsForExcel = filteredRows.map((row, index) => {
            const claim = Number(row.claim_amount ?? 0);
            const { approvedAmount: approved } = validateReimbursementItem(row);
            return {
                no: index + 1,
                id: row.id,
                requesterName: getDisplayName(row.requester),
                role: row.requester?.role ?? "-",
                createdAt: parseExcelDate(row.created_at),
                transactionDate: parseExcelDate(row.transaction_date),
                description: row.description,
                claimAmount: claim,
                approvedAmount: approved,
                difference: claim - approved,
                status: REIMBURSEMENT_STATUS_LABELS[row.status] ?? row.status,
                approvedBy: getDisplayName(row.approver),
                approvedAt: parseExcelDate(row.approved_at),
                paymentStatus:
                    row.status === "approved"
                        ? normalizePaymentStatus(row.payment_status) === "paid"
                            ? "Dibayar"
                            : "Belum Dibayar"
                        : "-",
                paymentBatch: row.reimbursement_payment_batch?.batch_number
                    ? `Batch #${row.reimbursement_payment_batch.batch_number}`
                    : "-",
                paidAt: parseExcelDate(row.paid_at),
                rejectionReason: row.rejection_reason || "-",
                approvalNote: row.approval_note || "-",
            };
        });

        await exportStyledExcel({
            fileName: makeExcelFileName(["reimburse", todayKey().slice(0, 7)]),
            sheetName: "Reimburse",
            title: "Laporan Reimburse",
            filterRows: [
                ["Periode", filters.period],
                ["Status", filters.status],
                [
                    "Pengaju",
                    filters.requesterId
                        ? getDisplayName(
                              requesters.find(
                                  (item) => item.id === filters.requesterId,
                              ),
                          )
                        : "Semua",
                ],
            ],
            columns: [
                { key: "no", header: "No" },
                { key: "id", header: "ID Reimburse" },
                { key: "requesterName", header: "Nama Pengaju" },
                { key: "role", header: "Role" },
                { key: "createdAt", header: "Tanggal Pengajuan" },
                { key: "transactionDate", header: "Tanggal Transaksi" },
                { key: "description", header: "Keterangan" },
                { key: "claimAmount", header: "Nominal Klaim" },
                { key: "approvedAmount", header: "Nominal Disetujui" },
                { key: "difference", header: "Selisih" },
                { key: "status", header: "Status" },
                { key: "approvedBy", header: "Approved By" },
                { key: "approvedAt", header: "Tanggal Approval" },
                { key: "paymentStatus", header: "Status Pembayaran" },
                { key: "paymentBatch", header: "Batch Pembayaran" },
                { key: "paidAt", header: "Tanggal Pembayaran" },
                { key: "rejectionReason", header: "Alasan Penolakan" },
                { key: "approvalNote", header: "Catatan Approval" },
            ],
            rows: rowsForExcel,
            dateKeys: ["createdAt", "transactionDate", "approvedAt", "paidAt"],
            currencyKeys: ["claimAmount", "approvedAmount", "difference"],
            wrapKeys: ["description", "rejectionReason", "approvalNote"],
            summaryRows: [
                ["Total Nominal Klaim", summary.claimAmount, "currency"],
                ["Total Nominal Disetujui", summary.approvedAmount, "currency"],
            ],
        });
    };

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="flex min-h-screen">
                <Sidebar collapsed={collapsed} onToggle={toggle} />
                <main className="min-w-0 flex-1 p-4 pb-24 md:p-8 md:pb-8">
                    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <button
                                type="button"
                                onClick={() => navigate("/reimburse")}
                                className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-sky-600"
                            >
                                <ArrowLeft size={16} />
                                Reimburse
                            </button>
                            <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">
                                Report Reimburse
                            </h1>
                            <p className="mt-1 text-sm text-slate-600">
                                Ringkasan dan data reimburse berdasarkan filter.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={exportExcel}
                            disabled={filteredRows.length === 0}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
                        >
                            <Download size={16} />
                            Export Excel
                        </button>
                    </div>

                    {error && (
                        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                            {error}
                        </div>
                    )}

                    <section className="mb-6">
                        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:hidden">
                            <div className="min-w-36">
                                <ReportSummaryCard
                                    label="Total Klaim"
                                    value={summary.total}
                                    icon={Receipt}
                                    compact
                                />
                            </div>
                            <div className="min-w-36">
                                <ReportSummaryCard
                                    label="Pending"
                                    value={summary.pending}
                                    icon={Clock3}
                                    compact
                                />
                            </div>
                            <div className="min-w-36">
                                <ReportSummaryCard
                                    label="Approved"
                                    value={summary.approved}
                                    icon={CheckCircle2}
                                    compact
                                />
                            </div>
                            <div className="min-w-36">
                                <ReportSummaryCard
                                    label="Rejected"
                                    value={summary.rejected}
                                    icon={XCircle}
                                    compact
                                />
                            </div>
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-3 md:hidden">
                            <ReportSummaryCard
                                label="Nominal Klaim"
                                value={formatCurrency(summary.claimAmount)}
                                icon={Wallet}
                            />
                            <ReportSummaryCard
                                label="Disetujui"
                                value={formatCurrency(summary.approvedAmount)}
                                icon={Banknote}
                            />
                            <ReportSummaryCard
                                label="Selisih"
                                value={formatCurrency(summary.difference)}
                                icon={Wallet}
                            />
                        </div>
                        <div className="hidden gap-4 md:grid md:grid-cols-3">
                            <ReportSummaryCard
                                label="Total Klaim"
                                value={summary.total}
                                icon={Receipt}
                            />
                            <ReportSummaryCard
                                label="Pending"
                                value={summary.pending}
                                icon={Clock3}
                            />
                            <ReportSummaryCard
                                label="Approved"
                                value={summary.approved}
                                icon={CheckCircle2}
                            />
                            <ReportSummaryCard
                                label="Rejected"
                                value={summary.rejected}
                                icon={XCircle}
                            />
                            <ReportSummaryCard
                                label="Nominal Klaim"
                                value={formatCurrency(summary.claimAmount)}
                                icon={Wallet}
                            />
                            <ReportSummaryCard
                                label="Disetujui"
                                value={formatCurrency(summary.approvedAmount)}
                                icon={Banknote}
                            />
                            <SummaryCard
                                label="Selisih"
                                value={formatCurrency(summary.difference)}
                                icon={Wallet}
                            />
                        </div>
                    </section>

                    <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                            <Filter size={16} />
                            Filter
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
                            <CustomSelect
                                value={filters.period}
                                onChange={(value) =>
                                    setFilters((prev) => ({
                                        ...prev,
                                        period: value,
                                    }))
                                }
                                options={[
                                    { value: "all", label: "Semua periode" },
                                    { value: "today", label: "Hari ini" },
                                    { value: "week", label: "Minggu ini" },
                                    { value: "month", label: "Bulan ini" },
                                    { value: "year", label: "Tahun ini" },
                                    { value: "custom", label: "Custom range" },
                                ]}
                            />
                            {filters.period === "custom" && (
                                <>
                                    <input
                                        type="date"
                                        value={filters.dateFrom}
                                        onChange={(event) =>
                                            setFilters((prev) => ({
                                                ...prev,
                                                dateFrom: event.target.value,
                                            }))
                                        }
                                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                    />
                                    <input
                                        type="date"
                                        value={filters.dateTo}
                                        onChange={(event) =>
                                            setFilters((prev) => ({
                                                ...prev,
                                                dateTo: event.target.value,
                                            }))
                                        }
                                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                    />
                                </>
                            )}
                            <CustomSelect
                                value={filters.requesterId}
                                onChange={(value) =>
                                    setFilters((prev) => ({
                                        ...prev,
                                        requesterId: value,
                                    }))
                                }
                                options={[
                                    { value: "", label: "Semua pengaju" },
                                    ...requesters.map((item) => ({
                                        value: item.id,
                                        label: getDisplayName(item),
                                    })),
                                ]}
                            />
                            <CustomSelect
                                value={filters.status}
                                onChange={(value) =>
                                    setFilters((prev) => ({
                                        ...prev,
                                        status: value,
                                    }))
                                }
                                options={[
                                    { value: "all", label: "Semua status" },
                                    { value: "pending", label: "Pending" },
                                    { value: "approved", label: "Approved" },
                                    { value: "rejected", label: "Rejected" },
                                ]}
                            />
                            <label className="relative block">
                                <Search
                                    size={15}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                                />
                                <input
                                    type="search"
                                    value={filters.search}
                                    onChange={(event) =>
                                        setFilters((prev) => ({
                                            ...prev,
                                            search: event.target.value,
                                        }))
                                    }
                                    placeholder="Search"
                                    className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm"
                                />
                            </label>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center gap-2 rounded-2xl bg-white p-8 text-slate-600 shadow-sm">
                            <Loader size={18} className="animate-spin" />
                            Memuat data...
                        </div>
                    ) : requesterGroups.length === 0 ? (
                        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
                            Tidak ada data reimburse.
                        </div>
                    ) : (
                        <section className="space-y-4">
                            {requesterGroups.map((group) => {
                                const paidAmount = Math.max(
                                    0,
                                    group.approvedAmount - group.unpaidAmount,
                                );

                                return (
                                    <article
                                        key={group.id}
                                        className="overflow-hidden rounded-2xl bg-white shadow-sm transition hover:shadow-md md:hover:scale-[1.01]"
                                    >
                                        <div className="p-4 md:p-5">
                                            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h2 className="text-base font-semibold text-slate-900">
                                                            {getDisplayName(group.requester)}
                                                        </h2>
                                                        <span
                                                            className={`rounded-full px-2 py-1 text-xs font-semibold ${groupStatusStyle(group.status)}`}
                                                        >
                                                            {GROUP_STATUS_LABELS[
                                                                group.status
                                                            ] ?? "Reimburse"}
                                                        </span>
                                                    </div>
                                                    <p className="mt-2 text-sm text-slate-600">
                                                        {group.items.length} transaksi
                                                        {group.items.length === 1
                                                            ? ""
                                                            : " reimburse"}
                                                        {group.paid > 0 &&
                                                            ` · ${group.paid} sudah dibayar`}
                                                        {group.unpaid > 0 &&
                                                            ` · ${group.unpaid} menunggu pembayaran`}
                                                    </p>
                                                    <p className="mt-2 text-xs font-medium text-slate-500">
                                                        Transaksi terbaru {formatDate(group.latestAt)}
                                                    </p>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 md:min-w-[38rem]">
                                                    <ReportAmount
                                                        label="Total Klaim"
                                                        value={formatCurrency(
                                                            group.totalReimburse,
                                                        )}
                                                        className="bg-slate-50 text-slate-900"
                                                    />
                                                    <ReportAmount
                                                        label="Disetujui"
                                                        value={formatCurrency(
                                                            group.approvedAmount,
                                                        )}
                                                        className="bg-sky-50 text-sky-900"
                                                    />
                                                    <ReportAmount
                                                        label="Sudah Dibayar"
                                                        value={formatCurrency(paidAmount)}
                                                        className="bg-emerald-50 text-emerald-900"
                                                    />
                                                    <ReportAmount
                                                        label="Menunggu Pembayaran"
                                                        value={formatCurrency(
                                                            group.unpaidAmount,
                                                        )}
                                                        className="bg-orange-50 text-orange-900"
                                                    />
                                                </div>
                                            </div>
                                            <div className="mt-4 flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setSelectedRequesterId(group.id)
                                                    }
                                                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                                >
                                                    <Eye size={15} />
                                                    Lihat semua transaksi
                                                </button>
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}
                        </section>
                    )}
                </main>
            </div>
            <MobileBottomNav />
            {selectedRequesterGroup && (
                <ReportRequesterDetailModal
                    group={selectedRequesterGroup}
                    onClose={() => setSelectedRequesterId(null)}
                    onOpenFile={openFile}
                />
            )}
            <ImagePreviewModal
                title={preview.title}
                src={preview.src}
                alt={preview.title}
                onClose={() => setPreview({ src: "", title: "" })}
            />
        </div>
    );
}

function ReportAmount({ label, value, className }) {
    return (
        <div className={`rounded-xl p-3 ${className}`}>
            <p className="text-xs font-medium opacity-70">{label}</p>
            <p className="mt-1 break-words font-semibold">{value}</p>
        </div>
    );
}

function ReportRequesterDetailModal({ group, onClose, onOpenFile }) {
    const paidCount = group.items.filter(
        (item) =>
            item.status === "approved" &&
            normalizePaymentStatus(item.payment_status) === "paid" &&
            Boolean(item.transfer_proof_url),
    ).length;
    const paidAmount = Math.max(
        0,
        group.approvedAmount - group.unpaidAmount,
    );

    const receiptButtons = (item) => {
        const attachments = item.attachments ?? [];
        if (!attachments.length) {
            return <span className="text-xs text-slate-500">Tidak ada bukti nota</span>;
        }

        return attachments.map((attachment, index) => (
            <button
                key={attachment.id ?? `${item.id}-${index}`}
                type="button"
                onClick={() =>
                    onOpenFile(
                        attachment.file_url,
                        `Bukti nota ${index + 1}`,
                    )
                }
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
                <FileImage size={13} />
                Lihat nota{attachments.length > 1 ? ` ${index + 1}` : ""}
            </button>
        ));
    };

    const paymentStatus = (item) => {
        if (item.status !== "approved") {
            return <span className="text-xs text-slate-400">-</span>;
        }

        const isPaid =
            normalizePaymentStatus(item.payment_status) === "paid" &&
            Boolean(item.transfer_proof_url);
        return (
            <span
                className={`rounded-full px-2 py-1 text-xs font-semibold ${
                    isPaid
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-orange-100 text-orange-700"
                }`}
            >
                {isPaid ? "Sudah Dibayar" : "Menunggu Dibayar"}
            </span>
        );
    };

    const transferProof = (item) => {
        if (!item.transfer_proof_url) return null;
        const batchLabel = item.reimbursement_payment_batch?.batch_number
            ? ` · Batch #${item.reimbursement_payment_batch.batch_number}`
            : "";

        return (
            <button
                type="button"
                onClick={() =>
                    onOpenFile(item.transfer_proof_url, "Bukti transfer")
                }
                className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
            >
                <FileImage size={13} />
                Bukti transfer{batchLabel}
            </button>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-0 md:p-4">
            <div className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl md:max-h-[92vh] md:max-w-6xl md:rounded-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 md:px-5">
                    <div className="min-w-0">
                        <h2 className="truncate text-lg font-semibold text-slate-900">
                            {getDisplayName(group.requester)}
                        </h2>
                        <p className="mt-1 text-sm text-slate-600">
                            {group.items.length} transaksi hasil filter report,
                            termasuk {paidCount} yang sudah dibayar.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                        aria-label="Tutup detail reimburse"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
                    <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                        <ReportAmount
                            label="Total Klaim"
                            value={formatCurrency(group.totalReimburse)}
                            className="bg-slate-50 text-slate-900"
                        />
                        <ReportAmount
                            label="Disetujui"
                            value={formatCurrency(group.approvedAmount)}
                            className="bg-sky-50 text-sky-900"
                        />
                        <ReportAmount
                            label="Sudah Dibayar"
                            value={formatCurrency(paidAmount)}
                            className="bg-emerald-50 text-emerald-900"
                        />
                        <ReportAmount
                            label="Menunggu Pembayaran"
                            value={formatCurrency(group.unpaidAmount)}
                            className="bg-orange-50 text-orange-900"
                        />
                    </div>

                    <div className="mt-5 hidden overflow-x-auto rounded-2xl border border-slate-200 md:block">
                        <table className="min-w-full text-left text-sm">
                            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="px-4 py-3">Tanggal</th>
                                    <th className="px-4 py-3">Keterangan</th>
                                    <th className="px-4 py-3">Nominal</th>
                                    <th className="px-4 py-3">Status Approval</th>
                                    <th className="px-4 py-3">Pembayaran</th>
                                    <th className="px-4 py-3">Bukti</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {group.items.map((item) => (
                                    <tr key={item.id} className="align-top hover:bg-slate-50">
                                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                                            {formatDate(item.transaction_date)}
                                        </td>
                                        <td className="min-w-72 px-4 py-3 text-slate-700">
                                            <p>{item.description}</p>
                                            {item.approval_note && (
                                                <p className="mt-1 text-xs text-slate-500">
                                                    Catatan approval: {item.approval_note}
                                                </p>
                                            )}
                                            {item.rejection_reason && (
                                                <p className="mt-1 text-xs text-red-600">
                                                    Alasan penolakan: {item.rejection_reason}
                                                </p>
                                            )}
                                            {item.approved_by && (
                                                <p className="mt-1 text-xs text-slate-500">
                                                    Disetujui oleh: {getDisplayName(item.approver)}
                                                </p>
                                            )}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                                            {formatCurrency(item.claim_amount)}
                                            {item.status === "approved" && (
                                                <p className="mt-1 text-xs font-medium text-emerald-700">
                                                    Disetujui {formatCurrency(item.approved_amount)}
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`rounded-full px-2 py-1 text-xs font-semibold ${REIMBURSEMENT_STATUS_STYLES[item.status]}`}
                                            >
                                                {REIMBURSEMENT_STATUS_LABELS[item.status]}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">{paymentStatus(item)}</td>
                                        <td className="min-w-44 px-4 py-3">
                                            <div className="flex flex-wrap gap-1.5">
                                                {receiptButtons(item)}
                                            </div>
                                            {transferProof(item)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-5 space-y-3 md:hidden">
                        {group.items.map((item) => (
                            <article
                                key={item.id}
                                className="rounded-2xl border border-slate-200 p-4"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">
                                            {formatDate(item.transaction_date)}
                                        </p>
                                        <p className="mt-1 text-sm text-slate-700">
                                            {item.description}
                                        </p>
                                    </div>
                                    <span
                                        className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${REIMBURSEMENT_STATUS_STYLES[item.status]}`}
                                    >
                                        {REIMBURSEMENT_STATUS_LABELS[item.status]}
                                    </span>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-slate-900">
                                        {formatCurrency(item.claim_amount)}
                                    </span>
                                    {item.status === "approved" && (
                                        <span className="text-xs font-medium text-emerald-700">
                                            Disetujui {formatCurrency(item.approved_amount)}
                                        </span>
                                    )}
                                    {paymentStatus(item)}
                                </div>
                                {item.approval_note && (
                                    <p className="mt-2 text-xs text-slate-500">
                                        Catatan approval: {item.approval_note}
                                    </p>
                                )}
                                {item.rejection_reason && (
                                    <p className="mt-2 text-xs text-red-600">
                                        Alasan penolakan: {item.rejection_reason}
                                    </p>
                                )}
                                {item.approved_by && (
                                    <p className="mt-2 text-xs text-slate-500">
                                        Disetujui oleh: {getDisplayName(item.approver)}
                                    </p>
                                )}
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                    {receiptButtons(item)}
                                </div>
                                {transferProof(item)}
                            </article>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
