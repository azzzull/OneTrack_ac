import { useEffect, useMemo, useState } from "react";
import { BarChart3, Download, FileSpreadsheet, Search } from "lucide-react";
import {
    exportBusinessTripReportRows,
    getBusinessTripReport,
    getBusinessTripReportSummary,
} from "../../services/businessTripService";
import { BUSINESS_TRIP_DB_STATUS_LABELS } from "../../services/businessTripTypes";
import {
    exportStyledExcel,
    makeExcelFileName,
    parseExcelDate,
} from "../../utils/excelExport";
import BusinessTripLayout from "./BusinessTripLayout";
import {
    Button,
    DetailRow,
    EmptyState,
    SectionCard,
    StatusBadge,
} from "./BusinessTripShared";
import { formatAccommodationAmount } from "./businessTripAccommodationModel";
import { businessTripUi } from "./businessTripUi";

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

const todayStamp = () => {
    const date = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
};

const statusOptions = [
    ["", "Semua Status"],
    ...Object.entries(BUSINESS_TRIP_DB_STATUS_LABELS),
];

const settlementOptions = [
    ["", "Semua Settlement"],
    ["none", "None"],
    ["not_required", "Tidak Ada Selisih"],
    ["pending_refund", "Menunggu Pengembalian"],
    ["pending_additional_payment", "Menunggu Pembayaran Kekurangan"],
    ["completed", "Completed"],
];

const summaryItems = [
    ["Total Business Trip", "total"],
    ["Requested Amount", "requestedAmount"],
    ["Disbursed Amount", "disbursedAmount"],
    ["Total Realisasi", "totalRealizationAmount"],
    ["Total Refund", "refundAmount"],
    ["Total Additional Payment", "additionalPaymentAmount"],
];

const formatSignedAmount = (value) => {
    const amount = Number(value ?? 0);
    if (!Number.isFinite(amount) || amount === 0) return "Rp 0";
    const prefix = amount < 0 ? "-" : "";
    return `${prefix}${formatAccommodationAmount(Math.abs(amount))}`;
};

