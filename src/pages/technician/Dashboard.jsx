import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    CalendarDays,
    Camera,
    CheckCircle2,
    ClipboardList,
    MapPinned,
    Phone,
    ShieldCheck,
    Wrench,
    X,
    UserRound,
} from "lucide-react";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import { useAuth } from "../../context/useAuth";
import { useDialog } from "../../context/useDialog";
import CustomSelect from "../../components/ui/CustomSelect";
import supabase from "../../supabaseClient";
import { scanBarcodeFromFile } from "../../utils/barcodeScanner";

const STATUS_LABELS = {
    pending: "PENDING",
    in_progress: "IN PROGRESS",
    completed: "COMPLETED",
};

const STATUS_STYLES = {
    pending: "bg-amber-100 text-amber-700",
    in_progress: "bg-blue-100 text-blue-700",
    completed: "bg-emerald-100 text-emerald-700",
};

const STATUS_OPTIONS = [
    { value: "pending", label: "Pending" },
    { value: "in_progress", label: "In Progress" },
    { value: "completed", label: "Completed" },
];

const FileCaptureCard = ({ label, fileName, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className="rounded-xl border border-dashed border-slate-300 p-3 text-left text-sm text-slate-600 transition hover:border-sky-300 hover:bg-sky-50"
    >
        <span className="inline-flex items-center gap-2 font-medium">
            <Camera size={15} />
            {label}
        </span>
        <p className="mt-2 text-xs text-slate-500">
            {fileName
                ? `Tertangkap: ${fileName}`
                : "Klik untuk ambil foto dari kamera"}
        </p>
    </button>
);

const getCurrentUserDisplayName = (user) => {
    const composed =
        `${user?.user_metadata?.first_name ?? ""} ${user?.user_metadata?.last_name ?? ""}`.trim();
    return (
        composed ||
        String(user?.user_metadata?.full_name ?? "").trim() ||
        String(user?.email ?? "").trim() ||
        "Teknisi"
    );
};

const formatDate = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(date);
};

