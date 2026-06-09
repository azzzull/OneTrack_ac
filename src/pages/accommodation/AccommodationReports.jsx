import {
    createElement,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    Banknote,
    Clock3,
    FileImage,
    Receipt,
    Wallet,
    X,
} from "lucide-react";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import ImagePreviewModal from "../../components/ImagePreviewModal";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import { useAuth } from "../../context/useAuth";
import supabase from "../../supabaseClient";
import {
    STATUS_LABELS,
    STATUS_STYLES,
    formatCurrency,
    getDisplayName,
    loadAccommodationRequests,
} from "../../services/accommodationService";
import { createUniqueChannelName } from "../../utils/realtimeChannelManager";

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

const daysSince = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return Math.max(
        0,
        Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)),
    );
};

const getAccommodationCustomerLabel = (request) =>
    request?.customer_name || request?.customer?.name || "-";

const getAccommodationProjectLabel = (request) =>
    request?.project_name ||
    request?.project?.project_name ||
    request?.project?.name ||
    "-";

const SummaryCard = ({ title, value, icon: Icon }) => (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
            <div>
                <p className="text-sm text-slate-500">{title}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                    {value}
                </p>
            </div>
            <span className="rounded-2xl bg-sky-50 p-3 text-sky-500">
                {createElement(Icon, { size: 22 })}
            </span>
        </div>
    </div>
);

const toCsvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

const getMonthKey = (date = new Date()) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const getYearKey = (date = new Date()) => `${date.getFullYear()}`;

const toDateKey = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const matchesPeriod = (request, periodMode, periodValue) => {
    if (periodMode === "all") return true;

    const dateKey = toDateKey(
        request.requested_at || request.created_at || request.reviewed_at,
    );
    if (!dateKey) return false;

    if (periodMode === "monthly") {
        return dateKey.startsWith(periodValue);
    }

    if (periodMode === "yearly") {
        return dateKey.startsWith(periodValue);
    }

    return true;
};