export default function BusinessTripReportsPage() {
    const [filters, setFilters] = useState({
        ...getDefaultDates(),
        dateBasis: "created",
        projectId: "",
        requester: "",
        search: "",
        settlementStatus: "",
        sortMode: "newest",
        status: "",
    });
    const [page, setPage] = useState(1);
    const [rows, setRows] = useState([]);
    const [projects, setProjects] = useState([]);
    const [summary, setSummary] = useState({});
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState("");
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

    const reportFilters = useMemo(
        () => ({
            ...filters,
            page,
            pageSize: PAGE_SIZE,
        }),
        [filters, page],
    );

    useEffect(() => {
        const timeoutId = window.setTimeout(async () => {
            setLoading(true);
            setError("");
            try {
                const [report, nextSummary] = await Promise.all([
                    getBusinessTripReport(reportFilters),
                    getBusinessTripReportSummary(filters),
                ]);
                setRows(report.items);
                setProjects(report.projects);
                setTotalCount(report.total);
                setSummary(nextSummary);
            } catch (loadError) {
                console.error("[BusinessTripReports] load failed", loadError);
                setRows([]);
                setTotalCount(0);
                setError("Gagal memuat laporan Business Trip.");
            } finally {
                setLoading(false);
            }
        }, filters.search.trim() ? 350 : 0);
        return () => window.clearTimeout(timeoutId);
    }, [filters, reportFilters]);

    const updateFilter = (patch) => {
        setFilters((current) => ({ ...current, ...patch }));
        setPage(1);
    };

    const exportExcel = async () => {
        setExporting(true);
        try {
            const exportRows = await exportBusinessTripReportRows(filters);
            await exportStyledExcel({
                fileName: makeExcelFileName(["Business Trip Report", todayStamp()]),
                sheetName: "Business Trip Summary",
                title: "Laporan Business Trip",
                filterRows: [
                    ["Basis Tanggal", filters.dateBasis],
                    ["Tanggal Mulai", parseExcelDate(filters.startDate)],
                    ["Tanggal Selesai", parseExcelDate(filters.endDate)],
                    ["Status", filters.status || "Semua"],
                    ["Settlement", filters.settlementStatus || "Semua"],
                    ["Search", filters.search || "-"],
                ],
                columns: [
                    { key: "businessTripNo", header: "Business Trip No" },
                    { key: "requesterName", header: "Pemohon" },
                    { key: "projectLabel", header: "Project" },
                    { key: "title", header: "Judul Business Trip" },
                    { key: "createdAt", header: "Tanggal Pengajuan" },
                    { key: "tripDateLabel", header: "Tanggal Business Trip" },
                    { key: "initiatorName", header: "Inisiator" },
                    { key: "status", header: "Status" },
                    { key: "requestedAmount", header: "Requested Amount" },
                    { key: "disbursedAmount", header: "Disbursed Amount" },
                    { key: "totalRealizationAmount", header: "Total Realisasi" },
                    { key: "settlementDifference", header: "Selisih" },
                    { key: "settlementStatus", header: "Status Settlement" },
                    { key: "completedAt", header: "Tanggal Selesai" },
                    { key: "agendaCount", header: "Jumlah Agenda" },
                    { key: "photoCount", header: "Jumlah Foto" },
                ],
                rows: exportRows.map((row) => ({
                    ...row,
                    createdAt: parseExcelDate(row.createdAt),
                    completedAt: parseExcelDate(row.completedAt),
                })),
                dateKeys: ["createdAt", "completedAt"],
                currencyKeys: [
                    "requestedAmount",
                    "disbursedAmount",
                    "totalRealizationAmount",
                    "settlementDifference",
                ],
                wrapKeys: ["projectLabel", "title"],
                summaryRows: [
                    ["Total Business Trip", summary.total ?? 0],
                    ["Total Requested Amount", summary.requestedAmount ?? 0, "currency"],
                    ["Total Disbursed Amount", summary.disbursedAmount ?? 0, "currency"],
                    [
                        "Total Realization Amount",
                        summary.totalRealizationAmount ?? 0,
                        "currency",
                    ],
                    ["Total Refund", summary.refundAmount ?? 0, "currency"],
                    [
                        "Total Additional Payment",
                        summary.additionalPaymentAmount ?? 0,
                        "currency",
                    ],
                ],
            });
        } catch (exportError) {
            console.error("[BusinessTripReports] export failed", exportError);
            setError("Gagal mengekspor laporan.");
        } finally {
            setExporting(false);
        }
    };

    return (
        <BusinessTripLayout
            title="Laporan Business Trip"
            showBack={false}
            action={
                <Button
                    icon={Download}
                    onClick={exportExcel}
                    disabled={exporting || loading}
                    className="min-w-28"
                >
                    {exporting ? "Export..." : "Export"}
                </Button>
            }
        >
            <div className={businessTripUi.pageGap}>
                <section className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 md:mx-0 md:grid md:grid-cols-3 md:px-0">
                    {summaryItems.map(([label, key]) => (
                        <div
                            key={key}
                            className="min-w-40 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                        >
                            <p className="text-xs font-semibold text-slate-500">
                                {label}
                            </p>
                            <p className="mt-1 text-base font-bold text-slate-950">
                                {key === "total"
                                    ? summary[key] ?? 0
                                    : formatAccommodationAmount(summary[key] ?? 0)}
                            </p>
                        </div>
                    ))}
                </section>

                <SectionCard icon={BarChart3} title="Filter Laporan">
                    <div className="grid gap-2 md:grid-cols-3">
                        <select
                            value={filters.dateBasis}
                            onChange={(event) =>
                                updateFilter({ dateBasis: event.target.value })
                            }
                            className={businessTripUi.input}
                        >
                            <option value="created">Tanggal Pengajuan</option>
                            <option value="trip">Tanggal Business Trip</option>
                            <option value="completed">Tanggal Selesai</option>
                        </select>
                        <input
                            type="date"
                            value={filters.startDate}
                            onChange={(event) =>
                                updateFilter({ startDate: event.target.value })
                            }
                            className={businessTripUi.input}
                        />
                        <input
                            type="date"
                            value={filters.endDate}
                            onChange={(event) =>
                                updateFilter({ endDate: event.target.value })
                            }
                            className={businessTripUi.input}
                        />
                        <select
                            value={filters.projectId}
                            onChange={(event) =>
                                updateFilter({ projectId: event.target.value })
                            }
                            className={businessTripUi.input}
                        >
                            <option value="">Semua Project</option>
                            {projects.map((project) => (
                                <option key={project.id} value={project.id}>
                                    {project.project_name}
                                </option>
                            ))}
                        </select>
                        <select
                            value={filters.status}
                            onChange={(event) =>
                                updateFilter({ status: event.target.value })
                            }
                            className={businessTripUi.input}
                        >
                            {statusOptions.map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </select>
                        <select
                            value={filters.settlementStatus}
                            onChange={(event) =>
                                updateFilter({
                                    settlementStatus: event.target.value,
                                })
                            }
                            className={businessTripUi.input}
                        >
                            {settlementOptions.map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </select>
                        <input
                            value={filters.requester}
                            onChange={(event) =>
                                updateFilter({ requester: event.target.value })
                            }
                            placeholder="Pemohon"
                            className={businessTripUi.input}
                        />
                        <select
                            value={filters.sortMode}
                            onChange={(event) =>
                                updateFilter({ sortMode: event.target.value })
                            }
                            className={businessTripUi.input}
                        >
                            <option value="newest">Terbaru</option>
                            <option value="oldest">Terlama</option>
                        </select>
                        <label className="relative block">
                            <Search
                                size={16}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                            />
                            <input
                                value={filters.search}
                                onChange={(event) =>
                                    updateFilter({ search: event.target.value })
                                }
                                placeholder="Cari nomor, judul, pemohon, project"
                                className={`${businessTripUi.input} pl-9`}
                            />
                        </label>
                    </div>
                </SectionCard>

                {error && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        {error}
                    </div>
                )}

                <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] font-semibold text-slate-700">
                        {totalCount} data
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

                {loading ? (
                    <div className="space-y-3">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <div
                                key={index}
                                className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white"
                            />
                        ))}
                    </div>
                ) : rows.length === 0 ? (
                    <EmptyState icon={FileSpreadsheet} title="Tidak ada data laporan">
                        Ubah filter untuk melihat data Business Trip lain.
                    </EmptyState>
                ) : (
                    <ReportRows rows={rows} />
                )}
            </div>
        </BusinessTripLayout>
    );
}

