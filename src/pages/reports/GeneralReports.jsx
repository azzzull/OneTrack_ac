import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Banknote,
    Download,
    FileImage,
    FileSpreadsheet,
    Filter,
    Layers3,
    Loader,
    Receipt,
    Search,
    Wallet,
    XCircle,
} from "lucide-react";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import ImagePreviewModal from "../../components/ImagePreviewModal";
import ReportSummaryCard from "../../components/reports/ReportSummaryCard";
import CustomSelect from "../../components/ui/CustomSelect";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import { useAuth } from "../../context/useAuth";
import supabase from "../../supabaseClient";
import {
    formatCurrency,
    getDisplayName,
} from "../../services/accommodationService";
import { loadGeneralReportData } from "../../services/generalReportService";
import { createUniqueChannelName } from "../../utils/realtimeChannelManager";
import {
    exportCsv,
    exportStyledExcel,
    makeCsvFileName,
    makeExcelFileName,
    parseExcelDate,
} from "../../utils/excelExport";

const getYear = () => String(new Date().getFullYear());

const getDateKey = (value) => {
    const rawValue = String(value ?? "").trim();
    const datePart = rawValue.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    if (datePart) return datePart;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const formatDate = (value) => {
    const dateKey = getDateKey(value);
    if (!dateKey) return "-";

    return new Date(`${dateKey}T00:00:00`).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
};

const categoryLabel = (category) =>
    category === "accommodation" ? "Akomodasi" : "Reimburse";

const getBusinessTripLabel = (row) =>
    [row.businessTripNo, row.businessTripTitle].filter(Boolean).join(" · ");

const isImageUrl = (url) =>
    /\.(png|jpe?g|webp|gif|bmp|avif|svg)(\?.*)?$/i.test(String(url ?? ""));

const PREVIEW_ROWS = [
    {
        id: "preview-accommodation-realized",
        category: "accommodation",
        date: "2026-09-24",
        employee: { first_name: "Arif Syaiful Rachman", role: "technician" },
        employeeId: "preview-arif",
        amount: 4200000,
        approvedAmount: 4000000,
        approvedBy: { first_name: "Dewi Putri", role: "management" },
        actualAmount: 3850000,
        businessTripNo: "BT-26092403",
        businessTripTitle: "Commissioning Unit B",
        description: "Akomodasi dan transportasi perjalanan dinas",
        projectName: "Terminal Fuel Unit B",
        status: "realized",
        statusGroup: "completed",
    },
    {
        id: "preview-reimbursement-paid",
        category: "reimbursement",
        date: "2026-10-09",
        employee: { first_name: "Syifa Ali Zulkarnain", role: "admin" },
        employeeId: "preview-syifa",
        amount: 450000,
        approvedAmount: 450000,
        approvedBy: { first_name: "Dewi Putri", role: "management" },
        actualAmount: 450000,
        businessTripNo: "",
        businessTripTitle: "",
        description: "Pembelian perlengkapan administrasi",
        projectName: "-",
        status: "approved",
        statusGroup: "completed",
    },
    {
        id: "preview-reimbursement-approved",
        category: "reimbursement",
        date: "2026-10-13",
        employee: { first_name: "Mustofa", role: "technician" },
        employeeId: "preview-mustofa",
        amount: 275000,
        approvedAmount: 250000,
        approvedBy: { first_name: "Dewi Putri", role: "management" },
        actualAmount: 0,
        businessTripNo: "",
        businessTripTitle: "",
        description: "Biaya operasional teknisi",
        projectName: "-",
        status: "approved",
        statusGroup: "approved",
    },
];

export default function GeneralReports({ preview = false }) {
    const { collapsed, toggle } = useSidebarCollapsed();
    const { role, user } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [transferPreview, setTransferPreview] = useState({
        src: "",
        title: "",
    });
    const [filters, setFilters] = useState({
        year: getYear(),
        category: "all",
        employeeId: "",
        search: "",
    });
    const channelRef = useRef(null);
    const isMountedRef = useRef(true);
    const userId = user?.id;
    const previewMode = preview && import.meta.env.DEV;

    const loadData = useCallback(async () => {
        if (previewMode) {
            setRows(PREVIEW_ROWS);
            setLoading(false);
            return;
        }
        if (!role || !userId) return;

        setLoading(true);
        setError("");
        try {
            const records = await loadGeneralReportData({ role, userId });
            if (isMountedRef.current) setRows(records);
        } catch (loadError) {
            console.error("General reports load failed:", loadError);
            if (isMountedRef.current) {
                setRows([]);
                setError(loadError.message || "Gagal memuat laporan umum.");
            }
        } finally {
            if (isMountedRef.current) setLoading(false);
        }
    }, [previewMode, role, userId]);

    useEffect(() => {
        isMountedRef.current = true;
        queueMicrotask(loadData);
        return () => {
            isMountedRef.current = false;
        };
    }, [loadData]);

    useEffect(() => {
        if (previewMode || !userId) return undefined;

        const channelName = createUniqueChannelName("general-reports", userId);
        channelRef.current = supabase
            .channel(channelName)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "accommodation_requests" },
                loadData,
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "accommodation_realizations" },
                loadData,
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "business_trips" },
                loadData,
            )
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
                    table: "reimbursement_payment_batches",
                },
                loadData,
            )
            .subscribe();

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [loadData, previewMode, userId]);

    const employeeOptions = useMemo(() => {
        const employees = new Map();
        rows.forEach((row) => {
            if (!row.employeeId || employees.has(row.employeeId)) return;
            employees.set(row.employeeId, {
                value: row.employeeId,
                label: getDisplayName(row.employee),
            });
        });

        return [...employees.values()].sort((left, right) =>
            left.label.localeCompare(right.label, "id"),
        );
    }, [rows]);

    const filteredRows = useMemo(() => {
        const keyword = filters.search.trim().toLowerCase();
        return rows.filter((row) => {
            const dateKey = getDateKey(row.date);
            if (filters.year && !dateKey.startsWith(`${filters.year}-`)) {
                return false;
            }
            if (
                filters.category !== "all" &&
                row.category !== filters.category
            ) {
                return false;
            }
            if (filters.employeeId && row.employeeId !== filters.employeeId) {
                return false;
            }
            if (!keyword) return true;

            return [
                categoryLabel(row.category),
                getDisplayName(row.employee),
                getDisplayName(row.approvedBy),
                row.projectName,
                row.businessTripNo,
                row.businessTripTitle,
                row.description,
            ]
                .join(" ")
                .toLowerCase()
                .includes(keyword);
        });
    }, [filters, rows]);

    const summary = useMemo(
        () =>
            filteredRows.reduce(
                (result, row) => {
                    result.total += 1;
                    result[row.category] += 1;
                    result.approved += row.approvedAmount;
                    return result;
                },
                {
                    total: 0,
                    accommodation: 0,
                    reimbursement: 0,
                    approved: 0,
                },
            ),
        [filteredRows],
    );

    const periodLabel = filters.year ? `Tahun ${filters.year}` : "Semua tahun";
    const selectedEmployeeLabel =
        employeeOptions.find((item) => item.value === filters.employeeId)
            ?.label ?? "Semua karyawan";

    const openTransferProof = (url, title) => {
        if (!url) return;
        if (isImageUrl(url)) {
            setTransferPreview({ src: url, title });
            return;
        }
        window.open(url, "_blank", "noopener,noreferrer");
    };

    const exportColumns = [
        { key: "date", header: "Tanggal" },
        { key: "category", header: "Kategori" },
        { key: "employee", header: "Karyawan" },
        { key: "project", header: "Project" },
        { key: "businessTrip", header: "Business Trip" },
        { key: "description", header: "Judul / Keterangan" },
        { key: "approvedAmount", header: "Nominal Disetujui" },
        { key: "approvedBy", header: "Approved By" },
        { key: "transferProof", header: "Bukti Transfer" },
    ];

    const exportRows = useMemo(
        () =>
            filteredRows.map((row) => ({
                date: getDateKey(row.date),
                category: categoryLabel(row.category),
                employee: getDisplayName(row.employee),
                project: row.projectName,
                businessTrip: getBusinessTripLabel(row) || "-",
                description: row.description,
                approvedAmount: row.approvedAmount,
                approvedBy: getDisplayName(row.approvedBy),
                transferProof: row.transferProofUrl || "-",
            })),
        [filteredRows],
    );

    const exportReport = async (type) => {
        if (exportRows.length === 0) {
            window.alert("Tidak ada data laporan untuk diunduh.");
            return;
        }

        const filterRows = [
            ["Periode", periodLabel],
            [
                "Kategori",
                filters.category === "all"
                    ? "Semua kategori"
                    : categoryLabel(filters.category),
            ],
            ["Karyawan", selectedEmployeeLabel],
            ["Tanggal Export", new Date()],
        ];

        if (type === "csv") {
            exportCsv({
                columns: exportColumns,
                fileName: makeCsvFileName(["General Report", periodLabel]),
                rows: exportRows,
            });
            return;
        }

        try {
            await exportStyledExcel({
                fileName: makeExcelFileName(["General Report", periodLabel]),
                sheetName: "General Report",
                title: "General Report OneTrack",
                filterRows,
                columns: exportColumns,
                rows: exportRows.map((row) => ({
                    ...row,
                    date: parseExcelDate(row.date),
                })),
                summaryTitle: "Ringkasan Laporan",
                summaryRows: [
                    ["Total Baris", summary.total],
                    ["Total Akomodasi", summary.accommodation],
                    ["Total Reimburse", summary.reimbursement],
                    ["Total Nominal Disetujui", summary.approved, "currency"],
                ],
                dateKeys: ["date"],
                currencyKeys: ["approvedAmount"],
                wrapKeys: [
                    "project",
                    "businessTrip",
                    "description",
                    "transferProof",
                ],
            });
        } catch (exportError) {
            console.error("General report Excel export failed:", exportError);
            window.alert("Gagal menyiapkan file Excel. Silakan coba lagi.");
        }
    };

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="flex min-h-screen">
                <Sidebar collapsed={collapsed} onToggle={toggle} />
                <main className="min-w-0 flex-1 p-4 pb-24 md:p-8 md:pb-8">
                    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">
                                General Report
                            </h1>
                            <p className="mt-1 text-sm text-slate-600">
                                Laporan tahunan gabungan akomodasi dan reimburse
                                yang telah memiliki nominal disetujui.
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <button
                                type="button"
                                onClick={() => exportReport("csv")}
                                disabled={filteredRows.length === 0}
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                            >
                                <Download size={16} />
                                Download CSV
                            </button>
                            <button
                                type="button"
                                onClick={() => exportReport("excel")}
                                disabled={filteredRows.length === 0}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                                <FileSpreadsheet size={16} />
                                Download Excel
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                            {error}
                        </div>
                    )}

                    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                            <Filter size={16} />
                            Filter laporan
                        </div>
                        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <label className="block">
                                <span className="mb-1 block text-xs font-medium text-slate-500">
                                    Tahun
                                </span>
                                <input
                                    type="number"
                                    min="2020"
                                    max="2100"
                                    value={filters.year}
                                    onChange={(event) =>
                                        setFilters((previous) => ({
                                            ...previous,
                                            year: event.target.value,
                                        }))
                                    }
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-300"
                                />
                            </label>
                            <label className="block">
                                <span className="block text-xs font-medium text-slate-500">
                                    Kategori
                                </span>
                                <CustomSelect
                                    value={filters.category}
                                    onChange={(value) =>
                                        setFilters((previous) => ({
                                            ...previous,
                                            category: value,
                                        }))
                                    }
                                    options={[
                                        { value: "all", label: "Semua kategori" },
                                        {
                                            value: "accommodation",
                                            label: "Akomodasi",
                                        },
                                        {
                                            value: "reimbursement",
                                            label: "Reimburse",
                                        },
                                    ]}
                                />
                            </label>
                            <label className="block">
                                <span className="block text-xs font-medium text-slate-500">
                                    Karyawan
                                </span>
                                <CustomSelect
                                    value={filters.employeeId}
                                    onChange={(value) =>
                                        setFilters((previous) => ({
                                            ...previous,
                                            employeeId: value,
                                        }))
                                    }
                                    options={[
                                        {
                                            value: "",
                                            label: "Semua karyawan",
                                        },
                                        ...employeeOptions,
                                    ]}
                                />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-medium text-slate-500">
                                    Pencarian
                                </span>
                                <span className="relative block">
                                    <Search
                                        size={15}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                                    />
                                    <input
                                        type="search"
                                        value={filters.search}
                                        onChange={(event) =>
                                            setFilters((previous) => ({
                                                ...previous,
                                                search: event.target.value,
                                            }))
                                        }
                                        placeholder="Cari project, trip, atau keterangan"
                                        className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-300"
                                    />
                                </span>
                            </label>
                        </div>
                    </section>

                    <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <ReportSummaryCard
                            label="Total Laporan"
                            value={summary.total}
                            icon={Layers3}
                        />
                        <ReportSummaryCard
                            label="Akomodasi"
                            value={summary.accommodation}
                            icon={Wallet}
                        />
                        <ReportSummaryCard
                            label="Reimburse"
                            value={summary.reimbursement}
                            icon={Receipt}
                        />
                        <ReportSummaryCard
                            label="Total Nominal Disetujui"
                            value={formatCurrency(summary.approved)}
                            icon={Banknote}
                        />
                    </section>

                    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex flex-col gap-1 border-b border-slate-100 p-4 md:flex-row md:items-end md:justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">
                                    Detail Laporan
                                </h2>
                                <p className="mt-1 text-sm text-slate-500">
                                    {filteredRows.length} baris pada {periodLabel}. Untuk
                                    reimburse, periode memakai tanggal transaksi; untuk
                                    akomodasi, tanggal pengajuan.
                                </p>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="min-w-[60rem] w-full text-left text-sm">
                                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3">Tanggal</th>
                                        <th className="px-4 py-3">Kategori</th>
                                        <th className="px-4 py-3">Karyawan</th>
                                        <th className="px-4 py-3">Project / Business Trip</th>
                                        <th className="px-4 py-3">Judul / Keterangan</th>
                                        <th className="px-4 py-3 text-right">Disetujui</th>
                                        <th className="px-4 py-3">Approved By</th>
                                        <th className="px-4 py-3">Bukti Transfer</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {loading ? (
                                        <tr>
                                            <td
                                                colSpan={8}
                                                className="px-4 py-10 text-center text-slate-500"
                                            >
                                                <span className="inline-flex items-center gap-2">
                                                    <Loader
                                                        size={18}
                                                        className="animate-spin"
                                                    />
                                                    Memuat laporan...
                                                </span>
                                            </td>
                                        </tr>
                                    ) : filteredRows.length ? (
                                        filteredRows.map((row) => (
                                            <tr
                                                key={row.id}
                                                className="align-top hover:bg-slate-50"
                                            >
                                                <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                                                    {formatDate(row.date)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span
                                                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                                            row.category === "accommodation"
                                                                ? "bg-sky-100 text-sky-700"
                                                                : "bg-emerald-100 text-emerald-700"
                                                        }`}
                                                    >
                                                        {categoryLabel(row.category)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 font-medium text-slate-900">
                                                    {getDisplayName(row.employee)}
                                                </td>
                                                <td className="max-w-72 px-4 py-3 text-slate-700">
                                                    <p className="font-medium text-slate-900">
                                                        {row.projectName}
                                                    </p>
                                                    {getBusinessTripLabel(row) && (
                                                        <p className="mt-1 text-xs text-slate-500">
                                                            {getBusinessTripLabel(row)}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="max-w-80 px-4 py-3 text-slate-700">
                                                    {row.description}
                                                </td>
                                                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">
                                                    {formatCurrency(row.approvedAmount)}
                                                </td>
                                                <td className="px-4 py-3 text-slate-700">
                                                    {getDisplayName(row.approvedBy)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {row.transferProofUrl ? (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                openTransferProof(
                                                                    row.transferProofUrl,
                                                                    `Bukti transfer ${getDisplayName(
                                                                        row.employee,
                                                                    )}`,
                                                                )
                                                            }
                                                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                                                        >
                                                            <FileImage size={14} />
                                                            Lihat bukti
                                                        </button>
                                                    ) : (
                                                        <span className="text-slate-400">-</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td
                                                colSpan={8}
                                                className="px-4 py-10 text-center text-slate-500"
                                            >
                                                <span className="inline-flex items-center gap-2">
                                                    <XCircle size={18} />
                                                    Tidak ada data pada filter ini.
                                                </span>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </main>
            </div>
            <MobileBottomNav roleOverride={previewMode ? "admin" : undefined} />
            <ImagePreviewModal
                title={transferPreview.title}
                src={transferPreview.src}
                alt={transferPreview.title}
                onClose={() => setTransferPreview({ src: "", title: "" })}
            />
        </div>
    );
}
