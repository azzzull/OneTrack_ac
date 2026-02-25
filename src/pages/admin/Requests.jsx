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
import { scanBarcodeFromFile } from "../../utils/barcodeScanner";

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

const getProfileDisplayName = (profile) => {
    const composed =
        `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();
    return (
        composed ||
        String(profile?.name ?? "").trim() ||
        String(profile?.full_name ?? "").trim() ||
        String(profile?.email ?? "").trim() ||
        "-"
    );
};

const normalizeRequest = (row, creatorName = "") => {
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
        createdBy: pickFirst(row, ["created_by"], ""),
        technicianId: pickFirst(row, ["technician_id"], ""),
        assignee: pickFirst(
            row,
            ["technician_name", "assignee", "crew_name", "team_name"],
            creatorName || "-",
        ),
        technicianName: pickFirst(
            row,
            ["technician_name", "assignee", "crew_name", "team_name"],
            creatorName || "-",
        ),
        createdByName: creatorName || "-",
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

export default function AdminRequestsPage() {
    const { user, role } = useAuth();
    const { alert: showAlert } = useDialog();
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const [activeFilter, setActiveFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRequestId, setSelectedRequestId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [repairNotes, setRepairNotes] = useState({
        troubleDescription: "",
        replacedParts: "",
        reconditionedParts: "",
    });
    const [serialNumberInput, setSerialNumberInput] = useState("");
    const [beforePhotoFile, setBeforePhotoFile] = useState(null);
    const [progressPhotoFile, setProgressPhotoFile] = useState(null);
    const [afterPhotoFile, setAfterPhotoFile] = useState(null);
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
            const requestRows = data ?? [];

            const creatorIds = [
                ...new Set(
                    requestRows
                        .map((row) => row.created_by)
                        .filter((id) => Boolean(id)),
                ),
            ];

            let creatorMap = {};
            if (creatorIds.length > 0) {
                const { data: profiles, error: profilesError } = await supabase
                    .from("profiles")
                    .select("id, first_name, last_name, name, email")
                    .in("id", creatorIds);
                if (profilesError) {
                    // Technician/customer may not have permission to read other profiles.
                    // Keep requests visible and fallback to default creator labels.
                    console.warn(
                        "Profiles lookup skipped due to RLS:",
                        profilesError.message,
                    );
                } else {
                    creatorMap = (profiles ?? []).reduce((acc, profile) => {
                        acc[profile.id] = getProfileDisplayName(profile);
                        return acc;
                    }, {});
                }
            }

            setRequests(
                requestRows.map((row) =>
                    normalizeRequest(
                        row,
                        creatorMap[row.created_by] ??
                            (row.created_by ? "User tidak ditemukan" : "-"),
                    ),
                ),
            );
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
            const matchTechnicianQueue =
                role === "technician"
                    ? item.status === "pending" && !item.technicianId
                    : true;
            const matchFilter =
                role === "technician"
                    ? true
                    : activeFilter === "all"
                      ? true
                      : item.status === activeFilter;
            const matchSearch = keyword
                ? `${item.title} ${item.address} ${item.assignee} ${item.requester}`
                      .toLowerCase()
                      .includes(keyword)
                : true;
            return matchTechnicianQueue && matchFilter && matchSearch;
        });
    }, [activeFilter, requests, role, search]);

    const selectedRequest = useMemo(
        () => requests.find((item) => item.id === selectedRequestId) ?? null,
        [requests, selectedRequestId],
    );

    useEffect(() => {
        if (!selectedRequest) return;
        setSerialNumberInput(
            selectedRequest.serialNumber && selectedRequest.serialNumber !== "-"
                ? selectedRequest.serialNumber
                : "",
        );
        setRepairNotes({
            troubleDescription: selectedRequest.troubleDescription ?? "",
            replacedParts: selectedRequest.replacedParts ?? "",
            reconditionedParts: selectedRequest.reconditionedParts ?? "",
        });
    }, [selectedRequest]);

    const closeDetail = () => {
        setSelectedRequestId(null);
        setSaving(false);
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

    const scanSerialFromImage = useCallback(async (file) => {
        const value = await scanBarcodeFromFile(file);
        if (!value) return false;
        setSerialNumberInput(value);
        return true;
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

        if (cameraTarget === "serial-scan") {
            const found = await scanSerialFromImage(file);
            closeCamera();
            if (!found) {
                await showAlert(
                    "Barcode belum terbaca, arahkan kamera lebih dekat lalu scan ulang.",
                    { title: "Scan Gagal" },
                );
            }
            return;
        }
        if (cameraTarget === "before") setBeforePhotoFile(file);
        if (cameraTarget === "progress") setProgressPhotoFile(file);
        if (cameraTarget === "after") setAfterPhotoFile(file);

        closeCamera();
    };

    const saveChanges = async () => {
        if (!selectedRequest) return;

        // Check if there are any changes to save
        const nextTrouble = (repairNotes.troubleDescription ?? "").trim();
        const nextReplaced = (repairNotes.replacedParts ?? "").trim();
        const nextReconditioned = (repairNotes.reconditionedParts ?? "").trim();
        const nextSerial = (serialNumberInput ?? "").trim();
        const currentSerial =
            selectedRequest.serialNumber && selectedRequest.serialNumber !== "-"
                ? String(selectedRequest.serialNumber).trim()
                : "";

        const hasRepairNoteChanges =
            nextTrouble !== (selectedRequest.troubleDescription ?? "") ||
            nextReplaced !== (selectedRequest.replacedParts ?? "") ||
            nextReconditioned !== (selectedRequest.reconditionedParts ?? "") ||
            nextSerial !== currentSerial;

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
                trouble_description: nextTrouble,
                replaced_parts: nextReplaced,
                reconditioned_parts: nextReconditioned,
                serial_number: nextSerial,
                updated_at: new Date().toISOString(),
            };

            // Add photo URLs if uploaded
            if (beforeUrl) payload.before_photo_url = beforeUrl;
            if (progressUrl) payload.progress_photo_url = progressUrl;
            if (afterUrl) payload.after_photo_url = afterUrl;

            // Add technician info if technician
            if (role === "technician") {
                payload.technician_id = user?.id ?? null;
                payload.technician_name = getCurrentUserDisplayName(user);
            }

            // Determine status automatically based on photos
            // Check current photos + newly uploaded ones
            const hasBefore = beforeUrl || selectedRequest.beforePhotoUrl;
            const hasProgress = progressUrl || selectedRequest.progressPhotoUrl;
            const hasAfter = afterUrl || selectedRequest.afterPhotoUrl;

            if (hasAfter) {
                payload.status = "completed";
            } else if (hasProgress && hasBefore) {
                payload.status = "in_progress";
            } else if (hasBefore) {
                payload.status = "pending";
            } else {
                // Keep current status if no photos
                payload.status = selectedRequest.status;
            }

            const { error } = await supabase
                .from("requests")
                .update(payload)
                .eq("id", selectedRequest.id);

            if (error) throw error;

            await loadRequests();
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

                    {role !== "technician" && (
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
                    )}

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
                                                    <h2 className="wrap-break-word text-lg font-semibold text-slate-900  md:text-xl">
                                                        {item.title}
                                                    </h2>
                                                    <p className="mt-2 flex items-start gap-2 wrap-break-word text-sm text-slate-500 md:text-base">
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
                                                    <span className="wrap-break-word">
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
                                            <p className="mt-3 inline-flex items-center gap-2 wrap-break-word text-sm text-slate-600">
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
                                <div className="mt-3 inline-flex rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 bg-slate-50">
                                    {STATUS_LABELS[selectedRequest.status] ??
                                        "PENDING"}
                                </div>
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
                                {role === "technician" ? (
                                    <div className="mt-3 space-y-3">
                                        <label className="block">
                                            <span className="text-xs font-medium text-slate-600">
                                                Serial Number (scan barcode
                                                kamera)
                                            </span>
                                            <div className="mt-1 flex gap-2">
                                                <input
                                                    value={serialNumberInput}
                                                    readOnly
                                                    className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700 outline-none"
                                                    placeholder="Scan barcode serial dari kamera"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        openCamera(
                                                            "serial-scan",
                                                        )
                                                    }
                                                    className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                                    title="Scan serial dengan kamera"
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
                                                value={
                                                    repairNotes.troubleDescription
                                                }
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
                                                value={
                                                    repairNotes.replacedParts
                                                }
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
                                                value={
                                                    repairNotes.reconditionedParts
                                                }
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
                                ) : (
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
                                )}
                            </div>
                        </div>

                        <div className="mt-4 rounded-2xl border border-slate-200 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Dokumentasi
                            </p>
                            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                                {[
                                    {
                                        label: "Before",
                                        url: selectedRequest.beforePhotoUrl,
                                    },
                                    {
                                        label: "Progress",
                                        url: selectedRequest.progressPhotoUrl,
                                    },
                                    {
                                        label: "After",
                                        url: selectedRequest.afterPhotoUrl,
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
                                                Belum ada foto
                                            </div>
                                        )}
                                        <p className="border-t border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">
                                            {item.label}
                                        </p>
                                    </div>
                                ))}
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
                <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/80 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <p className="text-sm font-semibold text-slate-800">
                                {cameraTarget === "serial-scan"
                                    ? "Scan Barcode Serial"
                                    : "Ambil Foto"}
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
                            {cameraTarget === "serial-scan"
                                ? "Scan Sekarang"
                                : "Ambil Foto"}
                        </button>
                    </div>
                </div>
            )}

            {cameraError && (
                <div className="fixed bottom-20 right-4 z-70 rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white shadow-lg">
                    {cameraError}
                </div>
            )}
        </div>
    );
}
