import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Banknote,
    BarChart3,
    Camera,
    Check,
    Eye,
    FileImage,
    Filter,
    Loader,
    Plus,
    Receipt,
    Search,
    Trash2,
    Upload,
    X,
} from "lucide-react";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import ImagePreviewModal from "../../components/ImagePreviewModal";
import CustomSelect from "../../components/ui/CustomSelect";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import { useAuth } from "../../context/useAuth";
import { useNavigate, useSearchParams } from "react-router-dom";
import supabase from "../../supabaseClient";
import { createUniqueChannelName } from "../../utils/realtimeChannelManager";
import {
    REIMBURSEMENT_STATUS_LABELS,
    REIMBURSEMENT_STATUS_STYLES,
    addReimbursementAttachments,
    approveReimbursement,
    createReimbursement,
    deleteReimbursement,
    formatCurrency,
    getDisplayName,
    loadReimbursementRequesters,
    loadReimbursements,
    rejectReimbursement,
    uploadReimbursementFile,
} from "../../services/reimbursementService";

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

const formatDateTime = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
};

const toDateKey = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
};

const isImageUrl = (url) =>
    /\.(png|jpe?g|webp|gif|bmp|avif)(\?.*)?$/i.test(String(url ?? ""));

const onlyDigits = (value) => String(value ?? "").replace(/\D/g, "");

const formatNumberInput = (value) => {
    const digits = onlyDigits(value);
    if (!digits) return "";
    return new Intl.NumberFormat("en-US").format(Number(digits));
};

const getWeekStart = (date) => {
    const next = new Date(date);
    const day = next.getDay() || 7;
    next.setDate(next.getDate() - day + 1);
    next.setHours(0, 0, 0, 0);
    return next.toISOString().slice(0, 10);
};

const matchesPeriod = (row, filters) => {
    const dateKey = toDateKey(row.transaction_date);
    if (!dateKey) return false;
    const now = new Date();

    if (filters.period === "today") return dateKey === todayKey();
    if (filters.period === "week") return dateKey >= getWeekStart(now);
    if (filters.period === "month") return dateKey.startsWith(todayKey().slice(0, 7));
    if (filters.period === "year") return dateKey.startsWith(String(now.getFullYear()));
    if (filters.period === "custom") {
        if (filters.dateFrom && dateKey < filters.dateFrom) return false;
        if (filters.dateTo && dateKey > filters.dateTo) return false;
    }
    return true;
};

const FilePicker = ({ files, onAddFiles, onRemoveFile }) => {
    const [cameraOpen, setCameraOpen] = useState(false);

    return (
        <div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-sky-300 bg-sky-50 px-3 py-3 text-sm font-semibold text-sky-700 hover:bg-sky-100">
                    <FileImage size={16} />
                    Upload file
                    <input
                        type="file"
                        accept="image/*,.pdf"
                        multiple
                        className="hidden"
                        onChange={(event) => onAddFiles(event.target.files)}
                    />
                </label>
                <button
                    type="button"
                    onClick={() => setCameraOpen(true)}
                    className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-emerald-300 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                    <Camera size={16} />
                    Ambil foto
                </button>
            </div>
            {files.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {files.map((file, index) => (
                        <FilePreview
                            key={`${file.name}-${file.lastModified}-${index}`}
                            file={file}
                            onRemove={() => onRemoveFile(index)}
                        />
                    ))}
                </div>
            )}
            {cameraOpen && (
                <CameraCaptureModal
                    onClose={() => setCameraOpen(false)}
                    onCapture={(file) => {
                        onAddFiles([file]);
                        setCameraOpen(false);
                    }}
                />
            )}
        </div>
    );
};

