import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    AlertTriangle,
    BarChart3,
    Camera,
    CheckCircle2,
    Eye,
    FileImage,
    Filter,
    FolderOpen,
    LoaderCircle,
    Plus,
    Save,
    Search,
    Settings2,
    ShieldCheck,
    ShieldOff,
    Trash2,
    Upload,
    X,
    XCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import ImagePreviewModal from "../../components/ImagePreviewModal";
import CustomSelect from "../../components/ui/CustomSelect";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import { useAuth } from "../../context/useAuth";
import { useDialog } from "../../context/useDialog";
import supabase from "../../supabaseClient";
import {
    STATUS_LABELS,
    STATUS_STYLES,
    addAccommodationRealization,
    approveAccommodationRequest,
    createAccommodationRequest,
    deleteAccommodationRequest,
    formatCurrency,
    getDisplayName,
    loadAccommodationLookups,
    loadAccommodationRequests,
    rejectAccommodationRequest,
    uploadAccommodationFile,
} from "../../services/accommodationService";
import { blocksNextAccommodationSubmission } from "../../services/accommodationSettlement";
import {
    getAccommodationSubmissionBlockSetting,
    isAccommodationSubmissionBlockEnabled,
    saveAccommodationSubmissionBlockSetting,
} from "../../services/accommodationSubmissionSettings";
import {
    groupAccommodationRequestsByTechnician,
    requiresAccommodationMonitoring,
} from "../../services/accommodationAggregation";
import { createUniqueChannelName } from "../../utils/realtimeChannelManager";

const inputClass =
    "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-300";

const onlyDigits = (value) => String(value ?? "").replace(/\D/g, "");

const formatNumberInput = (value) => {
    const digits = onlyDigits(value);
    if (!digits) return "";
    return new Intl.NumberFormat("en-US").format(Number(digits));
};

const todayKey = () => new Date().toISOString().slice(0, 10);

const toDateKey = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const getWeekStartKey = (date = new Date()) => {
    const start = new Date(date);
    const day = start.getDay();
    const distanceFromMonday = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + distanceFromMonday);
    return toDateKey(start);
};

const getWeekEndKey = (date = new Date()) => {
    const start = new Date(getWeekStartKey(date));
    start.setDate(start.getDate() + 6);
    return toDateKey(start);
};

const getMonthKey = (date = new Date()) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const getYearKey = (date = new Date()) => `${date.getFullYear()}`;

const getRequestDateKey = (request) =>
    toDateKey(
        request.requested_at || request.created_at || request.reviewed_at,
    );

const matchesPeriod = (request, period) => {
    const dateKey = getRequestDateKey(request);
    if (!dateKey) return false;

    if (period.mode === "today") {
        return dateKey === toDateKey(new Date());
    }

    if (period.mode === "weekly") {
        return dateKey >= period.weekStart && dateKey <= period.weekEnd;
    }

    if (period.mode === "monthly") {
        return dateKey.startsWith(period.month);
    }

    if (period.mode === "yearly") {
        return dateKey.startsWith(period.year);
    }

    if (period.mode === "custom") {
        const afterStart = !period.startDate || dateKey >= period.startDate;
        const beforeEnd = !period.endDate || dateKey <= period.endDate;
        return afterStart && beforeEnd;
    }

    return true;
};

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

const formatSettingUpdatedAt = (value) => {
    if (!value) return "Belum pernah diubah";

    return new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
};

const getProjectLabel = (project) =>
    project?.project_name || project?.name || "Project";

const getAccommodationCustomerLabel = (request) =>
    request?.customer_name || request?.customer?.name || "-";

const getAccommodationProjectLabel = (request) =>
    request?.project_name ||
    request?.project?.project_name ||
    request?.project?.name ||
    "-";