export default function AccommodationReports() {
    const { role, user } = useAuth();
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [periodMode, setPeriodMode] = useState("monthly");
    const [monthFilter, setMonthFilter] = useState(getMonthKey());
    const [yearFilter, setYearFilter] = useState(getYearKey());
    const [reportView, setReportView] = useState("overall");
    const [selectedRequestId, setSelectedRequestId] = useState(null);
    const [imagePreview, setImagePreview] = useState({
        open: false,
        url: "",
        label: "",
    });
    const channelRef = useRef(null);
    const isMountedRef = useRef(true);

    const isImagePreviewableUrl = (url) =>
        /\.(png|jpe?g|webp|gif|bmp|avif|svg)(\?.*)?$/i.test(String(url ?? ""));

    const openImagePreview = (url, label) => {
        if (!url) return;
        if (!isImagePreviewableUrl(url)) {
            window.open(url, "_blank", "noopener,noreferrer");
            return;
        }

        setImagePreview({
            open: true,
            url,
            label,
        });
    };

    const loadData = useCallback(async () => {
        try {
            const data = await loadAccommodationRequests({
                role,
                userId: user?.id,
            });
            if (isMountedRef.current) setRequests(data);
        } catch (error) {
            console.error("Accommodation reports load failed:", error);
            if (isMountedRef.current) setRequests([]);
        } finally {
            if (isMountedRef.current) setLoading(false);
        }
    }, [role, user?.id]);

    useEffect(() => {
        isMountedRef.current = true;
        loadData();
        return () => {
            isMountedRef.current = false;
        };
    }, [loadData]);

    useEffect(() => {
        if (!user?.id) return undefined;

        const channelName = createUniqueChannelName(
            "accommodation-reports",
            user.id,
        );
        channelRef.current = supabase
            .channel(`${channelName}-${Date.now()}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "accommodation_requests",
                },
                loadData,
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "accommodation_realizations",
                },
                loadData,
            );

        channelRef.current.subscribe((status) => {
            if (status === "SUBSCRIBED") {
                loadData();
            }
        });

        const intervalId = setInterval(loadData, 30000);
        const handleFocus = () => {
            if (document.visibilityState === "visible") loadData();
        };
        document.addEventListener("visibilitychange", handleFocus);
        window.addEventListener("focus", handleFocus);

        return () => {
            clearInterval(intervalId);
            document.removeEventListener("visibilitychange", handleFocus);
            window.removeEventListener("focus", handleFocus);
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [loadData, user?.id]);

    const periodValue = periodMode === "monthly" ? monthFilter : yearFilter;

    const filteredRequests = useMemo(
        () =>
            requests.filter((request) =>
                matchesPeriod(request, periodMode, periodValue),
            ),
        [periodMode, periodValue, requests],
    );

    const periodLabel = useMemo(() => {
        if (periodMode === "all") return "Semua periode";
        if (periodMode === "yearly") return `Tahun ${yearFilter}`;
        const [year, month] = monthFilter.split("-");
        const date = new Date(Number(year), Number(month) - 1, 1);
        return date.toLocaleDateString("id-ID", {
            month: "long",
            year: "numeric",
        });
    }, [monthFilter, periodMode, yearFilter]);

    const summary = useMemo(
        () => ({
            requested: filteredRequests.reduce(
                (sum, item) => sum + Number(item.requested_amount ?? 0),
                0,
            ),
            approved: filteredRequests.reduce(
                (sum, item) => sum + Number(item.approved_amount ?? 0),
                0,
            ),
            realized: filteredRequests.reduce(
                (sum, item) => sum + Number(item.totalRealized ?? 0),
                0,
            ),
            outstanding: filteredRequests.reduce(
                (sum, item) => sum + Number(item.remainingAmount ?? 0),
                0,
            ),
            pending: filteredRequests
                .filter((item) => item.status === "pending")
                .reduce(
                    (sum, item) => sum + Number(item.requested_amount ?? 0),
                    0,
                ),
        }),
        [filteredRequests],
    );

    const reportRows = useMemo(
        () =>
            [...filteredRequests].sort(
                (a, b) =>
                    new Date(b.requested_at || b.created_at || 0) -
                    new Date(a.requested_at || a.created_at || 0),
            ),
        [filteredRequests],
    );

    const technicianRows = useMemo(() => {
        const map = new Map();

        for (const item of filteredRequests) {
            const key = item.technician_id || "unknown";
            const current = map.get(key) ?? {
                technicianId: key,
                technician: item.technician,
                requestCount: 0,
                requested: 0,
                approved: 0,
                realized: 0,
                remaining: 0,
                pending: 0,
            };

            current.requestCount += 1;
            current.requested += Number(item.requested_amount ?? 0);
            current.approved += Number(item.approved_amount ?? 0);
            current.realized += Number(item.totalRealized ?? 0);
            current.remaining += Number(item.remainingAmount ?? 0);
            if (item.status === "pending") {
                current.pending += Number(item.requested_amount ?? 0);
            }

            map.set(key, current);
        }

        return [...map.values()].sort((a, b) => b.remaining - a.remaining);
    }, [filteredRequests]);

    const selectedRequest = useMemo(
        () => reportRows.find((item) => item.id === selectedRequestId) ?? null,
        [reportRows, selectedRequestId],
    );

    const exportCsv = () => {
        const headers = [
            "Technician",
            "Request Title",
            "Requested Amount",
            "Approved Amount",
            "Realized Amount",
            "Remaining Amount",
            "Status",
            "Days Since Approval",
        ];
        const lines = [headers.map(toCsvCell).join(",")];

        for (const row of reportRows) {
            lines.push(
                [
                    getDisplayName(row.technician),
                    row.request_title,
                    row.requested_amount,
                    row.approved_amount,
                    row.totalRealized,
                    row.remainingAmount,
                    STATUS_LABELS[row.status] ?? row.status,
                    daysSince(row.reviewed_at),
                ]
                    .map(toCsvCell)
                    .join(","),
            );
        }

        const blob = new Blob([`\uFEFF${lines.join("\n")}`], {
            type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `accommodation-report-${periodMode}-${periodValue || "all"}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-screen bg-sky-50">
            <div className="flex min-h-screen">
                <Sidebar
                    collapsed={sidebarCollapsed}
                    onToggle={toggleSidebar}
                />
                <main className="min-w-0 flex-1 p-4 pb-24 md:p-8 md:pb-8">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">
                                Accommodation Reports
                            </h1>
                            <p className="mt-1 text-slate-600">
                                Ringkasan cash advance, realisasi, dan dana
                                outstanding.
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 md:items-end">
                            <button
                                type="button"
                                onClick={exportCsv}
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                            >
                                <Receipt size={16} />
                                Export CSV
                            </button>
                            <p className="text-sm font-medium text-slate-500">
                                Periode: {periodLabel}
                            </p>
                        </div>
                    </div>

                    <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <p className="text-sm font-semibold text-slate-900">
                                    Filter Periode
                                </p>
                                <p className="mt-1 text-sm text-slate-500">
                                    Default laporan menampilkan bulan berjalan.
                                </p>
                            </div>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                                <div className="inline-flex rounded-full bg-slate-100 p-1">
                                    {[
                                        { key: "monthly", label: "Bulanan" },
                                        { key: "yearly", label: "Tahunan" },
                                        { key: "all", label: "Semua" },
                                    ].map((item) => (
                                        <button
                                            key={item.key}
                                            type="button"
                                            onClick={() =>
                                                setPeriodMode(item.key)
                                            }
                                            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                                                periodMode === item.key
                                                    ? "bg-sky-500 text-white"
                                                    : "text-slate-600 hover:bg-white"
                                            }`}
                                        >
                                            {item.label}
                                        </button>
                                    ))}
                                </div>

                                {periodMode === "monthly" && (
                                    <label>
                                        <input
                                            type="month"
                                            value={monthFilter}
                                            onChange={(event) =>
                                                setMonthFilter(
                                                    event.target.value,
                                                )
                                            }
                                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-300"
                                        />
                                    </label>
                                )}

                                {periodMode === "yearly" && (
                                    <label>
                                        <input
                                            type="number"
                                            min="2020"
                                            max="2100"
                                            value={yearFilter}
                                            onChange={(event) =>
                                                setYearFilter(
                                                    event.target.value,
                                                )
                                            }
                                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-300"
                                        />
                                    </label>
                                )}
                            </div>
                        </div>
                    </section>

                    <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                        <SummaryCard
                            title="Total Requested"
                            value={formatCurrency(summary.requested)}
                            icon={Wallet}
                        />
                        <SummaryCard
                            title="Total Approved"
                            value={formatCurrency(summary.approved)}
                            icon={Banknote}
                        />
                        <SummaryCard
                            title="Total Realized"
                            value={formatCurrency(summary.realized)}
                            icon={Receipt}
                        />
                        <SummaryCard
                            title="Outstanding"
                            value={formatCurrency(summary.outstanding)}
                            icon={Clock3}
                        />
                        <SummaryCard
                            title="Pending Amount"
                            value={formatCurrency(summary.pending)}
                            icon={Wallet}
                        />
                    </section>

                    <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">
                                    Detail Report
                                </h2>
                                <p className="mt-1 text-sm text-slate-500">
                                    Pilih tampilan report keseluruhan atau per
                                    teknisi.
                                </p>
                            </div>
                            <div className="inline-flex w-fit rounded-full bg-slate-100 p-1">
                                {[
                                    {
                                        key: "overall",
                                        label: "Keseluruhan",
                                    },
                                    {
                                        key: "technician",
                                        label: "Per Teknisi",
                                    },
                                ].map((item) => (
                                    <button
                                        key={item.key}
                                        type="button"
                                        onClick={() => setReportView(item.key)}
                                        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                                            reportView === item.key
                                                ? "bg-sky-500 text-white"
                                                : "text-slate-600 hover:bg-white"
                                        }`}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </section>

                    {reportView === "technician" && (
                        <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                            <h2 className="text-lg font-semibold text-slate-900">
                                Report Per Teknisi
                            </h2>
                            <p className="text-sm text-slate-500">
                                {technicianRows.length} teknisi pada{" "}
                                {periodLabel}
                            </p>
                        </div>
                        <div className="mt-4 overflow-x-auto">
                            <table className="min-w-full text-left text-sm">
                                <thead className="text-xs uppercase text-slate-500">
                                    <tr className="border-b border-slate-200">
                                        <th className="px-3 py-3">Teknisi</th>
                                        <th className="px-3 py-3">Request</th>
                                        <th className="px-3 py-3">Requested</th>
                                        <th className="px-3 py-3">Approved</th>
                                        <th className="px-3 py-3">Realized</th>
                                        <th className="px-3 py-3">Remaining</th>
                                        <th className="px-3 py-3">Pending</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td
                                                colSpan={7}
                                                className="px-3 py-8 text-center text-slate-500"
                                            >
                                                Loading report...
                                            </td>
                                        </tr>
                                    ) : technicianRows.length ? (
                                        technicianRows.map((item) => (
                                            <tr
                                                key={item.technicianId}
                                                className="border-b border-slate-100"
                                            >
                                                <td className="px-3 py-3 font-semibold text-slate-900">
                                                    {getDisplayName(
                                                        item.technician,
                                                    )}
                                                </td>
                                                <td className="px-3 py-3 text-slate-700">
                                                    {item.requestCount}
                                                </td>
                                                <td className="px-3 py-3 text-slate-700">
                                                    {formatCurrency(
                                                        item.requested,
                                                    )}
                                                </td>
                                                <td className="px-3 py-3 text-slate-700">
                                                    {formatCurrency(
                                                        item.approved,
                                                    )}
                                                </td>
                                                <td className="px-3 py-3 text-slate-700">
                                                    {formatCurrency(
                                                        item.realized,
                                                    )}
                                                </td>
                                                <td className="px-3 py-3 font-semibold text-slate-900">
                                                    {formatCurrency(
                                                        item.remaining,
                                                    )}
                                                </td>
                                                <td className="px-3 py-3 text-slate-700">
                                                    {formatCurrency(
                                                        item.pending,
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td
                                                colSpan={7}
                                                className="px-3 py-8 text-center text-slate-500"
                                            >
                                                Tidak ada data teknisi pada
                                                periode ini.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        </section>
                    )}

                    {reportView === "overall" && (
                        <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                            <h2 className="text-lg font-semibold text-slate-900">
                                Accommodation Report
                            </h2>
                            <p className="text-sm text-slate-500">
                                {reportRows.length} request pada{" "}
                                {periodLabel}
                            </p>
                        </div>
                        <div className="mt-4 overflow-x-auto">
                            <table className="min-w-full text-left text-sm">
                                <thead className="text-xs uppercase text-slate-500">
                                    <tr className="border-b border-slate-200">
                                        <th className="px-3 py-3">Technician</th>
                                        <th className="px-3 py-3">
                                            Request Title
                                        </th>
                                        <th className="px-3 py-3">Requested</th>
                                        <th className="px-3 py-3">Approved</th>
                                        <th className="px-3 py-3">Realized</th>
                                        <th className="px-3 py-3">Remaining</th>
                                        <th className="px-3 py-3">Status</th>
                                        <th className="px-3 py-3">
                                            Days Since Approval
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td
                                                colSpan={8}
                                                className="px-3 py-8 text-center text-slate-500"
                                            >
                                                Loading report...
                                            </td>
                                        </tr>
                                    ) : reportRows.length ? (
                                        reportRows.map((item) => (
                                            <tr
                                                key={item.id}
                                                onClick={() =>
                                                    setSelectedRequestId(item.id)
                                                }
                                                className="cursor-pointer border-b border-slate-100 hover:bg-sky-50"
                                            >
                                                <td className="px-3 py-3 text-slate-700">
                                                    {getDisplayName(
                                                        item.technician,
                                                    )}
                                                </td>
                                                <td className="px-3 py-3 font-semibold text-slate-900">
                                                    {item.request_title}
                                                    <p className="mt-1 text-xs font-normal text-slate-500">
                                                        {formatDate(
                                                            item.reviewed_at,
                                                        )}
                                                    </p>
                                                </td>
                                                <td className="px-3 py-3 text-slate-700">
                                                    {formatCurrency(
                                                        item.requested_amount,
                                                    )}
                                                </td>
                                                <td className="px-3 py-3 text-slate-700">
                                                    {item.approved_amount
                                                        ? formatCurrency(
                                                              item.approved_amount,
                                                          )
                                                        : "-"}
                                                </td>
                                                <td className="px-3 py-3 text-slate-700">
                                                    {formatCurrency(
                                                        item.totalRealized,
                                                    )}
                                                </td>
                                                <td className="px-3 py-3 text-slate-700">
                                                    {item.approved_amount
                                                        ? formatCurrency(
                                                              item.remainingAmount,
                                                          )
                                                        : "-"}
                                                </td>
                                                <td className="px-3 py-3">
                                                    <span
                                                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                                            STATUS_STYLES[
                                                                item.status
                                                            ] ??
                                                            STATUS_STYLES.pending
                                                        }`}
                                                    >
                                                        {STATUS_LABELS[
                                                            item.status
                                                        ] ?? item.status}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-slate-700">
                                                    {daysSince(item.reviewed_at)}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td
                                                colSpan={8}
                                                className="px-3 py-8 text-center text-slate-500"
                                            >
                                                Tidak ada data accommodation
                                                pada periode ini.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        </section>
                    )}
                </main>
            </div>
            {selectedRequest && (
                <ReportDetailDrawer
                    request={selectedRequest}
                    onPreview={openImagePreview}
                    onClose={() => setSelectedRequestId(null)}
                />
            )}
            {imagePreview.open && (
                <ImagePreviewModal
                    title={`Preview Foto ${imagePreview.label}`}
                    src={imagePreview.url}
                    alt={`Foto ${imagePreview.label}`}
                    onClose={() =>
                        setImagePreview({ open: false, url: "", label: "" })
                    }
                />
            )}
            <MobileBottomNav />
        </div>
    );
}

function ReportDetailDrawer({ request, onClose, onPreview }) {
    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
            <button
                type="button"
                className="hidden flex-1 md:block"
                aria-label="Close detail"
                onClick={onClose}
            />
            <aside className="h-full w-full overflow-y-auto bg-white p-4 shadow-2xl md:max-w-2xl md:p-6">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-semibold text-slate-900">
                            {request.request_title}
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                            {getDisplayName(request.technician)} •{" "}
                            {formatDate(request.created_at)}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="mt-4">
                    <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            STATUS_STYLES[request.status] ??
                            STATUS_STYLES.pending
                        }`}
                    >
                        {STATUS_LABELS[request.status] ?? request.status}
                    </span>
                </div>

                <section className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <DetailMetric
                        label="Requested"
                        value={formatCurrency(request.requested_amount)}
                    />
                    <DetailMetric
                        label="Approved"
                        value={
                            request.approved_amount
                                ? formatCurrency(request.approved_amount)
                                : "-"
                        }
                    />
                    <DetailMetric
                        label="Remaining"
                        value={
                            request.approved_amount
                                ? formatCurrency(request.remainingAmount)
                                : "-"
                        }
                    />
                </section>

                <section className="mt-5 rounded-2xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold uppercase text-slate-500">
                        Request Information
                    </h3>
                    <div className="mt-3 grid gap-2 text-sm text-slate-700">
                        <p>
                            <span className="font-medium">Purpose:</span>{" "}
                            {request.purpose}
                        </p>
                        <p>
                            <span className="font-medium">Customer:</span>{" "}
                            {getAccommodationCustomerLabel(request)}
                        </p>
                        <p>
                            <span className="font-medium">Project:</span>{" "}
                            {getAccommodationProjectLabel(request)}
                        </p>
                        <p>
                            <span className="font-medium">Request Date:</span>{" "}
                            {formatDate(request.requested_at)}
                        </p>
                    </div>
                </section>

                <section className="mt-4 rounded-2xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold uppercase text-slate-500">
                        Approval Information
                    </h3>
                    <div className="mt-3 grid gap-2 text-sm text-slate-700">
                        <p>
                            <span className="font-medium">Reviewed By:</span>{" "}
                            {getDisplayName(request.reviewer)}
                        </p>
                        <p>
                            <span className="font-medium">Reviewed At:</span>{" "}
                            {formatDate(request.reviewed_at)}
                        </p>
                        {request.rejection_reason && (
                            <p>
                                <span className="font-medium">
                                    Rejection Reason:
                                </span>{" "}
                                {request.rejection_reason}
                            </p>
                        )}
                        {request.transfer_proof_url && (
                            <button
                                type="button"
                                onClick={() =>
                                    onPreview(
                                        request.transfer_proof_url,
                                        "Transfer Proof",
                                    )
                                }
                                className="inline-flex w-fit items-center gap-2 rounded-xl border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-700 no-underline hover:bg-sky-50"
                            >
                                <FileImage size={16} />
                                Preview Transfer Proof
                            </button>
                        )}
                    </div>
                </section>

                <section className="mt-4 rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold uppercase text-slate-500">
                            Receipt List
                        </h3>
                        <span className="text-sm font-semibold text-slate-700">
                            {formatCurrency(request.totalRealized)}
                        </span>
                    </div>
                    <div className="mt-3 space-y-3">
                        {request.realizations?.length ? (
                            request.realizations.map((item) => (
                                <div
                                    key={item.id}
                                    className="rounded-xl border border-slate-200 p-3"
                                >
                                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                        <div>
                                            <p className="font-semibold text-slate-900">
                                                {formatCurrency(item.amount)}
                                            </p>
                                            <p className="text-sm text-slate-500">
                                                {formatDate(
                                                    item.transaction_date,
                                                )}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                onPreview(
                                                    item.receipt_photo_url,
                                                    "Receipt",
                                                )
                                            }
                                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 no-underline hover:bg-slate-50"
                                        >
                                            <FileImage size={16} />
                                            Preview Receipt
                                        </button>
                                    </div>
                                    <p className="mt-2 text-sm text-slate-600">
                                        {item.description ?? "-"}
                                    </p>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-slate-500">
                                Belum ada bukti realisasi.
                            </p>
                        )}
                    </div>
                </section>
            </aside>
        </div>
    );
}

function DetailMetric({ label, value }) {
    return (
        <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">
                {label}
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
        </div>
    );
}
