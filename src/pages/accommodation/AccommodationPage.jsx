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
    CheckCircle2,
    Clock3,
    Download,
    FileImage,
    ListFilter,
    Plus,
    Receipt,
    Search,
    Upload,
    X,
    XCircle,
} from "lucide-react";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
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
    formatCurrency,
    getDisplayName,
    loadAccommodationLookups,
    loadAccommodationRequests,
    rejectAccommodationRequest,
    uploadAccommodationFile,
} from "../../services/accommodationService";
import { createUniqueChannelName } from "../../utils/realtimeChannelManager";

const filters = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
    { key: "partial_realized", label: "Partial Realized" },
    { key: "realized", label: "Realized" },
];

const inputClass =
    "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-300";

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

const getProjectLabel = (project) =>
    project?.project_name || project?.name || "Project";

const StatusBadge = ({ status }) => (
    <span
        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
            STATUS_STYLES[status] ?? STATUS_STYLES.pending
        }`}
    >
        {STATUS_LABELS[status] ?? "Pending"}
    </span>
);

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

export default function AccommodationPage({ mode = "technician" }) {
    const { user, role, profile } = useAuth();
    const { alert: showAlert } = useDialog();
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const [requests, setRequests] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [filter, setFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [selectedId, setSelectedId] = useState(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [approvalMode, setApprovalMode] = useState(null);
    const [realizationOpen, setRealizationOpen] = useState(false);
    const channelRef = useRef(null);
    const isMountedRef = useRef(true);

    const isManagement = role === "management";
    const isTechnician = role === "technician";
    const isInternalTechnician =
        isTechnician && profile?.technician_type === "internal";
    const canApprove = isManagement && mode === "management";
    const canCreate = mode === "technician" && isInternalTechnician;
    const canAddRealization = mode === "technician" && isInternalTechnician;

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
        const channelName = createUniqueChannelName("accommodation", user.id);
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

        channelRef.current.subscribe();

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [loadData, user?.id]);

    const filteredRequests = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        return requests.filter((item) => {
            const matchesFilter = filter === "all" || item.status === filter;
            const haystack =
                `${item.request_title ?? ""} ${item.purpose ?? ""} ${getDisplayName(
                    item.technician,
                )}`.toLowerCase();
            return matchesFilter && (!keyword || haystack.includes(keyword));
        });
    }, [filter, requests, search]);

    const selectedRequest = useMemo(
        () => requests.find((item) => item.id === selectedId) ?? null,
        [requests, selectedId],
    );

    const dashboardStats = useMemo(() => {
        const count = (status) =>
            requests.filter((item) => item.status === status).length;
        return {
            pending: count("pending"),
            approved: count("approved"),
            rejected: count("rejected"),
            partial: count("partial_realized"),
            realized: count("realized"),
            outstanding: requests.reduce(
                (sum, item) => sum + Number(item.remainingAmount ?? 0),
                0,
            ),
        };
    }, [requests]);

    const submitCreate = async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        try {
            setSaving(true);
            await createAccommodationRequest({
                technician_id: user.id,
                request_title: formData.get("request_title"),
                purpose: formData.get("purpose"),
                requested_amount: formData.get("requested_amount"),
                customer_id: formData.get("customer_id"),
                project_id: formData.get("project_id"),
                job_scope: formData.get("job_scope"),
                notes: formData.get("notes"),
            });
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
            const file = formData.get("receipt_photo");
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
            });
            setRealizationOpen(false);
            await loadData();
        } catch (error) {
            await showAlert(error?.message ?? "Gagal upload realisasi.", {
                title: "Gagal",
            });
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
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
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
                        {canCreate && (
                            <button
                                type="button"
                                onClick={() => setCreateOpen(true)}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
                            >
                                <Plus size={16} />
                                New Request
                            </button>
                        )}
                    </div>

                    {mode === "management" && (
                        <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
                            <SummaryCard
                                title="Pending"
                                value={dashboardStats.pending}
                                icon={Clock3}
                            />
                            <SummaryCard
                                title="Approved"
                                value={dashboardStats.approved}
                                icon={CheckCircle2}
                            />
                            <SummaryCard
                                title="Rejected"
                                value={dashboardStats.rejected}
                                icon={XCircle}
                            />
                            <SummaryCard
                                title="Partial"
                                value={dashboardStats.partial}
                                icon={Receipt}
                            />
                            <SummaryCard
                                title="Realized"
                                value={dashboardStats.realized}
                                icon={FileImage}
                            />
                            <SummaryCard
                                title="Outstanding"
                                value={formatCurrency(
                                    dashboardStats.outstanding,
                                )}
                                icon={Banknote}
                            />
                        </section>
                    )}

                    <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex flex-wrap gap-2">
                                {filters.map((item) => (
                                    <button
                                        key={item.key}
                                        type="button"
                                        onClick={() => setFilter(item.key)}
                                        className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${
                                            filter === item.key
                                                ? "bg-sky-500 text-white"
                                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                        }`}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                            <label className="relative block w-full lg:max-w-xs">
                                <Search
                                    size={16}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                                />
                                <input
                                    value={search}
                                    onChange={(event) =>
                                        setSearch(event.target.value)
                                    }
                                    className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-300"
                                    placeholder="Search title or purpose"
                                />
                            </label>
                        </div>

                        <div className="mt-4 overflow-x-auto">
                            <table className="min-w-full text-left text-sm">
                                <thead className="text-xs uppercase text-slate-500">
                                    <tr className="border-b border-slate-200">
                                        {mode === "management" && (
                                            <th className="px-3 py-3">
                                                Technician
                                            </th>
                                        )}
                                        <th className="px-3 py-3">Title</th>
                                        <th className="px-3 py-3">Requested</th>
                                        <th className="px-3 py-3">Approved</th>
                                        <th className="px-3 py-3">Realized</th>
                                        <th className="px-3 py-3">Remaining</th>
                                        <th className="px-3 py-3">Status</th>
                                        <th className="px-3 py-3">Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td
                                                colSpan={
                                                    mode === "management"
                                                        ? 8
                                                        : 7
                                                }
                                                className="px-3 py-8 text-center text-slate-500"
                                            >
                                                Loading accommodation
                                                requests...
                                            </td>
                                        </tr>
                                    ) : filteredRequests.length ? (
                                        filteredRequests.map((item) => (
                                            <tr
                                                key={item.id}
                                                onClick={() =>
                                                    setSelectedId(item.id)
                                                }
                                                className="cursor-pointer border-b border-slate-100 hover:bg-sky-50"
                                            >
                                                {mode === "management" && (
                                                    <td className="px-3 py-3 text-slate-700">
                                                        {getDisplayName(
                                                            item.technician,
                                                        )}
                                                    </td>
                                                )}
                                                <td className="px-3 py-3">
                                                    <p className="font-semibold text-slate-900">
                                                        {item.request_title}
                                                    </p>
                                                    <p className="mt-1 max-w-xs truncate text-xs text-slate-500">
                                                        {item.purpose}
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
                                                    <StatusBadge
                                                        status={item.status}
                                                    />
                                                </td>
                                                <td className="px-3 py-3 text-slate-500">
                                                    {formatDate(
                                                        item.requested_at ||
                                                            item.created_at,
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td
                                                colSpan={
                                                    mode === "management"
                                                        ? 8
                                                        : 7
                                                }
                                                className="px-3 py-8 text-center text-slate-500"
                                            >
                                                Belum ada pengajuan.
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

            {createOpen && (
                <Modal
                    title="Create Accommodation Request"
                    onClose={() => setCreateOpen(false)}
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
                        <TextInput
                            name="requested_amount"
                            label="Requested Amount"
                            type="number"
                            min="1"
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
                        <SelectInput name="customer_id" label="Customer">
                            <option value="">Optional</option>
                            {customers.map((customer) => (
                                <option key={customer.id} value={customer.id}>
                                    {customer.name}
                                </option>
                            ))}
                        </SelectInput>
                        <SelectInput name="project_id" label="Project">
                            <option value="">Optional</option>
                            {projects.map((project) => (
                                <option key={project.id} value={project.id}>
                                    {getProjectLabel(project)}
                                </option>
                            ))}
                        </SelectInput>
                        <TextInput name="job_scope" label="Job Scope" />
                        <label>
                            <span className="text-sm font-medium text-slate-700">
                                Notes
                            </span>
                            <textarea
                                name="notes"
                                rows={2}
                                className={inputClass}
                            />
                        </label>
                        <SubmitButton saving={saving} label="Submit Request" />
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
                                <TextInput
                                    name="approved_amount"
                                    label="Approved Amount"
                                    type="number"
                                    min="1"
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
                    onClose={() => setRealizationOpen(false)}
                >
                    <form onSubmit={submitRealization} className="grid gap-3">
                        <FileInput
                            name="receipt_photo"
                            label="Receipt Photo"
                            required
                        />
                        <TextInput
                            name="amount"
                            label="Amount"
                            type="number"
                            min="1"
                            required
                        />
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
}) {
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
                            {request.customer?.name ?? "-"}
                        </p>
                        <p>
                            <span className="font-medium">Project:</span>{" "}
                            {getProjectLabel(request.project) ?? "-"}
                        </p>
                        <p>
                            <span className="font-medium">Job Scope:</span>{" "}
                            {request.job_scope ?? "-"}
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
                            <a
                                href={request.transfer_proof_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex w-fit items-center gap-2 rounded-xl border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-700 no-underline hover:bg-sky-50"
                            >
                                <Download size={16} />
                                Download Transfer Proof
                            </a>
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
                                        <a
                                            href={item.receipt_photo_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 no-underline hover:bg-slate-50"
                                        >
                                            <FileImage size={16} />
                                            View Receipt
                                        </a>
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
                        Admin memiliki akses baca. Approval hanya untuk role
                        management.
                    </p>
                )}
            </aside>
        </div>
    );
}

function Modal({ title, children, onClose }) {
    return (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl md:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
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
                {children}
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

function SelectInput({ label, name, children }) {
    return (
        <label>
            <span className="text-sm font-medium text-slate-700">{label}</span>
            <select name={name} className={inputClass}>
                {children}
            </select>
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

function SubmitButton({ saving, label }) {
    return (
        <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
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