function ReportRows({ rows }) {
    return (
        <div className="space-y-3">
            <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
                <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                            <th className="px-3 py-3">No</th>
                            <th className="px-3 py-3">Pemohon</th>
                            <th className="px-3 py-3">Project</th>
                            <th className="px-3 py-3">Status</th>
                            <th className="px-3 py-3 text-right">Requested</th>
                            <th className="px-3 py-3 text-right">Realisasi</th>
                            <th className="px-3 py-3 text-right">Selisih</th>
                            <th className="px-3 py-3">Agenda/Foto</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {rows.map((row) => (
                            <tr key={row.id}>
                                <td className="px-3 py-3 font-semibold text-sky-600">
                                    {row.businessTripNo}
                                </td>
                                <td className="px-3 py-3">{row.requesterName}</td>
                                <td className="px-3 py-3">{row.projectLabel}</td>
                                <td className="px-3 py-3">
                                    <StatusBadge status={row.status} />
                                </td>
                                <td className="px-3 py-3 text-right">
                                    {formatAccommodationAmount(row.requestedAmount)}
                                </td>
                                <td className="px-3 py-3 text-right">
                                    {formatAccommodationAmount(row.totalRealizationAmount)}
                                </td>
                                <td className="px-3 py-3 text-right">
                                    {formatSignedAmount(row.settlementDifference)}
                                </td>
                                <td className="px-3 py-3">
                                    {row.agendaCount} / {row.photoCount}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="grid gap-3 md:hidden">
                {rows.map((row) => (
                    <article
                        key={row.id}
                        className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-[11px] font-bold text-sky-600">
                                    {row.businessTripNo}
                                </p>
                                <h3 className="mt-1 line-clamp-2 text-sm font-bold text-slate-950">
                                    {row.title}
                                </h3>
                            </div>
                            <StatusBadge status={row.status} />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                            <DetailRow label="Pemohon" value={row.requesterName} />
                            <DetailRow label="Project" value={row.projectLabel} />
                            <DetailRow
                                label="Requested"
                                value={formatAccommodationAmount(row.requestedAmount)}
                            />
                            <DetailRow
                                label="Realisasi"
                                value={formatAccommodationAmount(
                                    row.totalRealizationAmount,
                                )}
                            />
                            <DetailRow
                                label="Selisih"
                                value={formatSignedAmount(row.settlementDifference)}
                            />
                            <DetailRow
                                label="Agenda/Foto"
                                value={`${row.agendaCount} / ${row.photoCount}`}
                            />
                        </div>
                    </article>
                ))}
            </div>
        </div>
    );
}
