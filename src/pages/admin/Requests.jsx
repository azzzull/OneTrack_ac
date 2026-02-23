import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    CheckCircle2,
    Camera,
    Clock3,
    ClipboardList,
    Contact,
    CalendarDays,
    MapPinned,
    ListFilter,
    MapPin,
    Phone,
    ShieldCheck,
    Search,
    UserRound,
    Wrench,
    X,
} from "lucide-react";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import CustomSelect from "../../components/ui/CustomSelect";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import { useAuth } from "../../context/useAuth";
import { useDialog } from "../../context/useDialog";
import supabase from "../../supabaseClient";

const FILTERS = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "in_progress", label: "In Progress" },
    { key: "completed", label: "Completed" },
];

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

const pickFirst = (obj, keys, fallback = "") => {
    for (const key of keys) {
        const value = obj?.[key];
        if (value !== null && value !== undefined && value !== "") {
            return value;
        }
    }
    return fallback;
};

const normalizeRequest = (row) => {
    const rawStatus = String(
        pickFirst(row, ["status"], "pending"),
    ).toLowerCase();
    const status = STATUS_LABELS[rawStatus] ? rawStatus : "pending";

    return {
        id: pickFirst(row, ["id"], `${Math.random()}`),
        title: pickFirst(
            row,
            ["title", "job_title", "service_name", "name"],
            "Pekerjaan Tanpa Judul",
        ),
        address: pickFirst(
            row,
            ["address", "location", "site_address", "customer_address"],
            "-",
        ),
        phone: pickFirst(
            row,
            ["phone", "phone_number", "customer_phone", "contact_phone"],
            "-",
        ),
        assignee: pickFirst(
            row,
            ["technician_name", "assignee", "crew_name", "team_name"],
            "-",
        ),
        requester: pickFirst(
            row,
            ["customer_name", "requester", "customer"],
            "-",
        ),
        acBrand: pickFirst(row, ["ac_brand"], "-"),
        acType: pickFirst(row, ["ac_type"], "-"),
        acCapacityPk: pickFirst(row, ["ac_capacity_pk"], "-"),
        roomLocation: pickFirst(row, ["room_location"], "-"),
        serialNumber: pickFirst(row, ["serial_number"], "-"),
        troubleDescription: pickFirst(row, ["trouble_description"], "-"),
        replacedParts: pickFirst(row, ["replaced_parts"], "-"),
        reconditionedParts: pickFirst(row, ["reconditioned_parts"], "-"),
        beforePhotoUrl: pickFirst(row, ["before_photo_url"], ""),
        progressPhotoUrl: pickFirst(row, ["progress_photo_url"], ""),
        afterPhotoUrl: pickFirst(row, ["after_photo_url"], ""),
        date: pickFirst(row, ["updated_at", "created_at"], null),
        status,
    };
};

const formatDate = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";

    return new Intl.DateTimeFormat("en-US", {
        month: "numeric",
        day: "numeric",
        year: "numeric",
    }).format(date);
};