function CameraCaptureModal({ onClose, onCapture }) {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [error, setError] = useState("");
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const openCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: "environment" },
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                    },
                    audio: false,
                });

                if (cancelled) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }

                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }
                setReady(true);
            } catch (cameraError) {
                console.error("Camera open failed:", cameraError);
                setError(
                    "Kamera tidak bisa dibuka. Pastikan izin kamera sudah diberikan.",
                );
            }
        };

        openCamera();

        return () => {
            cancelled = true;
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
                streamRef.current = null;
            }
        };
    }, []);

    const capturePhoto = async () => {
        const video = videoRef.current;
        if (!video || !video.videoWidth || !video.videoHeight) return;

        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d");
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise((resolve) =>
            canvas.toBlob(resolve, "image/jpeg", 0.86),
        );
        if (!blob) return;

        const file = new File([blob], `reimburse-${Date.now()}.jpg`, {
            type: "image/jpeg",
        });
        onCapture(file);
    };

    return (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/80 p-4">
            <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">
                        Ambil Foto Bukti
                    </p>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                        aria-label="Tutup kamera"
                    >
                        <X size={18} />
                    </button>
                </div>
                <div className="bg-black">
                    {error ? (
                        <div className="flex min-h-80 items-center justify-center p-5 text-center text-sm text-white">
                            {error}
                        </div>
                    ) : (
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="max-h-[70vh] w-full bg-black object-contain"
                        />
                    )}
                </div>
                <div className="flex justify-end gap-2 p-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                        Batal
                    </button>
                    <button
                        type="button"
                        onClick={capturePhoto}
                        disabled={!ready || Boolean(error)}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
                    >
                        <Camera size={16} />
                        Ambil
                    </button>
                </div>
            </div>
        </div>
    );
}

function FilePreview({ file, onRemove }) {
    const isImage = String(file?.type ?? "").startsWith("image/");
    const [previewUrl, setPreviewUrl] = useState("");

    useEffect(() => {
        if (!file || !isImage) return undefined;

        let cancelled = false;
        const reader = new FileReader();
        reader.onload = () => {
            if (!cancelled) setPreviewUrl(String(reader.result ?? ""));
        };
        reader.onerror = () => {
            if (!cancelled) setPreviewUrl("");
        };
        reader.readAsDataURL(file);

        return () => {
            cancelled = true;
            if (reader.readyState === FileReader.LOADING) reader.abort();
        };
    }, [file, isImage]);

    return (
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {previewUrl ? (
                <img
                    src={previewUrl}
                    alt={file.name}
                    className="aspect-square w-full object-cover"
                />
            ) : (
                <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 p-3 text-center text-slate-500">
                    <FileImage size={24} />
                    <span className="line-clamp-2 text-xs">{file.name}</span>
                </div>
            )}
            <button
                type="button"
                onClick={onRemove}
                className="absolute right-2 top-2 rounded-full bg-white/90 p-1 text-slate-500 shadow-sm hover:bg-red-50 hover:text-red-600"
                aria-label="Hapus file"
            >
                <X size={15} />
            </button>
        </div>
    );
}