const StatusBadge = ({ status }) => (
    <span
        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
            STATUS_STYLES[status] ?? STATUS_STYLES.pending
        }`}
    >
        {STATUS_LABELS[status] ?? "Pending"}
    </span>
);

export default function AccommodationPage({ mode = "technician" }) {
    const { user, role, profile } = useAuth();
    const { alert: showAlert } = useDialog();
    const navigate = useNavigate();
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const [requests, setRequests] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [submissionBlockEnabled, setSubmissionBlockEnabled] = useState(true);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsLoading, setSettingsLoading] = useState(false);
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [settingsEnabled, setSettingsEnabled] = useState(true);
    const [settingsNote, setSettingsNote] = useState("");
    const [settingsUpdatedAt, setSettingsUpdatedAt] = useState(null);
    const [settingsMessage, setSettingsMessage] = useState("");
    const [search, setSearch] = useState("");
    const [selectedId, setSelectedId] = useState(null);
    const [selectedTechnicianId, setSelectedTechnicianId] = useState(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [createForm, setCreateForm] = useState({
        customerId: "",
        projectId: "",
    });
    const [approvalMode, setApprovalMode] = useState(null);
    const [realizationOpen, setRealizationOpen] = useState(false);
    const [receiptPhotoFile, setReceiptPhotoFile] = useState(null);
    const channelRef = useRef(null);
    const isMountedRef = useRef(true);
    const userId = user?.id;

    const isManagement = role === "management";
    const isTechnician = role === "technician";
    const isInternalTechnician =
        isTechnician && profile?.technician_type === "internal";
    const isAdmin = role === "admin";
    const showTechnicianColumn = mode !== "technician";
    const canApprove =
        (isManagement && mode === "management") ||
        (isAdmin && mode === "admin");
    const canCreate =
        (mode === "technician" && isInternalTechnician) ||
        (mode === "admin" && isAdmin) ||
        (mode === "management" && isManagement);
    const canAddRealization =
        (mode === "technician" && isInternalTechnician) ||
        (mode === "admin" && isAdmin) ||
        (mode === "management" && isManagement);
    const canViewAccommodationReport =
        ["admin", "management"].includes(role) &&
        ["admin", "management"].includes(mode);

    const loadData = useCallback(async () => {
        try {
            const [requestRows, lookupRows] = await Promise.all([
                loadAccommodationRequests({ role, userId }),
                loadAccommodationLookups(),
            ]);
            if (!isMountedRef.current) return;
            setRequests(requestRows);
            setCustomers(lookupRows.customers);
            setProjects(lookupRows.projects);
        } catch (error) {
            console.error("Accommodation load failed:", error);
            if (isMountedRef.current) setRequests([]);
        } finally {
            if (isMountedRef.current) setLoading(false);
        }
    }, [role, userId]);

    const refreshSubmissionBlockSetting = useCallback(async () => {
        try {
            const enabled = await isAccommodationSubmissionBlockEnabled();
            if (isMountedRef.current) {
                setSubmissionBlockEnabled(enabled);
            }
            return enabled;
        } catch (error) {
            console.error("Accommodation submission setting load failed:", error);
            return submissionBlockEnabled;
        }
    }, [submissionBlockEnabled]);

    const openAccommodationSettings = async () => {
        setSettingsOpen(true);
        setSettingsLoading(true);
        setSettingsMessage("");
        try {
            const setting = await getAccommodationSubmissionBlockSetting();
            setSettingsEnabled(setting.enabled);
            setSettingsNote(setting.note);
            setSettingsUpdatedAt(setting.updatedAt);
        } catch (error) {
            setSettingsMessage(
                error?.message || "Pengaturan pembatasan gagal dimuat.",
            );
        } finally {
            setSettingsLoading(false);
        }
    };

    const persistAccommodationSettings = async ({
        nextEnabled = settingsEnabled,
        successMessage,
    } = {}) => {
        setSettingsSaving(true);
        setSettingsMessage("");
        try {
            const setting = await saveAccommodationSubmissionBlockSetting({
                enabled: nextEnabled,
                note: settingsNote,
            });
            setSettingsEnabled(setting.enabled);
            setSettingsNote(setting.note);
            setSettingsUpdatedAt(setting.updatedAt);
            setSubmissionBlockEnabled(setting.enabled);
            setSettingsMessage(
                successMessage ||
                    (setting.enabled
                        ? "Pembatasan pengajuan akomodasi telah diaktifkan."
                        : "Pembatasan pengajuan akomodasi sementara dinonaktifkan."),
            );
        } catch (error) {
            setSettingsMessage(
                error?.message || "Pengaturan pembatasan gagal disimpan.",
            );
        } finally {
            setSettingsSaving(false);
        }
    };

    useEffect(() => {
        isMountedRef.current = true;
        queueMicrotask(loadData);
        queueMicrotask(refreshSubmissionBlockSetting);
        return () => {
            isMountedRef.current = false;
        };
    }, [loadData, refreshSubmissionBlockSetting]);

    useEffect(() => {
        if (!userId) return;
        const channelName = `${createUniqueChannelName(
            "accommodation",
            userId,
        )}-${Date.now()}`;
        channelRef.current = supabase
            .channel(channelName)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "accommodation_requests",
                },
                () => loadData(),
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "accommodation_realizations",
                },
                () => loadData(),
            );

        channelRef.current.subscribe((status) => {
            if (status === "SUBSCRIBED") {
                loadData();
            }
        });

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [loadData, userId]);

    const searchFilteredRequests = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        return requests.filter((item) => {
            const haystack = `${item.request_title ?? ""} ${
                item.purpose ?? ""
            } ${getDisplayName(item.technician)}`.toLowerCase();
            return !keyword || haystack.includes(keyword);
        });
    }, [requests, search]);

    const monitoringRequests = useMemo(
        () => searchFilteredRequests.filter(requiresAccommodationMonitoring),
        [searchFilteredRequests],
    );

    const technicianGroups = useMemo(
        () =>
            showTechnicianColumn
                ? groupAccommodationRequestsByTechnician(monitoringRequests)
                : [],
        [monitoringRequests, showTechnicianColumn],
    );

    const selectedTechnicianGroup = useMemo(() => {
        if (!selectedTechnicianId) return null;
        return (
            groupAccommodationRequestsByTechnician(requests).find(
                (group) => group.id === selectedTechnicianId,
            ) ?? null
        );
    }, [requests, selectedTechnicianId]);

    const visibleRequests = useMemo(
        () => (showTechnicianColumn ? [] : searchFilteredRequests),
        [searchFilteredRequests, showTechnicianColumn],
    );

    const selectedRequest = useMemo(
        () => requests.find((item) => item.id === selectedId) ?? null,
        [requests, selectedId],
    );

    const pendingSettlementRequest = useMemo(
        () =>
            requests.find(
                (request) =>
                    request.technician_id === userId &&
                    blocksNextAccommodationSubmission(request),
            ) ?? null,
        [requests, userId],
    );

    const unsettledRequest = submissionBlockEnabled
        ? pendingSettlementRequest
        : null;

    const getUnsettledRequestMessage = (request) =>
        request
        ? `Pengajuan baru belum dapat dibuat karena akomodasi "${
              request.request_title || "sebelumnya"
          }" yang diajukan pada ${formatDate(
              request.requested_at || request.created_at,
          )} belum direalisasikan sepenuhnya. Buka detail pengajuan tersebut untuk menambahkan realisasi.`
        : "";

    const customerOptions = useMemo(
        () =>
            customers.map((customer) => ({
                value: customer.id,
                label: customer.name ?? "-",
            })),
        [customers],
    );

    const projectOptions = useMemo(() => {
        if (!createForm.customerId) return [];

        return projects
            .filter((project) => project.customer_id === createForm.customerId)
            .map((project) => ({
                value: project.id,
                label: getProjectLabel(project),
            }));
    }, [createForm.customerId, projects]);

    const openCreateModal = async () => {
        if (loading) {
            await showAlert("Data akomodasi masih dimuat. Silakan coba lagi sebentar.", {
                title: "Pengajuan Akomodasi",
            });
            return;
        }
        const isBlockEnabled = await refreshSubmissionBlockSetting();
        if (isBlockEnabled && pendingSettlementRequest) {
            await showAlert(
                getUnsettledRequestMessage(pendingSettlementRequest),
                {
                    title: "Realisasi Belum Selesai",
                },
            );
            return;
        }
        setCreateForm({ customerId: "", projectId: "" });
        setCreateOpen(true);
    };

    const submitCreate = async (event) => {
        event.preventDefault();
        const isBlockEnabled = await refreshSubmissionBlockSetting();
        if (isBlockEnabled && pendingSettlementRequest) {
            await showAlert(
                getUnsettledRequestMessage(pendingSettlementRequest),
                {
                    title: "Realisasi Belum Selesai",
                },
            );
            return;
        }
        const formData = new FormData(event.currentTarget);
        const selectedCustomer = customers.find(
            (customer) => customer.id === createForm.customerId,
        );
        const selectedProject = projects.find(
            (project) => project.id === createForm.projectId,
        );
        try {
            setSaving(true);
            await createAccommodationRequest({
                technician_id: user.id,
                technician_name: getDisplayName(profile),
                request_title: formData.get("request_title"),
                purpose: formData.get("purpose"),
                requested_amount: formData.get("requested_amount"),
                customer_id: createForm.customerId,
                project_id: createForm.projectId,
                customer_name: selectedCustomer?.name ?? null,
                project_name: selectedProject?.project_name ?? null,
            });
            setCreateForm({ customerId: "", projectId: "" });
            setCreateOpen(false);
            await loadData();
        } catch (error) {
            await showAlert(error?.message ?? "Gagal membuat pengajuan.", {
                title: "Gagal",
            });
        } finally {
            setSaving(false);
        }
    };

    const submitApproval = async (event) => {
        event.preventDefault();
        if (!selectedRequest) return;
        const formData = new FormData(event.currentTarget);

        try {
            setSaving(true);
            if (approvalMode === "reject") {
                const rejectionReason = String(
                    formData.get("rejection_reason") ?? "",
                ).trim();
                if (!rejectionReason) {
                    throw new Error("Rejection reason wajib diisi.");
                }
                await rejectAccommodationRequest({
                    requestId: selectedRequest.id,
                    rejectionReason,
                    reviewedBy: user.id,
                    technicianName: getDisplayName(selectedRequest.technician),
                });
            } else {
                const file = formData.get("transfer_proof");
                if (!file?.name)
                    throw new Error("Transfer proof wajib diupload.");
                const transferProofUrl = await uploadAccommodationFile({
                    file,
                    folder: "transfer-proofs",
                    requestId: selectedRequest.id,
                });
                await approveAccommodationRequest({
                    requestId: selectedRequest.id,
                    approvedAmount: formData.get("approved_amount"),
                    transferProofUrl,
                    reviewedBy: user.id,
                    notes: formData.get("approval_notes"),
                    technicianName: getDisplayName(selectedRequest.technician),
                });
            }
            setApprovalMode(null);
            await loadData();
        } catch (error) {
            await showAlert(error?.message ?? "Gagal menyimpan approval.", {
                title: "Gagal",
            });
        } finally {
            setSaving(false);
        }
    };

    const submitRealization = async (event) => {
        event.preventDefault();
        if (!selectedRequest) return;
        const formData = new FormData(event.currentTarget);

        try {
            setSaving(true);
            const file = receiptPhotoFile;
            if (!file?.name) throw new Error("Receipt photo wajib diupload.");
            const receiptPhotoUrl = await uploadAccommodationFile({
                file,
                folder: "receipts",
                requestId: selectedRequest.id,
            });
            await addAccommodationRealization({
                requestId: selectedRequest.id,
                receiptPhotoUrl,
                amount: formData.get("amount"),
                description: formData.get("description"),
                transactionDate: formData.get("transaction_date"),
                createdBy: user.id,
                technicianName: getDisplayName(
                    selectedRequest.technician ?? profile,
                ),
            });
            setRealizationOpen(false);
            setReceiptPhotoFile(null);
            await loadData();
        } catch (error) {
            await showAlert(error?.message ?? "Gagal upload realisasi.", {
                title: "Gagal",
            });
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteRequest = async (request) => {
        const confirmed = window.confirm(
            `Hapus pengajuan "${request.request_title}" beserta semua bukti transfer dan receipt?`,
        );
        if (!confirmed) return;

        try {
            setSaving(true);
            await deleteAccommodationRequest(request);
            setSelectedId(null);
            await loadData();
        } catch (error) {
            await showAlert(
                error?.message ?? "Gagal menghapus pengajuan akomodasi.",
                { title: "Gagal" },
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-sky-50">
            <div className="flex min-h-screen">
                <Sidebar
                    collapsed={sidebarCollapsed}
                    onToggle={toggleSidebar}
                />
                <main className="min-w-0 flex-1 p-4 pb-24 md:p-8 md:pb-8">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">
                                {mode === "management"
                                    ? "Accommodation Requests"
                                    : "My Accommodation Requests"}
                            </h1>
                            <p className="mt-1 text-slate-600">
                                {showTechnicianColumn
                                    ? "Monitor pengajuan pending dan realisasi akomodasi per pengaju."
                                    : "Kelola pengajuan akomodasi, cash advance, dan realisasi Anda."}
                            </p>
                            {canCreate && unsettledRequest && (
                                <p className="mt-2 text-sm font-medium text-amber-700">
                                    Pengajuan baru dikunci sampai realisasi sebelumnya selesai.
                                </p>
                            )}
                        </div>
                        <div className="flex w-full flex-col gap-2 md:max-w-xl md:flex-row md:items-center md:justify-end">
                            <label className="flex w-full items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-slate-500 md:max-w-sm md:px-4 md:py-3">
                                <Search size={16} />
                                <input
                                    value={search}
                                    onChange={(event) =>
                                        setSearch(event.target.value)
                                    }
                                    className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 md:text-base"
                                    placeholder={
                                        showTechnicianColumn
                                            ? "Cari pengaju, judul, atau purpose..."
                                            : "Cari judul atau purpose..."
                                    }
                                />
                            </label>
                            {canViewAccommodationReport && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        navigate(
                                            role === "admin"
                                                ? "/admin/accommodation/reports"
                                                : "/management/accommodation/reports",
                                        )
                                    }
                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 md:py-3"
                                >
                                    <BarChart3 size={16} />
                                    Report
                                </button>
                            )}
                            {isAdmin && (
                                <button
                                    type="button"
                                    onClick={openAccommodationSettings}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 md:py-3"
                                >
                                    <Settings2 size={16} />
                                    Pengaturan
                                </button>
                            )}
                        </div>
                    </div>

                    <section className="mt-6 space-y-3">
                        {loading ? (
                            <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
                                Loading accommodation requests...
                            </div>
                        ) : showTechnicianColumn ? (
                            technicianGroups.length ? (
                                technicianGroups.map((group) => (
                                        <article
                                            key={group.id}
                                            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
                                        >
                                            <div className="p-4">
                                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                                    <div className="min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <h2 className="text-base font-semibold text-slate-900">
                                                                {getDisplayName(
                                                                    group.technician,
                                                                )}
                                                            </h2>
                                                            <StatusBadge
                                                                status={group.status}
                                                            />
                                                        </div>
                                                        <p className="mt-2 text-sm text-slate-600">
                                                            {group.items.length} pengajuan
                                                            {group.items.length === 1
                                                                ? ""
                                                                : " akomodasi"}
                                                            {group.pending > 0 &&
                                                                ` · ${group.pending} pending`}
                                                            {group.inRealization > 0 &&
                                                                ` · ${group.inRealization} dalam realisasi`}
                                                        </p>
                                                        <p className="mt-2 text-xs font-medium text-slate-500">
                                                            Pengajuan terbaru{" "}
                                                            {formatDate(group.latestAt)}
                                                        </p>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2 text-sm lg:w-xl">
                                                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                                                            <p className="text-xs font-medium text-slate-500">
                                                                Total Request
                                                            </p>
                                                            <p className="mt-1 break-words font-semibold text-slate-900">
                                                                {formatCurrency(
                                                                    group.requestedAmount,
                                                                )}
                                                            </p>
                                                        </div>
                                                        <div className="rounded-xl bg-emerald-50 px-3 py-2">
                                                            <p className="text-xs font-medium text-emerald-700">
                                                                Total Approved
                                                            </p>
                                                            <p className="mt-1 break-words font-semibold text-emerald-900">
                                                                {formatCurrency(
                                                                    group.approvedAmount,
                                                                )}
                                                            </p>
                                                        </div>
                                                        <div className="rounded-xl bg-blue-50 px-3 py-2">
                                                            <p className="text-xs font-medium text-blue-700">
                                                                Total Realized
                                                            </p>
                                                            <p className="mt-1 break-words font-semibold text-blue-900">
                                                                {formatCurrency(
                                                                    group.realizedAmount,
                                                                )}
                                                            </p>
                                                        </div>
                                                        <div className="rounded-xl bg-amber-50 px-3 py-2">
                                                            <p className="text-xs font-medium text-amber-700">
                                                                Outstanding
                                                            </p>
                                                            <p className="mt-1 break-words font-semibold text-amber-900">
                                                                {formatCurrency(
                                                                    group.remainingAmount,
                                                                )}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setSelectedTechnicianId(
                                                                group.id,
                                                            )
                                                        }
                                                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                                    >
                                                        <Eye size={15} />
                                                        Detail Pengaju
                                                    </button>
                                                </div>
                                            </div>
                                        </article>
                                ))
                            ) : (
                                <div className="rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50 p-8 text-center text-sm text-sky-700">
                                    Belum ada pengajuan.
                                </div>
                            )
                        ) : visibleRequests.length ? (
                            visibleRequests.map((item) => (
                                <article
                                    key={item.id}
                                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
                                >
                                    <div className="p-4">
                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                            <div className="min-w-0">
                                                <div className="flex min-w-0 items-start gap-2">
                                                    <h2 className="min-w-0 truncate text-base font-semibold text-slate-900">
                                                        {item.request_title}
                                                    </h2>
                                                    <span className="shrink-0">
                                                        <StatusBadge
                                                            status={item.status}
                                                        />
                                                    </span>
                                                </div>
                                                {showTechnicianColumn && (
                                                    <p className="mt-2 text-sm font-medium text-slate-700">
                                                        {getDisplayName(
                                                            item.technician,
                                                        )}
                                                    </p>
                                                )}
                                                <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                                                    {item.purpose}
                                                </p>
                                                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-slate-500">
                                                    <span>
                                                        {getAccommodationCustomerLabel(
                                                            item,
                                                        )}
                                                    </span>
                                                    <span>
                                                        {getAccommodationProjectLabel(
                                                            item,
                                                        )}
                                                    </span>
                                                    <span>
                                                        {formatDate(
                                                            item.requested_at ||
                                                                item.created_at,
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-sm lg:w-md">
                                                <div className="rounded-xl bg-slate-50 px-3 py-2">
                                                    <p className="text-xs font-medium text-slate-500">
                                                        Requested
                                                    </p>
                                                    <p className="mt-1 wrap-break-word font-semibold text-slate-900">
                                                        {formatCurrency(
                                                            item.requested_amount,
                                                        )}
                                                    </p>
                                                </div>
                                                <div className="rounded-xl bg-emerald-50 px-3 py-2">
                                                    <p className="text-xs font-medium text-emerald-700">
                                                        Approved
                                                    </p>
                                                    <p className="mt-1 wrap-break-word font-semibold text-emerald-900">
                                                        {item.approved_amount
                                                            ? formatCurrency(
                                                                  item.approved_amount,
                                                              )
                                                            : "-"}
                                                    </p>
                                                </div>
                                                <div className="rounded-xl bg-blue-50 px-3 py-2">
                                                    <p className="text-xs font-medium text-blue-700">
                                                        Realized
                                                    </p>
                                                    <p className="mt-1 wrap-break-word font-semibold text-blue-900">
                                                        {formatCurrency(
                                                            item.totalRealized,
                                                        )}
                                                    </p>
                                                </div>
                                                <div className="rounded-xl bg-amber-50 px-3 py-2">
                                                    <p className="text-xs font-medium text-amber-700">
                                                        Remaining
                                                    </p>
                                                    <p className="mt-1 wrap-break-word font-semibold text-amber-900">
                                                        {item.approved_amount
                                                            ? formatCurrency(
                                                                  item.remainingAmount,
                                                              )
                                                            : "-"}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setSelectedId(item.id)
                                                }
                                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                            >
                                                <Eye size={15} />
                                                Detail
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            ))
                        ) : (
                            <div className="rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50 p-8 text-center text-sm text-sky-700">
                                Belum ada pengajuan.
                            </div>
                        )}
                    </section>
                </main>
            </div>

            <MobileBottomNav />

            {canCreate && (
                <button
                    type="button"
                    onClick={openCreateModal}
                    className={`fixed bottom-24 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl shadow-sky-900/20 md:bottom-6 ${
                        unsettledRequest
                            ? "bg-amber-500 hover:bg-amber-600"
                            : "bg-sky-600 hover:bg-sky-700"
                    }`}
                    aria-label={
                        unsettledRequest
                            ? "Pengajuan baru dikunci sampai realisasi sebelumnya selesai"
                            : "Create accommodation request"
                    }
                    title={
                        unsettledRequest
                            ? "Selesaikan realisasi sebelumnya terlebih dahulu"
                            : "Create accommodation request"
                    }
                >
                    <Plus size={26} />
                </button>
            )}

            {settingsOpen && isAdmin && (
                <Modal
                    title="Aturan Pengajuan Akomodasi"
                    onClose={() => setSettingsOpen(false)}
                >
                    {settingsLoading ? (
                        <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-slate-500">
                            <LoaderCircle className="animate-spin" size={18} />
                            Memuat pengaturan…
                        </div>
                    ) : (
                        <div className="space-y-5">
                            <div
                                className={`rounded-xl border p-4 ${
                                    settingsEnabled
                                        ? "border-emerald-200 bg-emerald-50"
                                        : "border-amber-200 bg-amber-50"
                                }`}
                            >
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex gap-3">
                                        <span
                                            className={`mt-0.5 rounded-lg bg-white p-2 ${
                                                settingsEnabled
                                                    ? "text-emerald-700"
                                                    : "text-amber-700"
                                            }`}
                                        >
                                            {settingsEnabled ? (
                                                <ShieldCheck size={19} />
                                            ) : (
                                                <ShieldOff size={19} />
                                            )}
                                        </span>
                                        <div>
                                            <h3 className="font-semibold text-slate-900">
                                                {settingsEnabled
                                                    ? "Pembatasan aktif"
                                                    : "Pembatasan sementara nonaktif"}
                                            </h3>
                                            <p className="mt-1 text-sm leading-5 text-slate-600">
                                                {settingsEnabled
                                                    ? "Pengajuan baru ditahan bila akomodasi sebelumnya belum direalisasikan atau diselesaikan."
                                                    : "Pengajuan akomodasi dan Business Trip baru dapat dikirim meskipun ada akomodasi sebelumnya yang belum selesai."}
                                            </p>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={settingsEnabled}
                                        disabled={settingsSaving}
                                        onClick={() =>
                                            persistAccommodationSettings({
                                                nextEnabled: !settingsEnabled,
                                            })
                                        }
                                        className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                            settingsEnabled
                                                ? "bg-emerald-600"
                                                : "bg-slate-400"
                                        }`}
                                    >
                                        <span
                                            className={`inline-block h-6 w-6 rounded-full bg-white shadow transition ${
                                                settingsEnabled
                                                    ? "translate-x-7"
                                                    : "translate-x-1"
                                            }`}
                                        />
                                        <span className="sr-only">
                                            {settingsEnabled
                                                ? "Nonaktifkan pembatasan"
                                                : "Aktifkan pembatasan"}
                                        </span>
                                    </button>
                                </div>
                            </div>

                            <label className="block">
                                <span className="text-sm font-semibold text-slate-800">
                                    Catatan perubahan
                                </span>
                                <span className="mt-1 block text-xs leading-5 text-slate-500">
                                    Opsional. Jelaskan alasan mengubah aturan.
                                </span>
                                <textarea
                                    value={settingsNote}
                                    onChange={(event) =>
                                        setSettingsNote(event.target.value)
                                    }
                                    rows={3}
                                    placeholder="Contoh: Pemutihan data akomodasi sampai 31 Oktober."
                                    className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                                />
                            </label>

                            <div className="flex items-start gap-2 text-xs leading-5 text-slate-500">
                                <AlertTriangle
                                    size={15}
                                    className="mt-0.5 shrink-0 text-amber-600"
                                />
                                <p>
                                    Toggle langsung menyimpan perubahan. Saat
                                    nonaktif, pengajuan baru tetap dapat masuk
                                    meskipun ada saldo akomodasi terdahulu yang
                                    belum selesai.
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                                <p className="text-xs text-slate-500">
                                    Terakhir diperbarui: {formatSettingUpdatedAt(settingsUpdatedAt)}
                                </p>
                                <button
                                    type="button"
                                    onClick={() =>
                                        persistAccommodationSettings({
                                            successMessage:
                                                "Catatan pengaturan telah disimpan.",
                                        })
                                    }
                                    disabled={settingsSaving}
                                    className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {settingsSaving ? (
                                        <LoaderCircle
                                            className="animate-spin"
                                            size={16}
                                        />
                                    ) : (
                                        <Save size={16} />
                                    )}
                                    Simpan Catatan
                                </button>
                            </div>

                            {settingsMessage && (
                                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                    {settingsMessage}
                                </p>
                            )}
                        </div>
                    )}
                </Modal>
            )}

            {createOpen && (
                <Modal
                    title="Create Accommodation Request"
                    onClose={() => {
                        setCreateForm({ customerId: "", projectId: "" });
                        setCreateOpen(false);
                    }}
                >
                    <form
                        onSubmit={submitCreate}
                        className="grid gap-3 md:grid-cols-2"
                    >
                        <TextInput
                            name="request_title"
                            label="Request Title"
                            required
                        />
                        <CurrencyInput
                            name="requested_amount"
                            label="Requested Amount"
                            required
                        />
                        <label className="md:col-span-2">
                            <span className="text-sm font-medium text-slate-700">
                                Purpose
                            </span>
                            <textarea
                                name="purpose"
                                required
                                rows={3}
                                className={inputClass}
                            />
                        </label>
                        <label>
                            <span className="text-sm font-medium text-slate-700">
                                Customer
                            </span>
                            <CustomSelect
                                value={createForm.customerId}
                                onChange={(value) =>
                                    setCreateForm({
                                        customerId: value,
                                        projectId: "",
                                    })
                                }
                                options={customerOptions}
                                placeholder="Optional"
                            />
                        </label>
                        <label>
                            <span className="text-sm font-medium text-slate-700">
                                Project
                            </span>
                            <CustomSelect
                                value={createForm.projectId}
                                onChange={(value) =>
                                    setCreateForm((prev) => ({
                                        ...prev,
                                        projectId: value,
                                    }))
                                }
                                options={projectOptions}
                                placeholder={
                                    createForm.customerId
                                        ? "Optional"
                                        : "Pilih customer dulu"
                                }
                                disabled={!createForm.customerId}
                            />
                        </label>
                        <SubmitButton
                            saving={saving}
                            label="Submit Request"
                            className="md:col-span-2"
                        />
                    </form>
                </Modal>
            )}

            {selectedTechnicianGroup && (
                <AccommodationTechnicianDetail
                    group={selectedTechnicianGroup}
                    onClose={() => setSelectedTechnicianId(null)}
                    onSelectRequest={(requestId) => {
                        setSelectedTechnicianId(null);
                        setSelectedId(requestId);
                    }}
                />
            )}

            {selectedRequest && (
                <DetailDrawer
                    request={selectedRequest}
                    mode={mode}
                    canApprove={canApprove}
                    canAddRealization={
                        canAddRealization &&
                        [
                            "approved",
                            "realization_process",
                            "partial_realized",
                        ].includes(selectedRequest.status)
                    }
                    onClose={() => setSelectedId(null)}
                    onApprove={() => setApprovalMode("approve")}
                    onReject={() => setApprovalMode("reject")}
                    onAddRealization={() => setRealizationOpen(true)}
                    onDelete={() => handleDeleteRequest(selectedRequest)}
                />
            )}

            {approvalMode && selectedRequest && (
                <Modal
                    title={
                        approvalMode === "approve"
                            ? "Approve Request"
                            : "Reject Request"
                    }
                    onClose={() => setApprovalMode(null)}
                >
                    <form onSubmit={submitApproval} className="grid gap-3">
                        {approvalMode === "approve" ? (
                            <>
                                <CurrencyInput
                                    name="approved_amount"
                                    label="Approved Amount"
                                    defaultValue={
                                        selectedRequest.requested_amount
                                    }
                                    required
                                />
                                <FileInput
                                    name="transfer_proof"
                                    label="Transfer Proof"
                                    required
                                />
                                <label>
                                    <span className="text-sm font-medium text-slate-700">
                                        Notes
                                    </span>
                                    <textarea
                                        name="approval_notes"
                                        rows={3}
                                        className={inputClass}
                                        defaultValue={
                                            selectedRequest.notes ?? ""
                                        }
                                    />
                                </label>
                            </>
                        ) : (
                            <label>
                                <span className="text-sm font-medium text-slate-700">
                                    Rejection Reason
                                </span>
                                <textarea
                                    name="rejection_reason"
                                    rows={4}
                                    className={inputClass}
                                    required
                                />
                            </label>
                        )}
                        <SubmitButton
                            saving={saving}
                            label={
                                approvalMode === "approve"
                                    ? "Approve"
                                    : "Reject"
                            }
                        />
                    </form>
                </Modal>
            )}

            {realizationOpen && selectedRequest && (
                <Modal
                    title="Add Realization"
                    onClose={() => {
                        setReceiptPhotoFile(null);
                        setRealizationOpen(false);
                    }}
                >
                    <form onSubmit={submitRealization} className="grid gap-3">
                        <ReceiptPhotoInput
                            label="Receipt Photo"
                            file={receiptPhotoFile}
                            onChange={setReceiptPhotoFile}
                        />
                        <CurrencyInput name="amount" label="Amount" required />
                        <TextInput
                            name="transaction_date"
                            label="Transaction Date"
                            type="date"
                            defaultValue={todayKey()}
                            required
                        />
                        <label>
                            <span className="text-sm font-medium text-slate-700">
                                Description
                            </span>
                            <textarea
                                name="description"
                                rows={3}
                                className={inputClass}
                            />
                        </label>
                        <SubmitButton
                            saving={saving}
                            label="Upload Realization"
                        />
                    </form>
                </Modal>
            )}
        </div>
    );
}

