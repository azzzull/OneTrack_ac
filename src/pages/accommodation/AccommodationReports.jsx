import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, Clock3, Download, Receipt, Wallet } from "lucide-react";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import { useAuth } from "../../context/useAuth";
import {
    STATUS_LABELS,
    STATUS_STYLES,
    formatCurrency,
    getDisplayName,
    loadAccommodationRequests,
} from "../../services/accommodationService";

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
    return date.toISOString().slice(0, 10);
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

    const loadData = useCallback(async () => {
        try {
            const data = await loadAccommodationRequests({
                role,
                userId: user?.id,
            });
            setRequests(data);
        } catch (error) {
            console.error("Accommodation reports load failed:", error);
            setRequests([]);
        } finally {
            setLoading(false);
        }
    }, [role, user?.id]);

    useEffect(() => {
        loadData();
    }, [loadData]);

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

    const outstandingRows = useMemo(
        () =>
            filteredRequests.filter(
                (item) =>
                    Number(item.approved_amount ?? 0) > 0 &&
                    Number(item.remainingAmount ?? 0) > 0,
            ),
        [filteredRequests],
    );

    const exportCsv = () => {
        const headers = [
            "Technician",
            "Request Title",
            "Approved Amount",
            "Realized Amount",
            "Remaining Amount",
            "Status",
            "Days Since Approval",
        ];
        const lines = [headers.map(toCsvCell).join(",")];

        for (const row of outstandingRows) {
            lines.push(
                [
                    getDisplayName(row.technician),
                    row.request_title,
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
                                <Download size={16} />
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
                        <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                            <h2 className="text-lg font-semibold text-slate-900">
                                Outstanding Report
                            </h2>
                            <p className="text-sm text-slate-500">
                                {filteredRequests.length} request pada{" "}
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
                                                colSpan={7}
                                                className="px-3 py-8 text-center text-slate-500"
                                            >
                                                Loading report...
                                            </td>
                                        </tr>
                                    ) : outstandingRows.length ? (
                                        outstandingRows.map((item) => (
                                            <tr
                                                key={item.id}
                                                className="border-b border-slate-100"
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
                                                        item.approved_amount,
                                                    )}
                                                </td>
                                                <td className="px-3 py-3 text-slate-700">
                                                    {formatCurrency(
                                                        item.totalRealized,
                                                    )}
                                                </td>
                                                <td className="px-3 py-3 text-slate-700">
                                                    {formatCurrency(
                                                        item.remainingAmount,
                                                    )}
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
                                                colSpan={7}
                                                className="px-3 py-8 text-center text-slate-500"
                                            >
                                                Tidak ada outstanding cash
                                                advance.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </main>
            </div>
            <MobileBottomNav />
        </div>
    );
}