function TechnicianDashboard() {
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const { user } = useAuth();
    const { alert: showAlert } = useDialog();
    const [loading, setLoading] = useState(true);
    const [tasks, setTasks] = useState([]);
    const [selectedTaskId, setSelectedTaskId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [repairNotes, setRepairNotes] = useState({
        troubleDescription: "",
        replacedParts: "",
        reconditionedParts: "",
    });
    const [beforePhotoFile, setBeforePhotoFile] = useState(null);
    const [progressPhotoFile, setProgressPhotoFile] = useState(null);
    const [afterPhotoFile, setAfterPhotoFile] = useState(null);
    const [serialNumber, setSerialNumber] = useState("");
    const [cameraOpen, setCameraOpen] = useState(false);
    const [cameraTarget, setCameraTarget] = useState(null);
    const [cameraError, setCameraError] = useState("");

    const streamRef = useRef(null);
    const videoRef = useRef(null);

    const loadTasks = useCallback(async () => {
        if (!user?.id) return;

        setLoading(true);
        try {
            const { data, error } = await supabase
                .from("requests")
                .select("*")
                .eq("technician_id", user.id)
                .order("created_at", { ascending: false });
            if (error) throw error;
            setTasks(data ?? []);
        } catch (error) {
            console.error("Error loading technician tasks:", error);
            setTasks([]);
        } finally {
            setLoading(false);
        }
    }, [user?.id]);

    const selectedTask = useMemo(
        () => tasks.find((item) => item.id === selectedTaskId) ?? null,
        [selectedTaskId, tasks],
    );

    useEffect(() => {
        if (!selectedTask) return;
        setRepairNotes({
            troubleDescription: selectedTask.trouble_description ?? "",
            replacedParts: selectedTask.replaced_parts ?? "",
            reconditionedParts: selectedTask.reconditioned_parts ?? "",
        });
        setSerialNumber(selectedTask.serial_number ?? "");
        setBeforePhotoFile(null);
        setProgressPhotoFile(null);
        setAfterPhotoFile(null);
    }, [selectedTask]);

    useEffect(() => {
        loadTasks();
    }, [loadTasks]);

    useEffect(() => {
        if (!user?.id) return undefined;

        const channel = supabase
            .channel(`technician-tasks-${user.id}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "requests" },
                () => loadTasks(),
            )
            .subscribe();

        return () => {
            channel.unsubscribe();
        };
    }, [loadTasks, user?.id]);

    const stopCameraStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, []);

    const closeCamera = useCallback(() => {
        stopCameraStream();
        setCameraOpen(false);
        setCameraTarget(null);
        setCameraError("");
    }, [stopCameraStream]);

    const openCamera = useCallback(async (target) => {
        if (!navigator.mediaDevices?.getUserMedia) {
            setCameraError("Browser tidak mendukung akses kamera.");
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" } },
                audio: false,
            });
            streamRef.current = stream;
            setCameraTarget(target);
            setCameraOpen(true);
            setCameraError("");
        } catch (error) {
            console.error("Camera access failed:", error);
            setCameraError(
                "Akses kamera ditolak. Aktifkan izin kamera di browser.",
            );
        }
    }, []);

    const scanSerialFromImage = useCallback(async (file) => {
        const value = await scanBarcodeFromFile(file);
        if (!value) return false;
        setSerialNumber(value);
        return true;
    }, []);

    const captureFromCamera = useCallback(async () => {
        const video = videoRef.current;
        if (!video || !cameraTarget) return;

        const width = video.videoWidth || 1280;
        const height = video.videoHeight || 720;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.drawImage(video, 0, 0, width, height);
        const blob = await new Promise((resolve) => {
            canvas.toBlob(resolve, "image/jpeg", 0.9);
        });
        if (!blob) return;

        const file = new File([blob], `${cameraTarget}-${Date.now()}.jpg`, {
            type: "image/jpeg",
        });

        if (cameraTarget === "serial-scan") {
            const found = await scanSerialFromImage(file);
            closeCamera();
            if (!found) {
                await showAlert(
                    "Barcode belum terbaca, arahkan kamera lebih dekat lalu scan ulang.",
                    {
                        title: "Scan Gagal",
                    },
                );
            }
            return;
        }
        if (cameraTarget === "before") setBeforePhotoFile(file);
        if (cameraTarget === "progress") setProgressPhotoFile(file);
        if (cameraTarget === "after") setAfterPhotoFile(file);
        closeCamera();
    }, [cameraTarget, closeCamera, scanSerialFromImage, showAlert]);

    useEffect(() => {
        if (cameraOpen && videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
            videoRef.current.play().catch(() => null);
        }
    }, [cameraOpen]);

    useEffect(() => () => stopCameraStream(), [stopCameraStream]);

    const closeDetail = () => {
        closeCamera();
        setSelectedTaskId(null);
        setSaving(false);
        setBeforePhotoFile(null);
        setProgressPhotoFile(null);
        setAfterPhotoFile(null);
    };

    const saveChanges = async () => {
        if (!selectedTask) return;

        // Validasi: minimal ada satu perubahan atau satu foto baru
        const hasRepairNoteChanges =
            repairNotes.troubleDescription.trim() !==
                (selectedTask.trouble_description ?? "") ||
            repairNotes.replacedParts.trim() !==
                (selectedTask.replaced_parts ?? "") ||
            repairNotes.reconditionedParts.trim() !==
                (selectedTask.reconditioned_parts ?? "") ||
            serialNumber.trim() !== (selectedTask.serial_number ?? "");

        const hasNewPhotos =
            beforePhotoFile || progressPhotoFile || afterPhotoFile;

        if (!hasRepairNoteChanges && !hasNewPhotos) {
            await showAlert("Tidak ada perubahan yang disimpan.", {
                title: "Informasi",
            });
            return;
        }

        try {
            setSaving(true);

            let beforeUrl = null;
            let progressUrl = null;
            let afterUrl = null;

            // Upload new photos if any
            if (hasNewPhotos) {
                [beforeUrl, progressUrl, afterUrl] = await Promise.all([
                    uploadPhoto(beforePhotoFile, "before"),
                    uploadPhoto(progressPhotoFile, "progress"),
                    uploadPhoto(afterPhotoFile, "after"),
                ]);
            }

            const payload = {
                trouble_description: repairNotes.troubleDescription.trim(),
                replaced_parts: repairNotes.replacedParts.trim(),
                reconditioned_parts: repairNotes.reconditionedParts.trim(),
                technician_id: user?.id ?? null,
                technician_name: getCurrentUserDisplayName(user),
                serial_number: serialNumber.trim(),
                updated_at: new Date().toISOString(),
            };

            // Add photo URLs if uploaded
            if (beforeUrl) payload.before_photo_url = beforeUrl;
            if (progressUrl) payload.progress_photo_url = progressUrl;
            if (afterUrl) payload.after_photo_url = afterUrl;

            // Determine status automatically based on photos
            // Check current photos + newly uploaded ones
            const hasBefore = beforeUrl || selectedTask.before_photo_url;
            const hasProgress = progressUrl || selectedTask.progress_photo_url;
            const hasAfter = afterUrl || selectedTask.after_photo_url;

            if (hasAfter) {
                payload.status = "completed";
            } else if (hasProgress && hasBefore) {
                payload.status = "in_progress";
            } else if (hasBefore) {
                payload.status = "pending";
            }

            const { error } = await supabase
                .from("requests")
                .update(payload)
                .eq("id", selectedTask.id);

            if (error) throw error;

            await loadTasks();
            setBeforePhotoFile(null);
            setProgressPhotoFile(null);
            setAfterPhotoFile(null);

            await showAlert("Perubahan berhasil disimpan.", {
                title: "Sukses",
            });
        } catch (error) {
            console.error("Error saving changes:", error);
            await showAlert("Gagal menyimpan perubahan.", { title: "Error" });
        } finally {
            setSaving(false);
        }
    };

    const uploadPhoto = async (file, folderName) => {
        if (!file) return null;
        const ext = file.name.split(".").pop() || "jpg";
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const path = `${user?.id ?? "anonymous"}/requests/${folderName}/${fileName}`;
        const { error: uploadError } = await supabase.storage
            .from("job-photos")
            .upload(path, file, { upsert: false });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from("job-photos").getPublicUrl(path);
        return data?.publicUrl ?? null;
    };

    return (
        <div className="min-h-screen bg-sky-50">
            <div className="flex min-h-screen">
                <Sidebar
                    collapsed={sidebarCollapsed}
                    onToggle={toggleSidebar}
                />

                <main className="min-w-0 flex-1 p-4 pb-24 md:p-8 md:pb-8">
                    <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">
                        Dashboard Teknisi
                    </h1>
                    <p className="mt-1 text-slate-600">
                        Daftar pekerjaan yang Anda kerjakan.
                    </p>

                    <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm md:p-5">
                        <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
                            <Wrench size={18} />
                            Pekerjaan Saya
                        </h2>

                        {loading ? (
                            <p className="mt-4 text-sm text-slate-500">
                                Memuat pekerjaan...
                            </p>
                        ) : tasks.length === 0 ? (
                            <p className="mt-4 rounded-xl border border-dashed border-sky-300 bg-sky-50 p-4 text-sm text-sky-700">
                                Belum ada pekerjaan yang Anda kerjakan.
                            </p>
                        ) : (
                            <div className="mt-4 space-y-3">
                                {tasks.map((item) => (
                                    <article
                                        key={item.id}
                                        className="cursor-pointer overflow-hidden rounded-2xl bg-white shadow-sm transition hover:shadow-md hover:scale-[1.01]"
                                        onClick={() =>
                                            setSelectedTaskId(item.id)
                                        }
                                    >
                                        <div className="grid grid-cols-1 md:grid-cols-[1fr_190px]">
                                            <div className="p-4 md:p-5">
                                                <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
                                                    <div className="min-w-0">
                                                        <h2 className="wrap-break-word text-lg font-semibold text-slate-900 md:text-xl">
                                                            {item.title ??
                                                                "Pekerjaan Tanpa Judul"}
                                                        </h2>
                                                        <p className="mt-2 flex items-start gap-2 wrap-break-word text-sm text-slate-500 md:text-base">
                                                            <MapPinned
                                                                size={16}
                                                            />
                                                            <span>
                                                                {item.address ??
                                                                    item.location ??
                                                                    "-"}
                                                            </span>
                                                        </p>
                                                    </div>

                                                    <span
                                                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                                            STATUS_STYLES[
                                                                item.status
                                                            ] ??
                                                            STATUS_STYLES.pending
                                                        }`}
                                                    >
                                                        {STATUS_LABELS[
                                                            item.status
                                                        ] ?? "PENDING"}
                                                    </span>
                                                </div>

                                                <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-500 md:gap-6 md:text-base">
                                                    <p className="inline-flex items-center gap-2">
                                                        <Phone size={14} />
                                                        <span className="break-all">
                                                            {item.customer_phone ??
                                                                "-"}
                                                        </span>
                                                    </p>
                                                    <p className="inline-flex items-center gap-2">
                                                        <Wrench size={14} />
                                                        <span className="wrap-break-word">
                                                            {item.technician_name ??
                                                                getCurrentUserDisplayName(
                                                                    user,
                                                                )}
                                                        </span>
                                                    </p>
                                                </div>
                                            </div>

                                            <aside className="border-t border-slate-200 bg-slate-50 p-4 md:border-l md:border-t-0 md:p-5">
                                                <div className="flex flex-col gap-3 md:gap-4">
                                                    <p className="inline-flex items-center gap-2 text-sm text-slate-600">
                                                        <CalendarDays
                                                            size={15}
                                                        />
                                                        {formatDate(
                                                            item.created_at,
                                                        )}
                                                    </p>
                                                    <p className="inline-flex items-center gap-2 wrap-break-word text-sm text-slate-600">
                                                        <UserRound size={15} />
                                                        {item.customer_name ??
                                                            "-"}
                                                    </p>
                                                </div>
                                            </aside>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>
                </main>
            </div>

            <MobileBottomNav />

            {selectedTask && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 md:items-center md:p-4">
                    <div className="max-h-[92vh] w-full overflow-auto rounded-t-3xl bg-white p-4 shadow-xl md:max-w-4xl md:rounded-2xl md:p-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-semibold text-slate-900 md:text-2xl">
                                Detail Pekerjaan
                            </h2>
                            <button
                                type="button"
                                onClick={closeDetail}
                                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 p-4">
                                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    <ClipboardList size={14} />
                                    Ringkasan
                                </p>
                                <h3 className="mt-2 text-xl font-semibold text-slate-900">
                                    {selectedTask.title}
                                </h3>
                                <p className="mt-2 inline-flex items-start gap-2 text-sm text-slate-600">
                                    <MapPinned size={14} />
                                    {selectedTask.location ??
                                        selectedTask.address ??
                                        "-"}
                                </p>
                                <p className="mt-1 inline-flex items-center gap-2 text-sm text-slate-600">
                                    <Phone size={14} />
                                    {selectedTask.customer_phone ?? "-"}
                                </p>
                                <p className="mt-1 inline-flex items-center gap-2 text-sm text-slate-600">
                                    <UserRound size={14} />
                                    {selectedTask.customer_name ?? "-"}
                                </p>
                                <p className="mt-1 inline-flex items-center gap-2 text-sm text-slate-600">
                                    <CalendarDays size={14} />
                                    {formatDate(selectedTask.created_at)}
                                </p>
                            </div>

                            <div className="rounded-2xl border border-slate-200 p-4 flex flex-col items-start gap-2">
                                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    <ShieldCheck size={14} />
                                    Status
                                </p>
                                <div className="mt-2 inline-flex rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 bg-slate-50">
                                    {STATUS_LABELS[selectedTask.status] ??
                                        "PENDING"}
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 rounded-2xl border border-slate-200 p-4">
                            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                <CheckCircle2 size={14} />
                                Detail Perbaikan
                            </p>
                            <div className="mt-3 space-y-3">
                                <label className="block">
                                    <span className="text-xs font-medium text-slate-600">
                                        Serial Number (scan barcode kamera)
                                    </span>
                                    <div className="mt-1 flex gap-2">
                                        <input
                                            value={serialNumber}
                                            readOnly
                                            className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700 outline-none"
                                            placeholder="Scan barcode serial dari kamera"
                                        />
                                        <button
                                            type="button"
                                            onClick={() =>
                                                openCamera("serial-scan")
                                            }
                                            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                        >
                                            <Camera size={14} />
                                            Scan
                                        </button>
                                    </div>
                                </label>
                                <label className="block">
                                    <span className="text-xs font-medium text-slate-600">
                                        Detail Perbaikan / Trouble
                                    </span>
                                    <textarea
                                        value={repairNotes.troubleDescription}
                                        onChange={(event) =>
                                            setRepairNotes((prev) => ({
                                                ...prev,
                                                troubleDescription:
                                                    event.target.value,
                                            }))
                                        }
                                        rows={3}
                                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-300"
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-xs font-medium text-slate-600">
                                        Suku Cadang Diganti
                                    </span>
                                    <textarea
                                        value={repairNotes.replacedParts}
                                        onChange={(event) =>
                                            setRepairNotes((prev) => ({
                                                ...prev,
                                                replacedParts:
                                                    event.target.value,
                                            }))
                                        }
                                        rows={2}
                                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-300"
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-xs font-medium text-slate-600">
                                        Suku Cadang Direkondisi
                                    </span>
                                    <textarea
                                        value={repairNotes.reconditionedParts}
                                        onChange={(event) =>
                                            setRepairNotes((prev) => ({
                                                ...prev,
                                                reconditionedParts:
                                                    event.target.value,
                                            }))
                                        }
                                        rows={2}
                                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-300"
                                    />
                                </label>
                            </div>
                        </div>

                        <div className="mt-4 rounded-2xl border border-slate-200 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Dokumentasi
                            </p>
                            {(selectedTask?.before_photo_url ||
                                selectedTask?.progress_photo_url ||
                                selectedTask?.after_photo_url) && (
                                <div className="mt-3 mb-4">
                                    <p className="text-xs text-slate-500 mb-2">
                                        Foto yang sudah diambil:
                                    </p>
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                        {[
                                            {
                                                label: "Before",
                                                url: selectedTask?.before_photo_url,
                                            },
                                            {
                                                label: "Progress",
                                                url: selectedTask?.progress_photo_url,
                                            },
                                            {
                                                label: "After",
                                                url: selectedTask?.after_photo_url,
                                            },
                                        ].map((item) => (
                                            <div
                                                key={item.label}
                                                className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                                            >
                                                {item.url ? (
                                                    <a
                                                        href={item.url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="block"
                                                    >
                                                        <img
                                                            src={item.url}
                                                            alt={`Foto ${item.label}`}
                                                            className="h-40 w-full object-cover"
                                                        />
                                                    </a>
                                                ) : (
                                                    <div className="flex h-40 items-center justify-center text-sm text-slate-400">
                                                        Belum ada
                                                    </div>
                                                )}
                                                <p className="border-t border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">
                                                    {item.label}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <p className="text-xs text-slate-500 mb-3">
                                Ambil foto baru:
                            </p>
                            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                                <FileCaptureCard
                                    label="Ambil Before"
                                    fileName={beforePhotoFile?.name}
                                    onClick={() => openCamera("before")}
                                />
                                <FileCaptureCard
                                    label="Ambil Progress"
                                    fileName={progressPhotoFile?.name}
                                    onClick={() => openCamera("progress")}
                                />
                                <FileCaptureCard
                                    label="Ambil After"
                                    fileName={afterPhotoFile?.name}
                                    onClick={() => openCamera("after")}
                                />
                            </div>
                            <button
                                type="button"
                                onClick={saveChanges}
                                disabled={saving}
                                className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {saving
                                    ? "Menyimpan Perubahan..."
                                    : "Simpan Perubahan"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {cameraOpen && (
                <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/80 p-0 md:items-center md:p-4">
                    <div className="w-full rounded-t-3xl bg-white p-4 shadow-xl md:max-w-xl md:rounded-2xl">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-semibold text-slate-900">
                                {cameraTarget === "serial-scan"
                                    ? "Scan Barcode Serial"
                                    : "Ambil Foto"}
                            </h3>
                            <button
                                type="button"
                                onClick={closeCamera}
                                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="mt-3 overflow-hidden rounded-xl bg-black">
                            {cameraError ? (
                                <p className="p-4 text-sm text-rose-600">
                                    {cameraError}
                                </p>
                            ) : (
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="h-64 w-full object-cover md:h-80"
                                />
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={captureFromCamera}
                            disabled={Boolean(cameraError)}
                            className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {cameraTarget === "serial-scan"
                                ? "Scan Sekarang"
                                : "Ambil Sekarang"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default TechnicianDashboard;
