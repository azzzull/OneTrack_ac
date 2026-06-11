import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Check,
    Clock3,
    Eye,
    Filter,
    Loader,
    Plus,
    Search,
    X,
} from "lucide-react";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import { useAuth } from "../../context/useAuth";
import supabase from "../../supabaseClient";
import CustomSelect from "../../components/ui/CustomSelect";
import OvertimeRequestModal from "../../components/overtime/OvertimeRequestModal";
import {
    createManualOvertimeRequest,
    listOvertimeRequests,
    reviewOvertimeRequest,
} from "../../services/overtimeService";
import {
    NOTIFICATION_EVENT_TYPES,
    notifyEvent,
} from "../../services/notificationEvents";
import {
    formatOvertimeDuration,
    getOvertimeStatusClass,
    getOvertimeStatusLabel,
} from "../../utils/overtime";

const getProfileName = (profile) =>
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
    profile?.name ||
    profile?.email ||
    "-";

const formatDateTime = (value) =>
    value
        ? new Date(value).toLocaleString("id-ID", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
          })
        : "-";

export default function OvertimeManagement() {
    const { collapsed, toggle } = useSidebarCollapsed();
    const { user, profile, role } = useAuth();
    const [requests, setRequests] = useState([]);
    const [technicians, setTechnicians] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [saving, setSaving] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [detail, setDetail] = useState(null);
    const [reviewNotes, setReviewNotes] = useState("");
    const [filters, setFilters] = useState({
        status: "all",
        technicianId: "",
        period: "all",
        month: String(new Date().getMonth() + 1).padStart(2, "0"),
        year: String(new Date().getFullYear()),
        dateFrom: "",
        dateTo: "",
        search: "",
    });

    const canReview = ["admin", "management"].includes(role);

    const loadData = useCallback(async () => {
        if (!user?.id || !role) return;
        setLoading(true);
        setLoadError("");
        try {
            const [overtimeData, profilesResult] = await Promise.all([
                listOvertimeRequests({ role, userId: user.id }),
                supabase.rpc("get_attendance_profiles"),
            ]);
            setRequests(overtimeData);
            if (!profilesResult.error) {
                setTechnicians(
                    (profilesResult.data || []).filter(
                        (item) => item.role === "technician",
                    ),
                );
            }
        } catch (error) {
            console.error("Error loading overtime:", error);
            setLoadError(
                error.message ||
                    "Gagal memuat data lembur. Periksa koneksi dan database.",
            );
            setRequests([]);
        } finally {
            setLoading(false);
        }
    }, [role, user?.id]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        if (!user?.id) return undefined;
        const channel = supabase
            .channel(`overtime-management-${user.id}-${Date.now()}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "overtime_requests" },
                loadData,
            )
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, [loadData, user?.id]);

    const filteredRequests = useMemo(() => {
        const search = filters.search.trim().toLowerCase();
        return requests.filter((row) => {
            if (filters.status !== "all" && row.status !== filters.status) {
                return false;
            }
            if (
                filters.technicianId &&
                row.technician_id !== filters.technicianId
            ) {
                return false;
            }
            const rowDate = row.date || "";
            if (filters.period === "month") {
                if (!rowDate.startsWith(`${filters.year}-${filters.month}`)) {
                    return false;
                }
            } else if (filters.period === "year") {
                if (!rowDate.startsWith(filters.year)) return false;
            } else if (filters.period === "custom") {
                if (filters.dateFrom && rowDate < filters.dateFrom)
                    return false;
                if (filters.dateTo && rowDate > filters.dateTo) return false;
            }
            if (search) {
                const text = [
                    getProfileName(row.technician),
                    row.location_address,
                    row.notes,
                    row.review_notes,
                ]
                    .join(" ")
                    .toLowerCase();
                if (!text.includes(search)) return false;
            }
            return true;
        });
    }, [filters, requests]);

    const summary = useMemo(() => {
        const counts = {
            total: filteredRequests.length,
            pending: 0,
            approved: 0,
            rejected: 0,
            durationMinutes: 0,
        };
        for (const row of filteredRequests) {
            if (counts[row.status] !== undefined) counts[row.status] += 1;
            counts.durationMinutes += row.duration_minutes || 0;
        }
        return counts;
    }, [filteredRequests]);

    const handleManualSubmit = async (payload) => {
        setSaving(true);
        try {
            const selectedTechnician =
                technicians.find((tech) => tech.id === payload.technicianId) ||
                profile;
            const created = await createManualOvertimeRequest({
                ...payload,
                requestedBy: user.id,
                profile: selectedTechnician,
            });
            await notifyEvent(NOTIFICATION_EVENT_TYPES.OVERTIME_REQUESTED, {
                technician_id: created.technician_id,
                technician_name: getProfileName(selectedTechnician),
                overtime_id: created.id,
                duration_minutes: created.duration_minutes,
            });
            setFilters((prev) => ({
                ...prev,
                status: "all",
                period: "all",
                technicianId: "",
                search: "",
            }));
            setModalOpen(false);
            await loadData();
        } finally {
            setSaving(false);
        }
    };

    const handleReview = async (status) => {
        if (!detail) return;
        setSaving(true);
        try {
            const reviewed = await reviewOvertimeRequest({
                requestId: detail.id,
                status,
                notes: reviewNotes,
                userId: user.id,
            });
            await notifyEvent(
                status === "approved"
                    ? NOTIFICATION_EVENT_TYPES.OVERTIME_APPROVED
                    : NOTIFICATION_EVENT_TYPES.OVERTIME_REJECTED,
                {
                    technician_id: detail.technician_id,
                    overtime_id: detail.id,
                    status: reviewed.status,
                    duration_minutes: detail.duration_minutes,
                },
            );
            setDetail(null);
            setReviewNotes("");
            await loadData();
        } catch (error) {
            alert(error.message || "Gagal memproses review.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-sky-50">
            <div className="flex min-h-screen">
                <Sidebar collapsed={collapsed} onToggle={toggle} />
                <main className="min-w-0 flex-1 p-4 pb-24 md:p-8 md:pb-8">
                    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">
                                Overtime Management
                            </h1>
                            <p className="mt-1 text-sm text-slate-600">
                                Pengajuan, approval, dan laporan lembur.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setModalOpen(true)}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-600"
                        >
                            <Plus size={16} />
                            Add Overtime
                        </button>
                    </div>

                    {loadError && (
                        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                            <p className="font-semibold">
                                Data lembur belum bisa dimuat
                            </p>
                            <p className="mt-1">{loadError}</p>
                        </div>
                    )}

                    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
                        <SummaryCard
                            label="Total Pengajuan"
                            value={summary.total}
                        />
                        <SummaryCard
                            label="Menunggu Approval"
                            value={summary.pending}
                            tone="blue"
                        />
                        <SummaryCard
                            label="Disetujui"
                            value={summary.approved}
                            tone="green"
                        />
                        <SummaryCard
                            label="Ditolak"
                            value={summary.rejected}
                            tone="red"
                        />
                        <SummaryCard
                            label="Manual"
                            value={
                                filteredRequests.filter(
                                    (row) => row.overtime_type === "manual",
                                ).length
                            }
                            tone="slate"
                        />
                    </div>

                    {filters.technicianId && (
                        <div className="mb-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-800">
                            <p className="text-xs font-semibold uppercase tracking-wide">
                                Total Waktu Lembur Teknisi
                            </p>
                            <p className="mt-2 text-2xl font-bold">
                                {formatOvertimeDuration(
                                    summary.durationMinutes,
                                )}
                            </p>
                            <p className="mt-1 text-sm">
                                {getProfileName(
                                    technicians.find(
                                        (tech) =>
                                            tech.id === filters.technicianId,
                                    ),
                                )}{" "}
                                berdasarkan filter aktif.
                            </p>
                        </div>
                    )}

                    <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                            <Filter size={16} />
                            Filter
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
                            <CustomSelect
                                value={filters.status}
                                onChange={(value) =>
                                    setFilters((prev) => ({
                                        ...prev,
                                        status: value,
                                    }))
                                }
                                options={[
                                    { value: "all", label: "Semua" },
                                    { value: "pending", label: "Pending" },
                                    { value: "approved", label: "Approved" },
                                    { value: "rejected", label: "Rejected" },
                                ]}
                            />
                            {canReview && (
                                <CustomSelect
                                    value={filters.technicianId}
                                    onChange={(value) =>
                                        setFilters((prev) => ({
                                            ...prev,
                                            technicianId: value,
                                        }))
                                    }
                                    options={[
                                        { value: "", label: "Semua Teknisi" },
                                        ...technicians.map((tech) => ({
                                            value: tech.id,
                                            label: getProfileName(tech),
                                        })),
                                    ]}
                                />
                            )}
                            <CustomSelect
                                value={filters.period}
                                onChange={(value) =>
                                    setFilters((prev) => ({
                                        ...prev,
                                        period: value,
                                    }))
                                }
                                options={[
                                    { value: "all", label: "Semua Periode" },
                                    { value: "month", label: "Bulan" },
                                    { value: "year", label: "Tahun" },
                                    { value: "custom", label: "Custom Range" },
                                ]}
                            />
                            {filters.period === "month" && (
                                <>
                                    <input
                                        type="month"
                                        value={`${filters.year}-${filters.month}`}
                                        onChange={(e) => {
                                            const [year, month] =
                                                e.target.value.split("-");
                                            setFilters((prev) => ({
                                                ...prev,
                                                year,
                                                month,
                                            }));
                                        }}
                                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                    />
                                </>
                            )}
                            {filters.period === "year" && (
                                <input
                                    type="number"
                                    value={filters.year}
                                    onChange={(e) =>
                                        setFilters((prev) => ({
                                            ...prev,
                                            year: e.target.value,
                                        }))
                                    }
                                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                />
                            )}
                            {filters.period === "custom" && (
                                <>
                                    <input
                                        type="date"
                                        value={filters.dateFrom}
                                        onChange={(e) =>
                                            setFilters((prev) => ({
                                                ...prev,
                                                dateFrom: e.target.value,
                                            }))
                                        }
                                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                    />
                                    <input
                                        type="date"
                                        value={filters.dateTo}
                                        onChange={(e) =>
                                            setFilters((prev) => ({
                                                ...prev,
                                                dateTo: e.target.value,
                                            }))
                                        }
                                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                    />
                                </>
                            )}
                            <label className="relative block">
                                <Search
                                    size={15}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                                />
                                <input
                                    type="search"
                                    value={filters.search}
                                    onChange={(e) =>
                                        setFilters((prev) => ({
                                            ...prev,
                                            search: e.target.value,
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
                        ) : filteredRequests.length === 0 ? (
                            <div className="p-8 text-center text-sm text-slate-500">
                                Tidak ada data lembur.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="border-b border-slate-200 bg-slate-100 text-left text-slate-700">
                                        <tr>
                                            <th className="px-4 py-3">
                                                Teknisi
                                            </th>
                                            <th className="px-4 py-3">
                                                Tanggal
                                            </th>
                                            <th className="px-4 py-3">Jenis</th>
                                            <th className="px-4 py-3">
                                                Durasi
                                            </th>
                                            <th className="px-4 py-3">
                                                Lokasi
                                            </th>
                                            <th className="px-4 py-3">
                                                Status
                                            </th>
                                            <th className="px-4 py-3">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {filteredRequests.map((row) => (
                                            <tr
                                                key={row.id}
                                                className="hover:bg-slate-50"
                                            >
                                                <td className="px-4 py-3 font-medium text-slate-800">
                                                    {getProfileName(
                                                        row.technician,
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-slate-600">
                                                    {row.date}
                                                </td>
                                                <td className="px-4 py-3 capitalize text-slate-600">
                                                    {row.overtime_type}
                                                </td>
                                                <td className="px-4 py-3 text-slate-600">
                                                    {formatOvertimeDuration(
                                                        row.duration_minutes,
                                                    )}
                                                </td>
                                                <td className="max-w-xs px-4 py-3 text-slate-600">
                                                    <span className="line-clamp-2">
                                                        {row.location_address}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span
                                                        className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${getOvertimeStatusClass(
                                                            row.status,
                                                        )}`}
                                                    >
                                                        {getOvertimeStatusLabel(
                                                            row.status,
                                                        )}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setDetail(row);
                                                            setReviewNotes(
                                                                row.review_notes ||
                                                                    "",
                                                            );
                                                        }}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                                    >
                                                        <Eye size={14} />
                                                        Detail
                                                    </button>
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

            <OvertimeRequestModal
                isOpen={modalOpen}
                mode="manual"
                currentUserId={user?.id}
                role={role}
                technicians={technicians}
                onClose={() => setModalOpen(false)}
                onSubmit={handleManualSubmit}
                loading={saving}
            />

            {detail && (
                <div className="fixed inset-0 z-9999 flex items-center justify-center bg-slate-950/50 p-3">
                    <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
                        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                            <h2 className="text-lg font-semibold text-slate-900">
                                Detail Lembur
                            </h2>
                            <button
                                type="button"
                                onClick={() => setDetail(null)}
                                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="space-y-4 px-5 py-5">
                            <img
                                src={detail.photo_url}
                                alt="Bukti lembur"
                                className="max-h-96 w-full rounded-xl border border-slate-200 object-contain"
                            />
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <DetailItem
                                    label="Teknisi"
                                    value={getProfileName(detail.technician)}
                                />
                                <DetailItem
                                    label="Status"
                                    value={getOvertimeStatusLabel(
                                        detail.status,
                                    )}
                                />
                                <DetailItem
                                    label="Mulai"
                                    value={formatDateTime(detail.start_at)}
                                />
                                <DetailItem
                                    label="Selesai"
                                    value={formatDateTime(detail.end_at)}
                                />
                                <DetailItem
                                    label="Durasi"
                                    value={formatOvertimeDuration(
                                        detail.duration_minutes,
                                    )}
                                />
                                <DetailItem
                                    label="Lokasi"
                                    value={detail.location_address}
                                />
                            </div>
                            {detail.notes && (
                                <DetailItem
                                    label="Catatan"
                                    value={detail.notes}
                                />
                            )}
                            {canReview && detail.status === "pending" && (
                                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                    <label className="block">
                                        <span className="mb-2 block text-xs font-medium text-slate-600">
                                            Catatan Review
                                        </span>
                                        <textarea
                                            value={reviewNotes}
                                            onChange={(e) =>
                                                setReviewNotes(e.target.value)
                                            }
                                            rows={3}
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                        />
                                    </label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                handleReview("rejected")
                                            }
                                            disabled={saving}
                                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-60"
                                        >
                                            <X size={15} />
                                            Reject
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                handleReview("approved")
                                            }
                                            disabled={saving}
                                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
                                        >
                                            <Check size={15} />
                                            Approve
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <MobileBottomNav />
        </div>
    );
}

function SummaryCard({ label, value, tone = "sky" }) {
    const tones = {
        sky: "border-sky-200 bg-sky-50 text-sky-700",
        blue: "border-blue-200 bg-blue-50 text-blue-700",
        green: "border-emerald-200 bg-emerald-50 text-emerald-700",
        red: "border-red-200 bg-red-50 text-red-700",
        slate: "border-slate-200 bg-slate-50 text-slate-700",
    };
    return (
        <div className={`rounded-2xl border p-4 ${tones[tone] || tones.sky}`}>
            <p className="text-xs font-semibold">{label}</p>
            <p className="mt-2 text-2xl font-bold">{value}</p>
        </div>
    );
}

function DetailItem({ label, value }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
                {value || "-"}
            </p>
        </div>
    );
}
