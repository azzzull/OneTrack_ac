import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ArrowLeft,
    Download,
    Filter,
    Loader,
    Search,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
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
    LOAN_STATUS_LABELS,
    LOAN_STATUS_STYLES,
    formatCurrency,
    getDisplayName,
    loadLoanRequesters,
    loadLoans,
} from "../../services/loanService";

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
    const dateKey = toDateKey(row.needed_date);
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

const SummaryCard = ({ label, value, tone = "sky", className = "" }) => {
    const toneClass =
        {
            sky: {
                card: "bg-blue-50 border-blue-200",
                label: "text-blue-600",
                value: "text-blue-900",
            },
            amber: {
                card: "bg-yellow-50 border-yellow-200",
                label: "text-yellow-600",
                value: "text-yellow-900",
            },
            emerald: {
                card: "bg-green-50 border-green-200",
                label: "text-green-600",
                value: "text-green-900",
            },
            red: {
                card: "bg-red-50 border-red-200",
                label: "text-red-600",
                value: "text-red-900",
            },
            slate: {
                card: "bg-purple-50 border-purple-200",
                label: "text-purple-600",
                value: "text-purple-900",
            },
        }[tone] ?? {
            card: "bg-blue-50 border-blue-200",
            label: "text-blue-600",
            value: "text-blue-900",
        };

    return (
        <div
            className={`rounded-2xl border-2 p-4 ${toneClass.card} ${className}`}
        >
            <p className={`text-sm font-medium ${toneClass.label}`}>
                {label}
            </p>
            <p
                className={`mt-2 break-words text-3xl font-bold ${toneClass.value}`}
            >
                {value}
            </p>
        </div>
    );
};

