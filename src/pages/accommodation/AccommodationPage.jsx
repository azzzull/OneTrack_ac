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
    BarChart3,
    Camera,
    CalendarDays,
    CheckCircle2,
    Clock3,
    Eye,
    FileImage,
    FolderOpen,
    Plus,
    Receipt,
    Search,
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
import { createUniqueChannelName } from "../../utils/realtimeChannelManager";

const statusFilters = [
    { key: "pending", title: "Pending", icon: Clock3 },
    { key: "approved", title: "Approved", icon: CheckCircle2 },
    { key: "rejected", title: "Rejected", icon: XCircle },
    { key: "partial_realized", title: "Partial", icon: Receipt },
    { key: "realized", title: "Realized", icon: FileImage },
];

const periodOptions = [
    { key: "weekly", label: "Weekly" },
    { key: "monthly", label: "Monthly" },
    { key: "yearly", label: "Yearly" },
    { key: "custom", label: "Custom" },
];

const inputClass =
    "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-300";

const periodInputClass =
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-300";

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
    toDateKey(request.requested_at || request.created_at || request.reviewed_at);

const matchesPeriod = (request, period) => {
    const dateKey = getRequestDateKey(request);
    if (!dateKey) return false;

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

const SummaryCard = ({
    title,
    value,
    icon: Icon,
    compact = false,
    active = false,
    onClick,
    wide = false,
}) => {
    const Component = onClick ? "button" : "div";

    return (
        <Component
            type={onClick ? "button" : undefined}
            onClick={onClick}
            className={`w-full rounded-2xl bg-white text-left shadow-sm transition ${
                compact ? "h-25 p-3" : "p-4"
            } ${wide ? "min-w-max" : ""} ${
                active
                    ? "ring-2 ring-sky-400"
                    : onClick
                      ? "hover:-translate-y-0.5 hover:shadow-md"
                      : ""
            }`}
        >
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p
                        className={`${
                            compact
                                ? "line-clamp-2 min-h-8 text-xs"
                                : "text-sm"
                        } text-slate-500`}
                    >
                        {title}
                    </p>
                    <p
                        className={`mt-1 whitespace-nowrap font-semibold leading-tight text-slate-900 ${
                            compact ? "text-lg" : "text-2xl"
                        }`}
                    >
                        {value}
                    </p>
                </div>
                <span
                    className={`rounded-2xl ${
                        active ? "bg-sky-500 text-white" : "bg-sky-50 text-sky-500"
                    } ${compact ? "p-2" : "p-3"}`}
                >
                    {createElement(Icon, { size: compact ? 18 : 22 })}
                </span>
            </div>
        </Component>
    );
};

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
    const [filter, setFilter] = useState(null);
    const [periodMode, setPeriodMode] = useState("weekly");
    const [weekStart, setWeekStart] = useState(getWeekStartKey());
    const [weekEnd, setWeekEnd] = useState(getWeekEndKey());
    const [monthFilter, setMonthFilter] = useState(getMonthKey());
    const [yearFilter, setYearFilter] = useState(getYearKey());
    const [customStartDate, setCustomStartDate] = useState(todayKey());
    const [customEndDate, setCustomEndDate] = useState(todayKey());
    const [search, setSearch] = useState("");
    const [selectedId, setSelectedId] = useState(null);
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

    const isManagement = role === "management";
    const isTechnician = role === "technician";
    const isInternalTechnician =
        isTechnician && profile?.technician_type === "internal";
    const isAdmin = role === "admin";
    const showTechnicianColumn = mode !== "technician";
    const canApprove = isManagement && mode === "management";
    const canCreate =
        (mode === "technician" && isInternalTechnician) ||
        (mode === "admin" && isAdmin);
    const canAddRealization = mode === "technician" && isInternalTechnician;
    const canViewAccommodationReport =
        ["admin", "management"].includes(role) &&
        ["admin", "management"].includes(mode);

    const loadData = useCallback(async () => {
        try {
            const [requestRows, lookupRows] = await Promise.all([
                loadAccommodationRequests({ role, userId: user?.id }),
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
    }, [role, user?.id]);

    useEffect(() => {
        isMountedRef.current = true;
        loadData();
        return () => {
            isMountedRef.current = false;
        };
    }, [loadData]);

    useEffect(() => {
        if (!user?.id) return;
        const channelName = `${createUniqueChannelName(
            "accommodation",
            user.id,
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
    }, [loadData, user?.id]);

    const periodFilter = useMemo(
        () => ({
            mode: periodMode,
            weekStart,
            weekEnd,
            month: monthFilter,
            year: yearFilter,
            startDate: customStartDate,
            endDate: customEndDate,
        }),
        [
            customEndDate,
            customStartDate,
            monthFilter,
            periodMode,
            weekEnd,
            weekStart,
            yearFilter,
        ],
    );

    const periodRequests = useMemo(
        () => requests.filter((item) => matchesPeriod(item, periodFilter)),
        [periodFilter, requests],
    );

    const periodLabel = useMemo(() => {
        if (periodMode === "weekly") {
            return `${formatDate(weekStart)} - ${formatDate(weekEnd)}`;
        }

        if (periodMode === "monthly") {
            const [year, month] = monthFilter.split("-");
            const date = new Date(Number(year), Number(month) - 1, 1);
            return date.toLocaleDateString("id-ID", {
                month: "long",
                year: "numeric",
            });
        }

        if (periodMode === "yearly") {
            return `Tahun ${yearFilter}`;
        }

        return `${formatDate(customStartDate)} - ${formatDate(customEndDate)}`;
    }, [
        customEndDate,
        customStartDate,
        monthFilter,
        periodMode,
        weekEnd,
        weekStart,
        yearFilter,
    ]);

    const handleCardFilter = (key) => {
        setFilter((current) => (current === key ? null : key));
    };

    const filteredRequests = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        return periodRequests.filter((item) => {
            const matchesFilter =
                !filter ||
                (filter === "outstanding"
                    ? Number(item.remainingAmount ?? 0) > 0
                    : item.status === filter);
            const haystack = `${item.request_title ?? ""} ${
                item.purpose ?? ""
            } ${getDisplayName(item.technician)}`.toLowerCase();
            return matchesFilter && (!keyword || haystack.includes(keyword));
        });
    }, [filter, periodRequests, search]);

    const selectedRequest = useMemo(
        () => requests.find((item) => item.id === selectedId) ?? null,
        [requests, selectedId],
    );

    const dashboardStats = useMemo(() => {
        const count = (status) =>
            periodRequests.filter((item) => item.status === status).length;
        return {
            pending: count("pending"),
            approved: count("approved"),
            rejected: count("rejected"),
            partial_realized: count("partial_realized"),
            realized: count("realized"),
            outstanding: periodRequests.reduce(
                (sum, item) => sum + Number(item.remainingAmount ?? 0),
                0,
            ),
            pendingAmount: periodRequests
                .filter((item) => item.status === "pending")
                .reduce(
                    (sum, item) => sum + Number(item.requested_amount ?? 0),
                    0,
                ),
        };
    }, [periodRequests]);

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

    const openCreateModal = () => {
        setCreateForm({ customerId: "", projectId: "" });
        setCreateOpen(true);
    };

    const submitCreate = async (event) => {
        event.preventDefault();
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
                                Kelola pengajuan akomodasi, cash advance, dan
                                realisasi operasional teknisi.
                            </p>
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
                                    placeholder="Cari title atau purpose..."
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
                        </div>
                    </div>

                    <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <p className="text-sm font-semibold text-slate-900">
                                    Filter Periode
                                </p>
                                <p className="mt-1 text-sm text-slate-500">
                                    Periode: {periodLabel}
                                </p>
                            </div>
                            <div className="flex flex-col gap-3 md:flex-row md:items-end">
                                <div className="block md:hidden">
                                    <CustomSelect
                                        value={periodMode}
                                        onChange={setPeriodMode}
                                        options={periodOptions.map((item) => ({
                                            value: item.key,
                                            label: item.label,
                                        }))}
                                    />
                                </div>
                                <div className="hidden rounded-full bg-slate-100 p-1 md:inline-flex">
                                    {periodOptions.map((item) => (
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

                                {periodMode === "weekly" && (
                                    <div className="flex flex-wrap gap-2">
                                        <input
                                            type="date"
                                            value={weekStart}
                                            onChange={(event) =>
                                                setWeekStart(
                                                    event.target.value,
                                                )
                                            }
                                            className={`${periodInputClass} w-40`}
                                        />
                                        <input
                                            type="date"
                                            value={weekEnd}
                                            onChange={(event) =>
                                                setWeekEnd(event.target.value)
                                            }
                                            className={`${periodInputClass} w-40`}
                                        />
                                    </div>
                                )}

                                {periodMode === "monthly" && (
                                    <input
                                        type="month"
                                        value={monthFilter}
                                        onChange={(event) =>
                                            setMonthFilter(event.target.value)
                                        }
                                        className={`${periodInputClass} w-36`}
                                    />
                                )}

                                {periodMode === "yearly" && (
                                    <input
                                        type="number"
                                        min="2020"
                                        max="2100"
                                        value={yearFilter}
                                        onChange={(event) =>
                                            setYearFilter(event.target.value)
                                        }
                                        className={`${periodInputClass} w-24`}
                                    />
                                )}

                                {periodMode === "custom" && (
                                    <div className="flex flex-wrap gap-2">
                                        <input
                                            type="date"
                                            value={customStartDate}
                                            onChange={(event) =>
                                                setCustomStartDate(
                                                    event.target.value,
                                                )
                                            }
                                            className={`${periodInputClass} w-40`}
                                        />
                                        <input
                                            type="date"
                                            value={customEndDate}
                                            onChange={(event) =>
                                                setCustomEndDate(
                                                    event.target.value,
                                                )
                                            }
                                            className={`${periodInputClass} w-40`}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    {canViewAccommodationReport && (
                        <section className="mt-6">
                            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:hidden">
                                {statusFilters.map((item) => (
                                    <div key={item.key} className="min-w-36">
                                        <SummaryCard
                                            title={item.title}
                                            value={dashboardStats[item.key]}
                                            icon={item.icon}
                                            compact
                                            active={filter === item.key}
                                            onClick={() =>
                                                handleCardFilter(item.key)
                                            }
                                        />
                                    </div>
                                ))}
                                <div className="min-w-64">
                                    <SummaryCard
                                        title="Outstanding"
                                        value={formatCurrency(
                                            dashboardStats.outstanding,
                                        )}
                                        icon={Banknote}
                                        compact
                                        wide
                                        active={filter === "outstanding"}
                                        onClick={() =>
                                            handleCardFilter("outstanding")
                                        }
                                    />
                                </div>
                                <div className="min-w-64">
                                    <SummaryCard
                                        title="Pending Amount"
                                        value={formatCurrency(
                                            dashboardStats.pendingAmount,
                                        )}
                                        icon={CalendarDays}
                                        compact
                                        wide
                                        active={filter === "pending"}
                                        onClick={() =>
                                            handleCardFilter("pending")
                                        }
                                    />
                                </div>
                            </div>
                            <div className="hidden gap-4 md:flex md:flex-wrap">
                                {statusFilters.map((item) => (
                                    <div
                                        key={item.key}
                                        className="min-w-40 flex-1"
                                    >
                                        <SummaryCard
                                            title={item.title}
                                            value={dashboardStats[item.key]}
                                            icon={item.icon}
                                            active={filter === item.key}
                                            onClick={() =>
                                                handleCardFilter(item.key)
                                            }
                                        />
                                    </div>
                                ))}
                                <div className="min-w-72 flex-1">
                                    <SummaryCard
                                        title="Outstanding"
                                        value={formatCurrency(
                                            dashboardStats.outstanding,
                                        )}
                                        icon={Banknote}
                                        wide
                                        active={filter === "outstanding"}
                                        onClick={() =>
                                            handleCardFilter("outstanding")
                                        }
                                    />
                                </div>
                                <div className="min-w-72 flex-1">
                                    <SummaryCard
                                        title="Pending Amount"
                                        value={formatCurrency(
                                            dashboardStats.pendingAmount,
                                        )}
                                        icon={CalendarDays}
                                        wide
                                        active={filter === "pending"}
                                        onClick={() =>
                                            handleCardFilter("pending")
                                        }
                                    />
                                </div>
                            </div>
                            {filter && (
                                <div className="mt-3 flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setFilter(null)}
                                        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                                    >
                                        Clear filter
                                    </button>
                                </div>
                            )}
                        </section>
                    )}

                    <section className="mt-6 space-y-3">
                        {loading ? (
                            <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
                                Loading accommodation requests...
                            </div>
                        ) : filteredRequests.length ? (
                            filteredRequests.map((item) => (
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
                    className="fixed bottom-24 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-sky-600 text-white shadow-xl shadow-sky-900/20 hover:bg-sky-700 md:bottom-6"
                    aria-label="Create accommodation request"
                    title="Create accommodation request"
                >
                    <Plus size={26} />
                </button>
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
                                        <button
                                            type="button"
                                            onClick={() =>
                                                openImagePreview(
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

                {mode === "admin" && (
                    <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
                        Admin dapat monitoring dan menghapus pengajuan. Approval
                        tetap hanya untuk role management.
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