function AccommodationTechnicianDetail({ group, onClose, onSelectRequest }) {
    const [filters, setFilters] = useState({
        period: "all",
        dateFrom: "",
        dateTo: "",
        status: "all",
        search: "",
    });

    const visibleItems = useMemo(() => {
        const keyword = filters.search.trim().toLowerCase();
        return group.items.filter((item) => {
            const matchesStatus =
                filters.status === "all" || item.status === filters.status;
            const matchesSearch = `${item.request_title ?? ""} ${
                item.purpose ?? ""
            } ${getAccommodationCustomerLabel(item)} ${
                getAccommodationProjectLabel(item)
            }`
                .toLowerCase()
                .includes(keyword);

            return (
                matchesStatus &&
                matchesSearch &&
                matchesPeriod(item, {
                    mode: filters.period,
                    weekStart: getWeekStartKey(),
                    weekEnd: getWeekEndKey(),
                    month: getMonthKey(),
                    year: getYearKey(),
                    startDate: filters.dateFrom,
                    endDate: filters.dateTo,
                })
            );
        });
    }, [filters, group.items]);

    const visibleRequestedAmount = visibleItems.reduce(
        (total, item) => total + Number(item.requested_amount ?? 0),
        0,
    );

    return (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/50 p-0 md:p-4">
            <div className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl md:max-h-[92vh] md:max-w-6xl md:rounded-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 md:px-5">
                    <div className="min-w-0">
                        <h2 className="truncate text-lg font-semibold text-slate-900">
                            {getDisplayName(group.technician)}
                        </h2>
                        <p className="mt-1 text-sm text-slate-600">
                            {visibleItems.length} dari {group.items.length} pengajuan · Total request {formatCurrency(visibleRequestedAmount)}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                        aria-label="Tutup detail pengaju akomodasi"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                            <Filter size={16} />
                            Filter pengajuan {getDisplayName(group.technician)}
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <CustomSelect
                                value={filters.period}
                                onChange={(value) =>
                                    setFilters((current) => ({
                                        ...current,
                                        period: value,
                                    }))
                                }
                                options={[
                                    { value: "all", label: "Semua periode" },
                                    { value: "today", label: "Hari ini" },
                                    { value: "weekly", label: "Minggu ini" },
                                    { value: "monthly", label: "Bulan ini" },
                                    { value: "yearly", label: "Tahun ini" },
                                    { value: "custom", label: "Custom range" },
                                ]}
                            />
                            {filters.period === "custom" && (
                                <>
                                    <input
                                        type="date"
                                        value={filters.dateFrom}
                                        onChange={(event) =>
                                            setFilters((current) => ({
                                                ...current,
                                                dateFrom: event.target.value,
                                            }))
                                        }
                                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                        aria-label="Tanggal awal"
                                    />
                                    <input
                                        type="date"
                                        value={filters.dateTo}
                                        onChange={(event) =>
                                            setFilters((current) => ({
                                                ...current,
                                                dateTo: event.target.value,
                                            }))
                                        }
                                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                        aria-label="Tanggal akhir"
                                    />
                                </>
                            )}
                            <CustomSelect
                                value={filters.status}
                                onChange={(value) =>
                                    setFilters((current) => ({
                                        ...current,
                                        status: value,
                                    }))
                                }
                                options={[
                                    { value: "all", label: "Semua status" },
                                    { value: "pending", label: "Pending" },
                                    { value: "approved", label: "Approved" },
                                    {
                                        value: "realization_process",
                                        label: "Realisasi diproses",
                                    },
                                    {
                                        value: "partial_realized",
                                        label: "Realisasi sebagian",
                                    },
                                    { value: "realized", label: "Realized" },
                                    { value: "rejected", label: "Rejected" },
                                ]}
                            />
                            <label className="relative block">
                                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="search"
                                    value={filters.search}
                                    onChange={(event) =>
                                        setFilters((current) => ({
                                            ...current,
                                            search: event.target.value,
                                        }))
                                    }
                                    placeholder="Cari judul atau purpose"
                                    className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm"
                                />
                            </label>
                        </div>
                    </div>

                    <div className="mt-4 space-y-3">
                        {visibleItems.length ? (
                            visibleItems.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => onSelectRequest(item.id)}
                                    className="flex w-full flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-sky-300 hover:bg-sky-50 md:flex-row md:items-start md:justify-between"
                                >
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="font-semibold text-slate-900">
                                                {item.request_title}
                                            </p>
                                            <StatusBadge status={item.status} />
                                        </div>
                                        <p className="mt-2 text-sm text-slate-600">
                                            {item.purpose}
                                        </p>
                                        <p className="mt-2 text-xs font-medium text-slate-500">
                                            {getAccommodationCustomerLabel(item)} · {getAccommodationProjectLabel(item)} · {formatDate(item.requested_at || item.created_at)}
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-sm md:min-w-72">
                                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                                            <p className="text-xs font-medium text-slate-500">
                                                Request
                                            </p>
                                            <p className="mt-1 font-semibold text-slate-900">
                                                {formatCurrency(item.requested_amount)}
                                            </p>
                                        </div>
                                        <div className="rounded-xl bg-amber-50 px-3 py-2">
                                            <p className="text-xs font-medium text-amber-700">
                                                Sisa
                                            </p>
                                            <p className="mt-1 font-semibold text-amber-900">
                                                {item.approved_amount
                                                    ? formatCurrency(item.remainingAmount)
                                                    : "-"}
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            ))
                        ) : (
                            <div className="rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50 p-8 text-center text-sm text-sky-700">
                                Tidak ada pengajuan yang sesuai filter.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function DetailDrawer({
    request,
    mode,
    canApprove,
    canAddRealization,
    onClose,
    onApprove,
    onReject,
    onAddRealization,
    onDelete,
}) {
    const [imagePreview, setImagePreview] = useState({
        open: false,
        url: "",
        label: "",
    });

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

                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <StatusBadge status={request.status} />
                    {canApprove && request.status === "pending" && (
                        <>
                            <button
                                type="button"
                                onClick={onApprove}
                                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
                            >
                                <CheckCircle2 size={16} />
                                Approve
                            </button>
                            <button
                                type="button"
                                onClick={onReject}
                                className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-600"
                            >
                                <XCircle size={16} />
                                Reject
                            </button>
                        </>
                    )}
                    {canAddRealization && (
                        <button
                            type="button"
                            onClick={onAddRealization}
                            className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-600"
                        >
                            <Upload size={16} />
                            Add Realization
                        </button>
                    )}
                    {mode === "admin" && (
                        <button
                            type="button"
                            onClick={onDelete}
                            className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-600"
                        >
                            <Trash2 size={16} />
                            Delete
                        </button>
                    )}
                </div>

                <section className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <InfoCard
                        label="Requested"
                        value={formatCurrency(request.requested_amount)}
                    />
                    <InfoCard
                        label="Approved"
                        value={
                            request.approved_amount
                                ? formatCurrency(request.approved_amount)
                                : "-"
                        }
                    />
                    <InfoCard
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
                            <span className="font-medium">Notes:</span>{" "}
                            {request.notes ?? "-"}
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
                                    openImagePreview(
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
                                        <div className="flex flex-wrap gap-2">
                                            {(item.receipt_photo_urls?.length
                                                ? item.receipt_photo_urls
                                                : item.receipt_photo_url
                                                  ? [
                                                        {
                                                            id: item.id,
                                                            label: "Receipt",
                                                            url: item.receipt_photo_url,
                                                        },
                                                    ]
                                                  : []
                                            ).map((photo, photoIndex) => (
                                                <button
                                                    key={photo.id ?? photo.url}
                                                    type="button"
                                                    onClick={() =>
                                                        openImagePreview(
                                                            photo.url,
                                                            photo.label ??
                                                                `Receipt ${photoIndex + 1}`,
                                                        )
                                                    }
                                                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 no-underline hover:bg-slate-50"
                                                >
                                                    <FileImage size={16} />
                                                    Foto {photoIndex + 1}
                                                </button>
                                            ))}
                                        </div>
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

                {mode === "admin" && (
                    <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
                        Admin dapat monitoring, menambahkan realisasi, dan
                        menghapus pengajuan, serta approve atau reject
                        pengajuan.
                    </p>
                )}
                {imagePreview.open && (
                    <ImagePreviewModal
                        title={`Preview Foto ${imagePreview.label}`}
                        src={imagePreview.url}
                        alt={`Foto ${imagePreview.label}`}
                        onClose={() =>
                            setImagePreview({
                                open: false,
                                url: "",
                                label: "",
                            })
                        }
                    />
                )}
            </aside>
        </div>
    );
}

function Modal({ title, children, onClose }) {
    return (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 md:px-6">
                    <h2 className="text-lg font-semibold text-slate-900">
                        {title}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                    >
                        <X size={18} />
                    </button>
                </div>
                <div className="min-h-0 overflow-y-auto p-4 md:p-6">
                    {children}
                </div>
            </div>
        </div>
    );
}

function TextInput({ label, name, ...props }) {
    return (
        <label>
            <span className="text-sm font-medium text-slate-700">{label}</span>
            <input name={name} className={inputClass} {...props} />
        </label>
    );
}

function CurrencyInput({ label, name, defaultValue = "", required = false }) {
    const [displayValue, setDisplayValue] = useState(
        formatNumberInput(defaultValue),
    );
    const rawValue = onlyDigits(displayValue);

    return (
        <label>
            <span className="text-sm font-medium text-slate-700">{label}</span>
            <input type="hidden" name={name} value={rawValue} />
            <input
                value={displayValue}
                onChange={(event) =>
                    setDisplayValue(formatNumberInput(event.target.value))
                }
                inputMode="numeric"
                required={required}
                className={inputClass}
                placeholder="1,000,000"
            />
        </label>
    );
}

function FileInput({ label, name, required }) {
    return (
        <label>
            <span className="text-sm font-medium text-slate-700">{label}</span>
            <input
                name={name}
                type="file"
                accept="image/*,.pdf"
                required={required}
                className="mt-1 w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700"
            />
        </label>
    );
}

function ReceiptPhotoInput({ label, file, onChange }) {
    const [cameraOpen, setCameraOpen] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [cameraError, setCameraError] = useState("");
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const previewUrl = useMemo(() => {
        if (!file || !String(file.type ?? "").startsWith("image/")) return "";
        return URL.createObjectURL(file);
    }, [file]);

    const stopCamera = useCallback(() => {
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        setCameraReady(false);
        setCameraOpen(false);
    }, []);

    useEffect(
        () => () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        },
        [previewUrl],
    );

    useEffect(() => () => stopCamera(), [stopCamera]);

    useEffect(() => {
        if (!cameraOpen || !streamRef.current || !videoRef.current) return;

        const video = videoRef.current;
        video.srcObject = streamRef.current;
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch((error) => {
                console.error("Receipt camera preview failed:", error);
                setCameraError(
                    "Preview kamera belum bisa diputar. Coba tutup lalu buka kamera lagi.",
                );
            });
        }
    }, [cameraOpen]);

    const openCamera = async () => {
        try {
            setCameraError("");
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" },
                audio: false,
            });
            streamRef.current = stream;
            setCameraOpen(true);
        } catch (error) {
            console.error("Receipt camera failed:", error);
            setCameraError(
                "Kamera tidak bisa dibuka. Gunakan upload file sebagai alternatif.",
            );
        }
    };

    const capturePhoto = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;
        if (!video.videoWidth || !video.videoHeight) {
            setCameraError(
                "Preview kamera belum siap. Tunggu sebentar lalu capture lagi.",
            );
            return;
        }

        const width = video.videoWidth;
        const height = video.videoHeight;
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(video, 0, 0, width, height);
        canvas.toBlob(
            (blob) => {
                if (!blob) return;
                const nextFile = new File([blob], `receipt-${Date.now()}.jpg`, {
                    type: "image/jpeg",
                });
                onChange(nextFile);
                stopCamera();
            },
            "image/jpeg",
            0.9,
        );
    };

    return (
        <div>
            <span className="text-sm font-medium text-slate-700">{label}</span>
            <div className="mt-1 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3">
                <div className="grid grid-cols-2 gap-2">
                    <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                        <FolderOpen size={16} />
                        File
                        <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => {
                                const nextFile = event.target.files?.[0];
                                if (nextFile) onChange(nextFile);
                                event.target.value = "";
                            }}
                        />
                    </label>
                    <button
                        type="button"
                        onClick={openCamera}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                    >
                        <Camera size={16} />
                        Camera
                    </button>
                </div>

                {file && (
                    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                        <p className="text-sm font-semibold text-emerald-700">
                            {file.name}
                        </p>
                        <p className="mt-1 text-xs text-emerald-600">
                            Siap diupload dan akan dikompres otomatis.
                        </p>
                    </div>
                )}

                {previewUrl && (
                    <img
                        src={previewUrl}
                        alt="Preview receipt"
                        className="mt-3 max-h-56 w-full rounded-xl object-contain bg-black"
                    />
                )}

                {cameraOpen && (
                    <div className="mt-3 overflow-hidden rounded-xl bg-black">
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            onLoadedMetadata={() => {
                                setCameraReady(true);
                                videoRef.current?.play?.();
                            }}
                            className="h-72 w-full object-cover"
                        />
                        {!cameraReady && (
                            <div className="bg-slate-900 px-3 py-2 text-center text-sm font-medium text-white">
                                Menyiapkan kamera...
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-2 bg-white p-2">
                            <button
                                type="button"
                                onClick={stopCamera}
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={capturePhoto}
                                disabled={!cameraReady}
                                className="rounded-xl bg-sky-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                Capture
                            </button>
                        </div>
                    </div>
                )}

                {cameraError && (
                    <p className="mt-2 text-sm font-medium text-red-600">
                        {cameraError}
                    </p>
                )}

                <canvas ref={canvasRef} className="hidden" />
            </div>
        </div>
    );
}

function SubmitButton({ saving, label, className = "" }) {
    return (
        <button
            type="submit"
            disabled={saving}
            className={`inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
        >
            {saving ? "Saving..." : label}
        </button>
    );
}

function InfoCard({ label, value }) {
    return (
        <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">
                {label}
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
        </div>
    );
}