export default function LoanReports() {
    const { collapsed, toggle } = useSidebarCollapsed();
    const { user, role } = useAuth();
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [requesters, setRequesters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [filters, setFilters] = useState({
        period: "month",
        dateFrom: "",
        dateTo: "",
        requesterId: "",
        status: "all",
        search: "",
    });
    const channelRef = useRef(null);

    const loadData = useCallback(async () => {
        if (!user?.id || !role) return;
        setLoading(true);
        setError("");
        try {
            const [loans, requesterRows] = await Promise.all([
                loadLoans({ role, userId: user.id }),
                loadLoanRequesters(),
            ]);
            setRows(loans);
            setRequesters(requesterRows);
        } catch (loadError) {
            console.error("Loan reports load failed:", loadError);
            setError(loadError.message || "Gagal memuat report pinjaman.");
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [role, user?.id]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        if (!user?.id) return undefined;
        const channelName = createUniqueChannelName(
            "loan-reports",
            user.id,
        );
        channelRef.current = supabase
            .channel(channelName)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "loans" },
                loadData,
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "loan_attachments",
                },
                loadData,
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "loan_repayments",
                },
                loadData,
            )
            .subscribe();

        return () => {
            if (channelRef.current) supabase.removeChannel(channelRef.current);
        };
    }, [loadData, user?.id]);

    const filteredRows = useMemo(() => {
        const search = filters.search.trim().toLowerCase();
        return rows.filter((row) => {
            if (filters.status !== "all" && row.status !== filters.status) {
                return false;
            }
            if (filters.requesterId && row.requester_id !== filters.requesterId) {
                return false;
            }
            if (!matchesPeriod(row, filters)) return false;
            if (search) {
                const text = [
                    getDisplayName(row.requester),
                    row.description,
                    row.loan_amount,
                    row.approved_amount,
                    row.paid_amount,
                    row.remaining_amount,
                    LOAN_STATUS_LABELS[row.status],
                ]
                    .join(" ")
                    .toLowerCase();
                if (!text.includes(search)) return false;
            }
            return true;
        });
    }, [filters, rows]);

    const summary = useMemo(() => {
        const result = {
            total: filteredRows.length,
            pending: 0,
            approved: 0,
            rejected: 0,
            loanAmount: 0,
            approvedAmount: 0,
            paidAmount: 0,
            remainingAmount: 0,
        };
        for (const row of filteredRows) {
            if (result[row.status] !== undefined) result[row.status] += 1;
            result.loanAmount += Number(row.loan_amount ?? 0);
            result.approvedAmount += Number(row.approved_amount ?? 0);
            result.paidAmount += Number(row.paid_amount ?? 0);
            result.remainingAmount += Number(row.remaining_amount ?? 0);
        }
        return {
            ...result,
            difference: result.approvedAmount - result.paidAmount,
        };
    }, [filteredRows]);

    const exportExcel = async () => {
        const rowsForExcel = filteredRows.map((row, index) => {
            const loan = Number(row.loan_amount ?? 0);
            const approved = Number(row.approved_amount ?? 0);
            return {
                no: index + 1,
                id: row.id,
                requesterName: getDisplayName(row.requester),
                role: row.requester?.role ?? "-",
                createdAt: parseExcelDate(row.created_at),
                neededDate: parseExcelDate(row.needed_date),
                description: row.description,
                loanAmount: loan,
                approvedAmount: approved,
                paidAmount: Number(row.paid_amount ?? 0),
                remainingAmount: Number(row.remaining_amount ?? 0),
                difference: approved - Number(row.paid_amount ?? 0),
                status: LOAN_STATUS_LABELS[row.status] ?? row.status,
                approvedBy: getDisplayName(row.approver),
                approvedAt: parseExcelDate(row.approved_at),
                rejectionReason: row.rejection_reason || "-",
                approvalNote: row.approval_note || "-",
            };
        });

        await exportStyledExcel({
            fileName: makeExcelFileName(["pinjaman", todayKey().slice(0, 7)]),
            sheetName: "Pinjaman",
            title: "Laporan Pinjaman",
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
                { key: "id", header: "ID Pinjaman" },
                { key: "requesterName", header: "Nama Pengaju" },
                { key: "role", header: "Role" },
                { key: "createdAt", header: "Tanggal Pengajuan" },
                { key: "neededDate", header: "Tanggal Kebutuhan" },
                { key: "description", header: "Keterangan" },
                { key: "loanAmount", header: "Nominal Pinjaman" },
                { key: "approvedAmount", header: "Nominal Disetujui" },
                { key: "paidAmount", header: "Sudah Dibayar" },
                { key: "remainingAmount", header: "Sisa Hutang" },
                { key: "difference", header: "Sisa Dari Disetujui" },
                { key: "status", header: "Status" },
                { key: "approvedBy", header: "Approved By" },
                { key: "approvedAt", header: "Tanggal Approval" },
                { key: "rejectionReason", header: "Alasan Penolakan" },
                { key: "approvalNote", header: "Catatan Approval" },
            ],
            rows: rowsForExcel,
            dateKeys: ["createdAt", "neededDate", "approvedAt"],
            currencyKeys: [
                "loanAmount",
                "approvedAmount",
                "paidAmount",
                "remainingAmount",
                "difference",
            ],
            wrapKeys: ["description", "rejectionReason", "approvalNote"],
            summaryRows: [
                ["Total Nominal Pinjaman", summary.loanAmount, "currency"],
                ["Total Nominal Disetujui", summary.approvedAmount, "currency"],
                ["Total Sudah Dibayar", summary.paidAmount, "currency"],
                ["Total Sisa Hutang", summary.remainingAmount, "currency"],
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
                                onClick={() => navigate("/loans")}
                                className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-sky-600"
                            >
                                <ArrowLeft size={16} />
                                Pinjaman
                            </button>
                            <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">
                                Report Pinjaman
                            </h1>
                            <p className="mt-1 text-sm text-slate-600">
                                Ringkasan dan data pinjaman berdasarkan filter.
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

                    <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
                        <SummaryCard label="Total Pinjaman" value={summary.total} />
                        <SummaryCard
                            label="Pending"
                            value={summary.pending}
                            tone="amber"
                        />
                        <SummaryCard
                            label="Approved"
                            value={summary.approved}
                            tone="emerald"
                        />
                        <SummaryCard
                            label="Rejected"
                            value={summary.rejected}
                            tone="red"
                        />
                        <SummaryCard
                            label="Nominal Pinjaman"
                            value={formatCurrency(summary.loanAmount)}
                            className="col-span-2 md:col-span-1"
                        />
                        <SummaryCard
                            label="Disetujui"
                            value={formatCurrency(summary.approvedAmount)}
                            tone="emerald"
                            className="col-span-2 md:col-span-1"
                        />
                        <SummaryCard
                            label="Dibayar"
                            value={formatCurrency(summary.paidAmount)}
                            tone="sky"
                            className="col-span-2 md:col-span-1"
                        />
                        <SummaryCard
                            label="Sisa Hutang"
                            value={formatCurrency(summary.remainingAmount)}
                            tone="amber"
                            className="col-span-2 md:col-span-1"
                        />
                        <SummaryCard
                            label="Sisa Dari Disetujui"
                            value={formatCurrency(summary.difference)}
                            tone="slate"
                            className="col-span-2 md:col-span-1"
                        />
                    </div>

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

                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        {loading ? (
                            <div className="flex items-center justify-center gap-2 p-8 text-slate-600">
                                <Loader size={18} className="animate-spin" />
                                Memuat data...
                            </div>
                        ) : filteredRows.length === 0 ? (
                            <div className="p-8 text-center text-sm text-slate-500">
                                Tidak ada data pinjaman.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="border-b border-slate-200 bg-slate-100 text-left text-slate-700">
                                        <tr>
                                            <th className="px-4 py-3">Pengaju</th>
                                            <th className="px-4 py-3">
                                                Tanggal Kebutuhan
                                            </th>
                                            <th className="px-4 py-3">
                                                Keterangan
                                            </th>
                                            <th className="px-4 py-3">Pinjaman</th>
                                            <th className="px-4 py-3">
                                                Disetujui
                                            </th>
                                            <th className="px-4 py-3">
                                                Dibayar
                                            </th>
                                            <th className="px-4 py-3">
                                                Sisa Hutang
                                            </th>
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3">
                                                Approved By
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredRows.map((row) => (
                                            <tr
                                                key={row.id}
                                                className="hover:bg-slate-50"
                                            >
                                                <td className="px-4 py-3 font-semibold text-slate-900">
                                                    {getDisplayName(row.requester)}
                                                </td>
                                                <td className="px-4 py-3 text-slate-700">
                                                    {formatDate(row.needed_date)}
                                                </td>
                                                <td className="max-w-xs px-4 py-3 text-slate-700">
                                                    <span className="line-clamp-2">
                                                        {row.description}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 font-semibold text-slate-900">
                                                    {formatCurrency(row.loan_amount)}
                                                </td>
                                                <td className="px-4 py-3 font-semibold text-slate-900">
                                                    {row.approved_amount
                                                        ? formatCurrency(
                                                              row.approved_amount,
                                                          )
                                                        : "-"}
                                                </td>
                                                <td className="px-4 py-3 font-semibold text-slate-900">
                                                    {formatCurrency(row.paid_amount)}
                                                </td>
                                                <td className="px-4 py-3 font-semibold text-slate-900">
                                                    {row.approved_amount
                                                        ? formatCurrency(
                                                              row.remaining_amount,
                                                          )
                                                        : "-"}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span
                                                        className={`rounded-full px-2 py-1 text-xs font-semibold ${LOAN_STATUS_STYLES[row.status]}`}
                                                    >
                                                        {
                                                            LOAN_STATUS_LABELS[
                                                                row.status
                                                            ]
                                                        }
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-slate-700">
                                                    {getDisplayName(row.approver)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </main>
            </div>
            <MobileBottomNav />
        </div>
    );
}