export default function AdminRequestsPage() {
    const { user } = useAuth();
    const { alert: showAlert } = useDialog();
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const [activeFilter, setActiveFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRequestId, setSelectedRequestId] = useState(null);
    const [editingStatus, setEditingStatus] = useState("pending");
    const [savingStatus, setSavingStatus] = useState(false);
    const [beforePhotoFile, setBeforePhotoFile] = useState(null);
    const [progressPhotoFile, setProgressPhotoFile] = useState(null);
    const [afterPhotoFile, setAfterPhotoFile] = useState(null);
    const [savingPhotos, setSavingPhotos] = useState(false);
    const [cameraOpen, setCameraOpen] = useState(false);
    const [cameraTarget, setCameraTarget] = useState(null);
    const [cameraError, setCameraError] = useState("");

    const streamRef = useRef(null);
    const videoRef = useRef(null);

    const loadRequests = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from("requests")
                .select("*")
                .order("created_at", { ascending: false });

            if (error) throw error;
            setRequests((data ?? []).map((row) => normalizeRequest(row)));
        } catch (error) {
            console.error("Error loading requests:", error);
            setRequests([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const timerId = setTimeout(() => {
            loadRequests();
        }, 0);

        const channel = supabase
            .channel("admin-requests-page")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "requests" },
                () => {
                    loadRequests();
                },
            )
            .subscribe();

        return () => {
            clearTimeout(timerId);
            channel.unsubscribe();
        };
    }, [loadRequests]);

    const filteredRequests = useMemo(() => {
        const keyword = search.trim().toLowerCase();

        return requests.filter((item) => {
            const matchFilter =
                activeFilter === "all" ? true : item.status === activeFilter;
            const matchSearch = keyword
                ? `${item.title} ${item.address}`
                      .toLowerCase()
                      .includes(keyword)
                : true;
            return matchFilter && matchSearch;
        });
    }, [activeFilter, requests, search]);

    const selectedRequest = useMemo(
        () => requests.find((item) => item.id === selectedRequestId) ?? null,
        [requests, selectedRequestId],
    );

    useEffect(() => {
        if (!selectedRequest) return;
        setEditingStatus(selectedRequest.status);
    }, [selectedRequest]);

    const closeDetail = () => {
        setSelectedRequestId(null);
        setSavingStatus(false);
        setSavingPhotos(false);
        setBeforePhotoFile(null);
        setProgressPhotoFile(null);
        setAfterPhotoFile(null);
        setCameraOpen(false);
        setCameraTarget(null);
        setCameraError("");
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
    };

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

    const captureFromCamera = async () => {
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

        if (cameraTarget === "before") setBeforePhotoFile(file);
        if (cameraTarget === "progress") setProgressPhotoFile(file);
        if (cameraTarget === "after") setAfterPhotoFile(file);

        closeCamera();
    };

    const updateStatus = async () => {
        if (!selectedRequest) return;
        if (editingStatus === selectedRequest.status) return;

        if (editingStatus === "completed" && !selectedRequest.afterPhotoUrl) {
            await showAlert(
                "Status Completed membutuhkan foto after. Upload foto after dulu dari halaman pengerjaan.",
                { title: "Aksi Ditolak" },
            );
            return;
        }

        try {
            setSavingStatus(true);
            const { error } = await supabase
                .from("requests")
                .update({
                    status: editingStatus,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", selectedRequest.id);

            if (error) throw error;
            await loadRequests();
        } catch (error) {
            console.error("Error updating request status:", error);
            await showAlert("Gagal mengubah status pekerjaan.", {
                title: "Update Gagal",
            });
        } finally {
            setSavingStatus(false);
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

    const savePhotos = async () => {
        if (!selectedRequest) return;
        if (!beforePhotoFile && !progressPhotoFile && !afterPhotoFile) {
            await showAlert("Pilih minimal 1 foto untuk disimpan.", {
                title: "Data Belum Lengkap",
            });
            return;
        }

        try {
            setSavingPhotos(true);

            const [beforeUrl, progressUrl, afterUrl] = await Promise.all([
                uploadPhoto(beforePhotoFile, "before"),
                uploadPhoto(progressPhotoFile, "progress"),
                uploadPhoto(afterPhotoFile, "after"),
            ]);

            const payload = {
                updated_at: new Date().toISOString(),
            };

            if (beforeUrl) payload.before_photo_url = beforeUrl;
            if (progressUrl) payload.progress_photo_url = progressUrl;
            if (afterUrl) payload.after_photo_url = afterUrl;

            let nextStatus = selectedRequest.status;
            if (afterUrl) {
                nextStatus = "completed";
            } else if (progressUrl && selectedRequest.status === "pending") {
                nextStatus = "in_progress";
            }
            payload.status = nextStatus;

            const { error } = await supabase
                .from("requests")
                .update(payload)
                .eq("id", selectedRequest.id);
            if (error) throw error;

            await loadRequests();
            setEditingStatus(nextStatus);
            setBeforePhotoFile(null);
            setProgressPhotoFile(null);
            setAfterPhotoFile(null);
        } catch (error) {
            console.error("Error saving photos:", error);
            await showAlert("Gagal menyimpan foto.", {
                title: "Simpan Gagal",
            });
        } finally {
            setSavingPhotos(false);
        }
    };

    useEffect(() => {
        if (cameraOpen && videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
            videoRef.current.play().catch(() => null);
        }
    }, [cameraOpen]);

    useEffect(
        () => () => {
            stopCameraStream();
        },
        [stopCameraStream],
    );

    return (
        <div className="min-h-screen bg-sky-50">
            <div className="flex min-h-screen">
                <Sidebar
                    collapsed={sidebarCollapsed}
                    onToggle={toggleSidebar}
                />

                <main className="min-w-0 flex-1 p-3 pb-24 md:p-8 md:pb-8">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">
                            Daftar Pekerjaan
                        </h1>

                        <label className="flex w-full items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-slate-500 md:max-w-sm md:px-4 md:py-3">
                            <Search size={16} />
                            <input
                                type="text"
                                value={search}
                                onChange={(event) =>
                                    setSearch(event.target.value)
                                }
                                placeholder="Cari nama atau alamat..."
                                className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 md:text-base"
                            />
                        </label>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-1 md:mt-6 md:inline-flex md:grid-cols-none md:gap-0 md:rounded-full">
                        {FILTERS.map((filter) => (
                            <button
                                key={filter.key}
                                type="button"
                                onClick={() => setActiveFilter(filter.key)}
                                className={`cursor-pointer rounded-xl px-3 py-2 text-xs transition md:rounded-full md:px-6 md:text-sm ${
                                    activeFilter === filter.key
                                        ? "bg-sky-500 font-semibold text-white"
                                        : "font-medium text-slate-600 hover:bg-slate-100"
                                }`}
                            >
                                {filter.label}
                            </button>
                        ))}
                    </div>

                    <section className="mt-6 space-y-3">
                        {loading ? (
                            <div className="rounded-2xl bg-white p-6 shadow-sm">
                                <p className="text-base text-slate-500">
                                    Memuat daftar pekerjaan...
                                </p>
                            </div>
                        ) : filteredRequests.length === 0 ? (
                            <div className="rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50 p-8">
                                <p className="text-base text-sky-700">
                                    Belum ada data pekerjaan
                                </p>
                            </div>
                        ) : (
                            filteredRequests.map((item) => (
                                <article
                                    key={item.id}
                                    className="cursor-pointer overflow-hidden rounded-2xl bg-white shadow-sm transition hover:shadow-md hover:scale-[1.01]"
                                    onClick={() =>
                                        setSelectedRequestId(item.id)
                                    }
                                >
                                    <div className="grid grid-cols-1 md:grid-cols-[1fr_190px]">
                                        <div className="p-4 md:p-5">
                                            <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
                                                <div className="min-w-0">
                                                    <h2 className="break-words text-lg font-semibold text-slate-900  md:text-xl">
                                                        {item.title}
                                                    </h2>
                                                    <p className="mt-2 flex items-start gap-2 break-words text-sm text-slate-500 md:text-base">
                                                        <MapPin size={16} />
                                                        <span>
                                                            {item.address}
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
                                                <p className="inline-flex items-center text-base gap-2">
                                                    <UserRound size={14} />
                                                    <span className="break-all">
                                                        {item.phone}
                                                    </span>
                                                </p>
                                                <p className="inline-flex items-center gap-2">
                                                    <Wrench size={14} />
                                                    <span className="break-words">
                                                        {item.assignee}
                                                    </span>
                                                </p>
                                            </div>
                                        </div>

                                        <aside className="border-t border-slate-200 bg-slate-50 p-4 md:border-l md:border-t-0 md:p-5">
                                            <p className="inline-flex items-center gap-2 text-sm text-slate-600">
                                                <CalendarDays size={15} />
                                                {formatDate(item.date)}
                                            </p>
                                            <p className="mt-3 inline-flex items-center gap-2 break-words text-sm text-slate-600">
                                                <ListFilter size={15} />
                                                {item.requester}
                                            </p>
                                        </aside>
                                    </div>
                                </article>
                            ))
                        )}
                    </section>
                </main>
            </div>

            <MobileBottomNav />

            {selectedRequest && (
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
                                    {selectedRequest.title}
                                </h3>
                                <p className="mt-2 inline-flex items-start gap-2 text-sm text-slate-600">
                                    <MapPinned size={14} />
                                    {selectedRequest.address}
                                </p>
                                <p className="mt-1 inline-flex items-center gap-2 text-sm text-slate-600">
                                    <Phone size={14} />
                                    {selectedRequest.phone}
                                </p>
                                <p className="mt-1 inline-flex items-center gap-2 text-sm text-slate-600">
                                    <Contact size={14} />
                                    {selectedRequest.requester}
                                </p>
                                <p className="mt-1 inline-flex items-center gap-2 text-sm text-slate-600">
                                    <CalendarDays size={14} />
                                    {formatDate(selectedRequest.date)}
                                </p>
                            </div>

                            <div className="rounded-2xl border border-slate-200 p-4">
                                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    <ShieldCheck size={14} />
                                    Status
                                </p>
                                <div className="mt-3">
                                    <CustomSelect
                                        value={editingStatus}
                                        onChange={setEditingStatus}
                                        options={STATUS_OPTIONS}
                                        className="mt-0 bg-white"
                                    />
                                </div>
                                <button
                                    type="button"
                                    disabled={
                                        savingStatus ||
                                        editingStatus === selectedRequest.status
                                    }
                                    onClick={updateStatus}
                                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {savingStatus
                                        ? "Menyimpan..."
                                        : "Simpan Status"}
                                </button>
                                <p className="mt-2 text-xs text-slate-500">
                                    Jika status jadi Completed, foto after harus
                                    tersedia.
                                </p>
                            </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 p-4">
                                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    <Clock3 size={14} />
                                    Detail Unit AC
                                </p>
                                <div className="mt-3 space-y-2 text-sm text-slate-700">
                                    <p>
                                        <span className="font-medium">
                                            Merk:
                                        </span>{" "}
                                        {selectedRequest.acBrand}
                                    </p>
                                    <p>
                                        <span className="font-medium">
                                            Tipe:
                                        </span>{" "}
                                        {selectedRequest.acType}
                                    </p>
                                    <p>
                                        <span className="font-medium">
                                            Kapasitas:
                                        </span>{" "}
                                        {selectedRequest.acCapacityPk}
                                    </p>
                                    <p>
                                        <span className="font-medium">
                                            Lokasi Ruangan:
                                        </span>{" "}
                                        {selectedRequest.roomLocation}
                                    </p>
                                    <p>
                                        <span className="font-medium">
                                            Serial Number:
                                        </span>{" "}
                                        {selectedRequest.serialNumber}
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 p-4">
                                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    <CheckCircle2 size={14} />
                                    Detail Perbaikan
                                </p>
                                <div className="mt-3 space-y-2 text-sm text-slate-700">
                                    <p>
                                        <span className="font-medium">
                                            Trouble:
                                        </span>{" "}
                                        {selectedRequest.troubleDescription}
                                    </p>
                                    <p>
                                        <span className="font-medium">
                                            Suku Cadang Diganti:
                                        </span>{" "}
                                        {selectedRequest.replacedParts}
                                    </p>
                                    <p>
                                        <span className="font-medium">
                                            Suku Cadang Direkondisi:
                                        </span>{" "}
                                        {selectedRequest.reconditionedParts}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 rounded-2xl border border-slate-200 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Dokumentasi
                            </p>
                            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                                <a
                                    href={
                                        selectedRequest.beforePhotoUrl ||
                                        undefined
                                    }
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-xl border border-slate-200 p-3 text-sm text-slate-700 hover:bg-slate-50"
                                >
                                    Before:{" "}
                                    {selectedRequest.beforePhotoUrl
                                        ? "Lihat Foto"
                                        : "Belum ada"}
                                </a>
                                <a
                                    href={
                                        selectedRequest.progressPhotoUrl ||
                                        undefined
                                    }
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-xl border border-slate-200 p-3 text-sm text-slate-700 hover:bg-slate-50"
                                >
                                    Progress:{" "}
                                    {selectedRequest.progressPhotoUrl
                                        ? "Lihat Foto"
                                        : "Belum ada"}
                                </a>
                                <a
                                    href={
                                        selectedRequest.afterPhotoUrl ||
                                        undefined
                                    }
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-xl border border-slate-200 p-3 text-sm text-slate-700 hover:bg-slate-50"
                                >
                                    After:{" "}
                                    {selectedRequest.afterPhotoUrl
                                        ? "Lihat Foto"
                                        : "Belum ada"}
                                </a>
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                                <button
                                    type="button"
                                    onClick={() => openCamera("before")}
                                    className="rounded-xl border border-dashed border-slate-300 p-3 text-left text-sm text-slate-600 transition hover:border-sky-300 hover:bg-sky-50"
                                >
                                    <span className="inline-flex items-center gap-2 font-medium">
                                        <Camera size={15} />
                                        Ambil Before
                                    </span>
                                    <span className="mt-1 block truncate text-xs text-slate-500">
                                        {beforePhotoFile
                                            ? beforePhotoFile.name
                                            : "Belum ambil foto"}
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => openCamera("progress")}
                                    className="rounded-xl border border-dashed border-slate-300 p-3 text-left text-sm text-slate-600 transition hover:border-sky-300 hover:bg-sky-50"
                                >
                                    <span className="inline-flex items-center gap-2 font-medium">
                                        <Camera size={15} />
                                        Ambil Progress
                                    </span>
                                    <span className="mt-1 block truncate text-xs text-slate-500">
                                        {progressPhotoFile
                                            ? progressPhotoFile.name
                                            : "Belum ambil foto"}
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => openCamera("after")}
                                    className="rounded-xl border border-dashed border-slate-300 p-3 text-left text-sm text-slate-600 transition hover:border-sky-300 hover:bg-sky-50"
                                >
                                    <span className="inline-flex items-center gap-2 font-medium">
                                        <Camera size={15} />
                                        Ambil After
                                    </span>
                                    <span className="mt-1 block truncate text-xs text-slate-500">
                                        {afterPhotoFile
                                            ? afterPhotoFile.name
                                            : "Belum ambil foto"}
                                    </span>
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={savePhotos}
                                disabled={
                                    savingPhotos ||
                                    (!beforePhotoFile &&
                                        !progressPhotoFile &&
                                        !afterPhotoFile)
                                }
                                className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {savingPhotos ? "Menyimpan Foto..." : "Simpan Foto"}
                            </button>
                            <p className="mt-2 text-xs text-slate-500">
                                Upload Progress otomatis ubah status ke In Progress.
                                Upload After otomatis ubah status ke Completed.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {cameraOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/80 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <p className="text-sm font-semibold text-slate-800">
                                Ambil Foto
                            </p>
                            <button
                                type="button"
                                onClick={closeCamera}
                                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="overflow-hidden rounded-xl bg-black">
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className="h-80 w-full object-cover"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={captureFromCamera}
                            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
                        >
                            <Camera size={16} />
                            Ambil Foto
                        </button>
                    </div>
                </div>
            )}

            {cameraError && (
                <div className="fixed bottom-20 right-4 z-[70] rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white shadow-lg">
                    {cameraError}
                </div>
            )}
        </div>
    );
}