export default function ReimbursementPage() {
    const { collapsed, toggle } = useSidebarCollapsed();
    const { user, role } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [rows, setRows] = useState([]);
    const [requesters, setRequesters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [requestModalOpen, setRequestModalOpen] = useState(false);
    const [selected, setSelected] = useState(null);
    const [reviewTarget, setReviewTarget] = useState(null);
    const [reviewMode, setReviewMode] = useState("approve");
    const [preview, setPreview] = useState({ src: "", title: "" });
    const [form, setForm] = useState({
        transactionDate: todayKey(),
        claimAmount: "",
        description: "",
        receiptFiles: [],
    });
    const [reviewForm, setReviewForm] = useState({
        approvedAmount: "",
        approvalNote: "",
        rejectionReason: "",
        transferFile: null,
    });
    const [filters, setFilters] = useState({
        period: searchParams.get("period") === "all" ? "all" : "month",
        dateFrom: "",
        dateTo: "",
        requesterId: "",
        status: searchParams.get("status") === "pending" ? "pending" : "all",
        search: "",
    });
    const channelRef = useRef(null);

    const canReview = ["admin", "management"].includes(role);
    const canDelete = role === "admin";
    const canCreate = ["technician", "admin", "management"].includes(role);

    const loadData = useCallback(async () => {
        if (!user?.id || !role) return;
        setLoading(true);
        setError("");
        try {
            const [reimbursements, requesterRows] = await Promise.all([
                loadReimbursements({ role, userId: user.id }),
                canReview ? loadReimbursementRequesters() : Promise.resolve([]),
            ]);
            setRows(reimbursements);
            setRequesters(requesterRows);
        } catch (loadError) {
            console.error("Reimbursement load failed:", loadError);
            const message = loadError.message || "Gagal memuat data reimburse.";
            setError(
                message.includes("schema cache") ||
                    message.includes("reimbursements")
                    ? "Tabel reimbursements belum tersedia di database Supabase. Jalankan migrasi Reimburse, lalu refresh schema cache/project."
                    : message,
            );
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [canReview, role, user?.id]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        if (!user?.id) return undefined;
        const channelName = createUniqueChannelName("reimbursements", user.id);
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
    }, [loadData, user?.id]);

    const filteredRows = useMemo(() => {
        const search = filters.search.trim().toLowerCase();
        return rows.filter((row) => {
            if (filters.status !== "all" && row.status !== filters.status) return false;
            if (filters.requesterId && row.requester_id !== filters.requesterId) return false;
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

    const addReceiptFiles = (fileList) => {
        const nextFiles = Array.from(fileList ?? []);
        setForm((prev) => ({
            ...prev,
            receiptFiles: [...prev.receiptFiles, ...nextFiles],
        }));
    };

    const resetForm = () => {
        setForm({
            transactionDate: todayKey(),
            claimAmount: "",
            description: "",
            receiptFiles: [],
        });
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!canCreate || !user?.id) return;
        const claimAmount = onlyDigits(form.claimAmount);
        if (Number(claimAmount) <= 0) {
            alert("Nominal klaim wajib lebih dari 0.");
            return;
        }
        if (!form.description.trim()) {
            alert("Keterangan wajib diisi.");
            return;
        }
        if (!form.transactionDate) {
            alert("Tanggal transaksi wajib diisi.");
            return;
        }
        if (form.receiptFiles.length === 0) {
            alert("Minimal upload 1 bukti nota.");
            return;
        }

        setSaving(true);
        try {
            const created = await createReimbursement({
                requesterId: user.id,
                transactionDate: form.transactionDate,
                claimAmount,
                description: form.description.trim(),
            });
            const uploadedFiles = await Promise.all(
                form.receiptFiles.map((file) =>
                    uploadReimbursementFile({
                        file,
                        reimbursementId: created.id,
                        kind: "receipt",
                    }),
                ),
            );
            await addReimbursementAttachments({
                reimbursementId: created.id,
                files: uploadedFiles,
                uploadedBy: user.id,
            });
            resetForm();
            setRequestModalOpen(false);
            await loadData();
        } catch (submitError) {
            const message = submitError.message || "Gagal membuat reimburse.";
            alert(
                message.includes("row-level security") ||
                    message.includes("403")
                    ? "Gagal submit karena policy database Reimburse belum mengizinkan user ini. Jalankan ulang migration/policy Reimburse di Supabase SQL Editor, lalu coba lagi."
                    : message,
            );
        } finally {
            setSaving(false);
        }
    };

    const openReview = (row, mode) => {
        setReviewTarget(row);
        setReviewMode(mode);
        setReviewForm({
            approvedAmount: row.claim_amount ? String(Number(row.claim_amount)) : "",
            approvalNote: "",
            rejectionReason: "",
            transferFile: null,
        });
    };

    const handleReviewSubmit = async (event) => {
        event.preventDefault();
        if (!reviewTarget || !user?.id) return;

        if (reviewMode === "approve") {
            if (Number(reviewForm.approvedAmount) <= 0) {
                alert("Nominal disetujui wajib lebih dari 0.");
                return;
            }
            if (!reviewForm.transferFile) {
                alert("Bukti transfer wajib diupload.");
                return;
            }
        } else if (!reviewForm.rejectionReason.trim()) {
            alert("Alasan penolakan wajib diisi.");
            return;
        }

        setSaving(true);
        try {
            if (reviewMode === "approve") {
                const uploaded = await uploadReimbursementFile({
                    file: reviewForm.transferFile,
                    reimbursementId: reviewTarget.id,
                    kind: "transfer",
                });
                await approveReimbursement({
                    reimbursement: reviewTarget,
                    approvedAmount: reviewForm.approvedAmount,
                    transferProofUrl: uploaded.url,
                    approvalNote: reviewForm.approvalNote.trim(),
                    approvedBy: user.id,
                });
            } else {
                await rejectReimbursement({
                    reimbursement: reviewTarget,
                    rejectionReason: reviewForm.rejectionReason.trim(),
                    approvedBy: user.id,
                });
            }
            setReviewTarget(null);
            setSelected(null);
            await loadData();
        } catch (reviewError) {
            alert(reviewError.message || "Gagal memproses reimburse.");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (row) => {
        if (!canDelete || !row?.id) return;
        const confirmed = window.confirm(
            "Hapus data reimburse ini beserta semua bukti nota dan bukti transfer?",
        );
        if (!confirmed) return;

        setSaving(true);
        try {
            await deleteReimbursement(row);
            setSelected(null);
            setReviewTarget(null);
            await loadData();
        } catch (deleteError) {
            alert(deleteError.message || "Gagal menghapus data reimburse.");
        } finally {
            setSaving(false);
        }
    };

    const openFile = (url, title) => {
        if (!url) return;
        if (isImageUrl(url)) {
            setPreview({ src: url, title });
            return;
        }
        window.open(url, "_blank", "noopener,noreferrer");
    };

    return (
        <div className="min-h-screen bg-sky-50">
            <div className="flex min-h-screen">
                <Sidebar collapsed={collapsed} onToggle={toggle} />
                <main className="min-w-0 flex-1 p-4 pb-24 md:p-8 md:pb-8">
                    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">
                                Reimburse
                            </h1>
                            <p className="mt-1 text-sm text-slate-600">
                                Pengajuan klaim, approval, dan laporan reimburse.
                            </p>
                        </div>
                        {canReview && (
                            <button
                                type="button"
                                onClick={() => navigate("/reimburse/reports")}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                            >
                                <BarChart3 size={16} />
                                Report Reimburse
                            </button>
                        )}
                    </div>

                    {error && (
                        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                            {error}
                        </div>
                    )}

                    <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                            <Filter size={16} />
                            Filter
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
                            <CustomSelect
                                value={filters.period}
                                onChange={(value) => setFilters((prev) => ({ ...prev, period: value }))}
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
                                        onChange={(event) => setFilters((prev) => ({ ...prev, dateFrom: event.target.value }))}
                                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                    />
                                    <input
                                        type="date"
                                        value={filters.dateTo}
                                        onChange={(event) => setFilters((prev) => ({ ...prev, dateTo: event.target.value }))}
                                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                    />
                                </>
                            )}
                            {canReview && (
                                <CustomSelect
                                    value={filters.requesterId}
                                    onChange={(value) => setFilters((prev) => ({ ...prev, requesterId: value }))}
                                    options={[
                                        { value: "", label: "Semua pengaju" },
                                        ...requesters.map((item) => ({
                                            value: item.id,
                                            label: getDisplayName(item),
                                        })),
                                    ]}
                                />
                            )}
                            <CustomSelect
                                value={filters.status}
                                onChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}
                                options={[
                                    { value: "all", label: "Semua status" },
                                    { value: "pending", label: "Pending" },
                                    { value: "approved", label: "Approved" },
                                    { value: "rejected", label: "Rejected" },
                                ]}
                            />
                            <label className="relative block">
                                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="search"
                                    value={filters.search}
                                    onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                                    placeholder="Search"
                                    className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm"
                                />
                            </label>
                        </div>
                    </div>

                    <section className="space-y-3">
                        {loading ? (
                            <div className="flex items-center justify-center gap-2 rounded-2xl bg-white p-8 text-slate-600 shadow-sm">
                                <Loader size={18} className="animate-spin" />
                                Memuat data...
                            </div>
                        ) : filteredRows.length === 0 ? (
                            <div className="rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50 p-8 text-center text-sm text-sky-700">
                                Tidak ada data reimburse.
                            </div>
                        ) : (
                            filteredRows.map((row) => (
                                <article
                                    key={row.id}
                                    className="overflow-hidden rounded-2xl bg-white shadow-sm transition hover:shadow-md md:hover:scale-[1.01]"
                                >
                                    <div className="p-4 md:p-5">
                                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h2 className="text-base font-semibold text-slate-900">
                                                        {getDisplayName(row.requester)}
                                                    </h2>
                                                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${REIMBURSEMENT_STATUS_STYLES[row.status]}`}>
                                                        {REIMBURSEMENT_STATUS_LABELS[row.status]}
                                                    </span>
                                                </div>
                                                <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                                                    {row.description}
                                                </p>
                                                <p className="mt-2 text-xs font-medium text-slate-500">
                                                    Transaksi {formatDate(row.transaction_date)}
                                                </p>
                                            </div>
                                            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 md:min-w-80">
                                                <div className="rounded-xl bg-slate-50 p-3">
                                                    <p className="text-xs font-medium text-slate-500">Klaim</p>
                                                    <p className="mt-1 break-words font-semibold text-slate-900">
                                                        {formatCurrency(row.claim_amount)}
                                                    </p>
                                                </div>
                                                <div className="rounded-xl bg-emerald-50 p-3">
                                                    <p className="text-xs font-medium text-emerald-700">Disetujui</p>
                                                    <p className="mt-1 break-words font-semibold text-emerald-900">
                                                        {row.approved_amount ? formatCurrency(row.approved_amount) : "-"}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-4 flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setSelected(row)}
                                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                            >
                                                <Eye size={15} />
                                                Detail
                                            </button>
                                            {canReview && row.status === "pending" && (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => openReview(row, "approve")}
                                                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                                                    >
                                                        <Check size={15} />
                                                        Approve
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => openReview(row, "reject")}
                                                        className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
                                                    >
                                                        <X size={15} />
                                                        Tolak
                                                    </button>
                                                </>
                                            )}
                                            {canDelete && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        handleDelete(row)
                                                    }
                                                    disabled={saving}
                                                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                                                >
                                                    <Trash2 size={15} />
                                                    Hapus
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </article>
                            ))
                        )}
                    </section>
                </main>
            </div>
            <MobileBottomNav />

            {canCreate && (
                <button
                    type="button"
                    onClick={() => setRequestModalOpen(true)}
                    className="fixed bottom-24 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-sky-600 text-white shadow-xl shadow-sky-900/20 hover:bg-sky-700 md:bottom-6"
                    aria-label="Ajukan reimburse"
                    title="Ajukan reimburse"
                >
                    <Plus size={26} />
                </button>
            )}

            {requestModalOpen && (
                <RequestModal
                    form={form}
                    saving={saving}
                    onChange={setForm}
                    onAddFiles={addReceiptFiles}
                    onSubmit={handleSubmit}
                    onClose={() => {
                        if (!saving) {
                            resetForm();
                            setRequestModalOpen(false);
                        }
                    }}
                />
            )}

            {selected && (
                <DetailModal
                    row={selected}
                    canReview={canReview}
                    canDelete={canDelete}
                    onClose={() => setSelected(null)}
                    onOpenFile={openFile}
                    onReview={openReview}
                    onDelete={handleDelete}
                />
            )}

            {reviewTarget && (
                <ReviewModal
                    mode={reviewMode}
                    row={reviewTarget}
                    form={reviewForm}
                    saving={saving}
                    onChange={setReviewForm}
                    onSubmit={handleReviewSubmit}
                    onClose={() => setReviewTarget(null)}
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

function RequestModal({
    form,
    saving,
    onChange,
    onAddFiles,
    onSubmit,
    onClose,
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <form
                onSubmit={onSubmit}
                className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
            >
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
                    <div className="flex items-center gap-2">
                        <span className="rounded-xl bg-sky-50 p-2 text-sky-600">
                            <Receipt size={18} />
                        </span>
                        <h2 className="text-lg font-semibold text-slate-900">
                            Pengajuan Reimburse
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-60"
                        aria-label="Tutup form"
                    >
                        <X size={18} />
                    </button>
                </div>
                <div className="space-y-4 p-5">
                    <input
                        type="text"
                        inputMode="numeric"
                        value={form.claimAmount}
                        onChange={(event) =>
                            onChange((prev) => ({
                                ...prev,
                                claimAmount: formatNumberInput(
                                    event.target.value,
                                ),
                            }))
                        }
                        placeholder="Nominal klaim"
                        className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"
                    />
                    <input
                        type="date"
                        value={form.transactionDate}
                        onChange={(event) =>
                            onChange((prev) => ({
                                ...prev,
                                transactionDate: event.target.value,
                            }))
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"
                    />
                    <textarea
                        value={form.description}
                        onChange={(event) =>
                            onChange((prev) => ({
                                ...prev,
                                description: event.target.value,
                            }))
                        }
                        placeholder="Keterangan / keperluan"
                        className="min-h-28 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"
                    />
                    <FilePicker
                        files={form.receiptFiles}
                        onAddFiles={onAddFiles}
                        onRemoveFile={(index) =>
                            onChange((prev) => ({
                                ...prev,
                                receiptFiles: prev.receiptFiles.filter(
                                    (_, itemIndex) => itemIndex !== index,
                                ),
                            }))
                        }
                    />
                </div>
                <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                        Batal
                    </button>
                    <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:bg-slate-300"
                    >
                        {saving ? (
                            <Loader size={16} className="animate-spin" />
                        ) : (
                            <Banknote size={16} />
                        )}
                        Submit Reimburse
                    </button>
                </div>
            </form>
        </div>
    );
}

function DetailModal({
    row,
    canReview,
    canDelete,
    onClose,
    onOpenFile,
    onReview,
    onDelete,
}) {
    const detailRows = [
        ["ID Reimburse", row.id],
        ["Nama Pengaju", getDisplayName(row.requester)],
        ["Role Pengaju", row.requester?.role ?? "-"],
        ["Tanggal Pengajuan", formatDateTime(row.created_at)],
        ["Tanggal Transaksi", formatDate(row.transaction_date)],
        ["Nominal Klaim", formatCurrency(row.claim_amount)],
        ["Nominal Disetujui", row.approved_amount ? formatCurrency(row.approved_amount) : "-"],
        ["Status", REIMBURSEMENT_STATUS_LABELS[row.status]],
        ["Approved By", getDisplayName(row.approver)],
        ["Tanggal Approval", formatDateTime(row.approved_at)],
        ["Alasan Penolakan", row.rejection_reason || "-"],
        ["Catatan Approval", row.approval_note || "-"],
        ["Created At", formatDateTime(row.created_at)],
        ["Updated At", formatDateTime(row.updated_at)],
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
                    <h2 className="text-lg font-semibold text-slate-900">Detail Reimburse</h2>
                    <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                        <X size={18} />
                    </button>
                </div>
                <div className="space-y-5 p-5">
                    <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                        {row.description}
                    </p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {detailRows.map(([label, value]) => (
                            <div key={label} className="rounded-xl border border-slate-200 p-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
                                <p className="mt-1 break-words text-sm font-semibold text-slate-900">{value}</p>
                            </div>
                        ))}
                    </div>
                    <div>
                        <p className="mb-2 text-sm font-semibold text-slate-800">Bukti Nota</p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {(row.attachments ?? []).map((attachment, index) => (
                                <button
                                    key={attachment.id}
                                    type="button"
                                    onClick={() => onOpenFile(attachment.file_url, `Bukti nota ${index + 1}`)}
                                    className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                >
                                    <FileImage size={16} />
                                    Bukti nota {index + 1}
                                </button>
                            ))}
                        </div>
                    </div>
                    {row.transfer_proof_url && (
                        <button
                            type="button"
                            onClick={() => onOpenFile(row.transfer_proof_url, "Bukti transfer")}
                            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                        >
                            <FileImage size={16} />
                            Lihat bukti transfer
                        </button>
                    )}
                    {canReview && row.status === "pending" && (
                        <div className="flex flex-wrap justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => onReview(row, "reject")}
                                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                            >
                                Tolak
                            </button>
                            <button
                                type="button"
                                onClick={() => onReview(row, "approve")}
                                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                            >
                                Approve
                            </button>
                        </div>
                    )}
                    {canDelete && (
                        <div className="flex justify-end border-t border-slate-100 pt-4">
                            <button
                                type="button"
                                onClick={() => onDelete(row)}
                                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                            >
                                <Trash2 size={15} />
                                Hapus Data Reimburse
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function ReviewModal({ mode, row, form, saving, onChange, onSubmit, onClose }) {
    const isApprove = mode === "approve";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <form onSubmit={onSubmit} className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                    <h2 className="text-lg font-semibold text-slate-900">
                        {isApprove ? "Approve Reimburse" : "Tolak Reimburse"}
                    </h2>
                    <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                        <X size={18} />
                    </button>
                </div>
                <div className="space-y-4 p-5">
                    <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                        <p className="font-semibold text-slate-900">{getDisplayName(row.requester)}</p>
                        <p className="mt-1">{row.description}</p>
                        <p className="mt-2 font-semibold">Klaim: {formatCurrency(row.claim_amount)}</p>
                    </div>
                    {isApprove ? (
                        <>
                            <input
                                type="number"
                                min="1"
                                value={form.approvedAmount}
                                onChange={(event) => onChange((prev) => ({ ...prev, approvedAmount: event.target.value }))}
                                placeholder="Nominal disetujui"
                                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"
                            />
                            <textarea
                                value={form.approvalNote}
                                onChange={(event) => onChange((prev) => ({ ...prev, approvalNote: event.target.value }))}
                                placeholder="Catatan approval"
                                className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"
                            />
                            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-emerald-300 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">
                                <Upload size={16} />
                                {form.transferFile?.name || "Upload bukti transfer"}
                                <input
                                    type="file"
                                    accept="image/*,.pdf"
                                    className="hidden"
                                    onChange={(event) => onChange((prev) => ({ ...prev, transferFile: event.target.files?.[0] ?? null }))}
                                />
                            </label>
                        </>
                    ) : (
                        <textarea
                            value={form.rejectionReason}
                            onChange={(event) => onChange((prev) => ({ ...prev, rejectionReason: event.target.value }))}
                            placeholder="Alasan penolakan"
                            className="min-h-28 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"
                        />
                    )}
                </div>
                <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
                    <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        Batal
                    </button>
                    <button
                        type="submit"
                        disabled={saving}
                        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300 ${
                            isApprove ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"
                        }`}
                    >
                        {saving && <Loader size={15} className="animate-spin" />}
                        {isApprove ? "Approve" : "Tolak"}
                    </button>
                </div>
            </form>
        </div>
    );
}
