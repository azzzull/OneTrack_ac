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
    ChevronLeft,
    ChevronRight,
    Trash2,
} from "lucide-react";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import CustomSelect from "../../components/ui/CustomSelect";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import { useAuth } from "../../context/useAuth";
import { useDialog } from "../../context/useDialog";
import supabase from "../../supabaseClient";
import { scanBarcodeFromFile } from "../../utils/barcodeScanner";
import { formatDateUniversal } from "../../utils/dateFormatter";

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
    return formatDateUniversal(value);
};

const formatOrderId = (value) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "-";
    if (raw.length <= 12) return raw.toUpperCase();
    return `${raw.slice(0, 8).toUpperCase()}-${raw.slice(-4).toUpperCase()}`;
};

const previewText = (value, max = 90) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "-";
    if (raw.length <= max) return raw;
    return `${raw.slice(0, max).trim()}...`;
};

const hasValidSerialNumber = (value) => {
    const normalized = String(value ?? "").trim();
    if (!normalized) return false;
    return normalized !== "-" && normalized.toLowerCase() !== "null";
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
    const { alert: showAlert, confirm: showConfirm } = useDialog();
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
    const [photoPreview, setPhotoPreview] = useState({
        open: false,
        url: "",
        label: "",
    });
    const [hasDeferredRefresh, setHasDeferredRefresh] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 5;

    const streamRef = useRef(null);
    const videoRef = useRef(null);
    const deferRefreshRef = useRef(false);
    const beforeFileInputRef = useRef(null);
    const progressFileInputRef = useRef(null);
    const afterFileInputRef = useRef(null);

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
                { event: "DELETE", schema: "public", table: "requests" },
                () => {
                    // Immediately refresh on delete
                    loadRequests();
                },
            )
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "requests" },
                () => {
                    if (deferRefreshRef.current) {
                        setHasDeferredRefresh(true);
                        return;
                    }
                    loadRequests();
                },
            )
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "requests" },
                () => {
                    if (deferRefreshRef.current) {
                        setHasDeferredRefresh(true);
                        return;
                    }
                    loadRequests();
                },
            )
            .subscribe();

        return () => {
            clearTimeout(timerId);
            channel.unsubscribe();
        };
    }, [loadRequests]);

    useEffect(() => {
        deferRefreshRef.current = Boolean(
            selectedRequestId || cameraOpen || saving,
        );
    }, [cameraOpen, saving, selectedRequestId]);

    useEffect(() => {
        if (deferRefreshRef.current || !hasDeferredRefresh) return;
        setHasDeferredRefresh(false);
        loadRequests();
    }, [hasDeferredRefresh, loadRequests]);

    // Check if selected request still exists (not deleted elsewhere)
    useEffect(() => {
        if (!selectedRequestId || !requests) return;
        const requestExists = requests.some(
            (req) => req.id === selectedRequestId,
        );

        if (!requestExists) {
            // Request was deleted elsewhere, close modal and clear selection
            setSelectedRequestId(null);
            setBeforePhotoFile(null);
            setProgressPhotoFile(null);
            setAfterPhotoFile(null);
            setPhotoPreview({ open: false, url: "", label: "" });
        }
    }, [requests, selectedRequestId]);

    useEffect(() => {
        const intervalId = setInterval(() => {
            if (deferRefreshRef.current) return;
            loadRequests();
        }, 5000);

        const onVisibilityChange = () => {
            if (document.visibilityState !== "visible") return;
            if (deferRefreshRef.current) {
                setHasDeferredRefresh(true);
                return;
            }
            loadRequests();
        };

        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => {
            clearInterval(intervalId);
            document.removeEventListener(
                "visibilitychange",
                onVisibilityChange,
            );
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
                ? `${item.title} ${item.address} ${item.roomLocation} ${item.troubleDescription} ${item.assignee} ${item.requester} ${item.id} ${formatOrderId(item.id)}`
                      .toLowerCase()
                      .includes(keyword)
                : true;
            return matchTechnicianQueue && matchFilter && matchSearch;
        });
    }, [activeFilter, requests, role, search]);

    // Pagination calculations
    const totalPages = Math.ceil(filteredRequests.length / ITEMS_PER_PAGE);
    const paginatedRequests = useMemo(() => {
        const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIdx = startIdx + ITEMS_PER_PAGE;
        return filteredRequests.slice(startIdx, endIdx);
    }, [filteredRequests, currentPage]);

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [activeFilter, search]);

    const selectedRequest = useMemo(
        () => requests.find((item) => item.id === selectedRequestId) ?? null,
        [requests, selectedRequestId],
    );

    useEffect(() => {
        if (!selectedRequest) return;
        setSerialNumberInput(
            hasValidSerialNumber(selectedRequest.serialNumber)
                ? String(selectedRequest.serialNumber).trim()
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
        setPhotoPreview({ open: false, url: "", label: "" });
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

    const openPhotoPreview = (url, label) => {
        if (!url) return;
        setPhotoPreview({ open: true, url, label });
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

    const handleGallerySelect = (target, event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (target === "before") setBeforePhotoFile(file);
        if (target === "progress") setProgressPhotoFile(file);
        if (target === "after") setAfterPhotoFile(file);
        event.target.value = "";
    };

    const openGalleryPicker = (target) => {
        if (target === "before") beforeFileInputRef.current?.click();
        if (target === "progress") progressFileInputRef.current?.click();
        if (target === "after") afterFileInputRef.current?.click();
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

            if (
                role === "technician" &&
                hasAfter &&
                !hasValidSerialNumber(nextSerial)
            ) {
                await showAlert(
                    "harap isi serial number (scan atau ketik manual)",
                    {
                        title: "Informasi",
                    },
                );
                return;
            }

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

    const deleteRequest = async () => {
        const confirmed = await showConfirm(
            "Apakah Anda yakin ingin menghapus pekerjaan ini? Tindakan ini tidak dapat dibatalkan.",
            {
                title: "Konfirmasi Hapus",
                danger: true,
                confirmText: "Ya, Hapus",
                cancelText: "Batal",
            },
        );

        if (!confirmed) return;

        try {
            // Delete photos from storage if they exist
            const photosToDelete = [
                selectedRequest.beforePhotoUrl,
                selectedRequest.progressPhotoUrl,
                selectedRequest.afterPhotoUrl,
            ].filter(Boolean);

            for (const photoUrl of photosToDelete) {
                try {
                    // Extract path from public URL
                    // URL format: https://[bucket-url]/storage/v1/object/public/job-photos/[path]
                    const urlParts = photoUrl.split("/job-photos/");
                    if (urlParts.length > 1) {
                        const path = urlParts[1];
                        await supabase.storage
                            .from("job-photos")
                            .remove([path]);
                    }
                } catch (photoError) {
                    console.error("Error deleting photo:", photoError);
                    // Continue with deletion even if photo delete fails
                }
            }

            // Delete request from database
            const { error } = await supabase
                .from("requests")
                .delete()
                .eq("id", selectedRequest.id);

            if (error) throw error;

            await showAlert("Pekerjaan dan foto berhasil dihapus.", {
                title: "Sukses",
            });

            await loadRequests();
            closeDetail();
        } catch (error) {
            console.error("Error deleting request:", error);
            await showAlert("Gagal menghapus pekerjaan.", { title: "Error" });
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
                            paginatedRequests.map((item) => (
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
                                                    <p className="mt-1 break-all text-xs text-slate-500">
                                                        Order ID:{" "}
                                                        <span
                                                            title={
                                                                item.id ?? "-"
                                                            }
                                                        >
                                                            {formatOrderId(
                                                                item.id,
                                                            )}
                                                        </span>
                                                    </p>
                                                    <p className="mt-2 flex items-start gap-2 wrap-break-word text-sm text-slate-500 md:text-base">
                                                        <MapPin size={16} />
                                                        <span>
                                                            {item.address}
                                                        </span>
                                                    </p>
                                                    <p className="mt-1 text-xs text-slate-500">
                                                        Ruangan:{" "}
                                                        {previewText(
                                                            item.roomLocation,
                                                            48,
                                                        )}
                                                    </p>
                                                    <p className="mt-1 text-xs text-slate-500">
                                                        Deskripsi:{" "}
                                                        {previewText(
                                                            item.troubleDescription,
                                                        )}
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
                                                    <CalendarDays size={14} />
                                                    <span className="break-all">
                                                        {formatDate(item.date)}
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
                                                <UserRound size={15} />
                                                <span className="break-all">
                                                    {item.phone}
                                                </span>
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

                        {filteredRequests.length > ITEMS_PER_PAGE && (
                            <div className="mt-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
                                <div className="text-sm text-slate-600">
                                    Page{" "}
                                    <span className="font-semibold">
                                        {currentPage}
                                    </span>{" "}
                                    of{" "}
                                    <span className="font-semibold">
                                        {totalPages}
                                    </span>{" "}
                                    • Showing{" "}
                                    <span className="font-semibold">
                                        {paginatedRequests.length}
                                    </span>{" "}
                                    of{" "}
                                    <span className="font-semibold">
                                        {filteredRequests.length}
                                    </span>{" "}
                                    results
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() =>
                                            setCurrentPage((p) =>
                                                Math.max(1, p - 1),
                                            )
                                        }
                                        disabled={currentPage === 1}
                                        className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white p-2 text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                                        title="Previous page"
                                    >
                                        <ChevronLeft size={18} />
                                    </button>

                                    <div className="flex gap-1">
                                        {Array.from(
                                            { length: totalPages },
                                            (_, i) => i + 1,
                                        ).map((page) => (
                                            <button
                                                key={page}
                                                onClick={() =>
                                                    setCurrentPage(page)
                                                }
                                                className={`inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition ${
                                                    currentPage === page
                                                        ? "bg-sky-500 text-white"
                                                        : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                                }`}
                                            >
                                                {page}
                                            </button>
                                        ))}
                                    </div>

                                    <button
                                        onClick={() =>
                                            setCurrentPage((p) =>
                                                Math.min(totalPages, p + 1),
                                            )
                                        }
                                        disabled={currentPage === totalPages}
                                        className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white p-2 text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                                        title="Next page"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                </div>
                            </div>
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
                            <div className="flex items-center gap-2">
                                {role === "admin" && (
                                    <button
                                        type="button"
                                        onClick={deleteRequest}
                                        className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                                        title="Hapus pekerjaan"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={closeDetail}
                                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                                >
                                    <X size={18} />
                                </button>
                            </div>
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

                            <div className="rounded-2xl border border-slate-200 p-4 flex flex-col items-start gap-2">
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
                                            Merk AC:
                                        </span>{" "}
                                        {selectedRequest.acBrand}
                                    </p>
                                    <p>
                                        <span className="font-medium">
                                            Tipe AC:
                                        </span>{" "}
                                        {selectedRequest.acType}
                                    </p>
                                    <p>
                                        <span className="font-medium">
                                            Kapasitas AC:
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
                                            Serial Number AC:
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
                                                Serial Number
                                            </span>
                                            <div className="mt-1 flex gap-2">
                                                <input
                                                    value={serialNumberInput}
                                                    onChange={(event) =>
                                                        setSerialNumberInput(
                                                            event.target.value,
                                                        )
                                                    }
                                                    className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700 outline-none"
                                                    placeholder="Scan dari kamera atau ketik manual"
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
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setSerialNumberInput("")
                                                    }
                                                    className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                                    title="Kosongkan serial number"
                                                >
                                                    <X size={14} />
                                                    Hapus
                                                </button>
                                            </div>
                                            <p className="mt-2 text-xs text-slate-500">
                                                Jika unit tidak punya barcode,
                                                isi manual nomor seri.
                                            </p>
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
                            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                                {[
                                    {
                                        label: "Preview Foto Before",
                                        url: selectedRequest.beforePhotoUrl,
                                    },
                                    {
                                        label: "Preview Foto Proses",
                                        url: selectedRequest.progressPhotoUrl,
                                    },
                                    {
                                        label: "Preview Foto After",
                                        url: selectedRequest.afterPhotoUrl,
                                    },
                                ].map((item) => (
                                    <button
                                        key={item.label}
                                        type="button"
                                        disabled={!item.url}
                                        onClick={() =>
                                            openPhotoPreview(
                                                item.url,
                                                item.label,
                                            )
                                        }
                                        className="w-full rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm font-medium text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:hover:bg-slate-100"
                                    >
                                        {item.url
                                            ? item.label
                                            : "foto belum di ambil"}
                                    </button>
                                ))}
                            </div>

                            {selectedRequest.status !== "completed" && (
                                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                                    <div className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-600">
                                        <input
                                            ref={beforeFileInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={(event) =>
                                                handleGallerySelect(
                                                    "before",
                                                    event,
                                                )
                                            }
                                            className="hidden"
                                        />
                                        <p className="font-medium">
                                            Foto Before
                                        </p>
                                        <p className="mt-1 truncate text-xs text-slate-500">
                                            {beforePhotoFile
                                                ? beforePhotoFile.name
                                                : "Belum pilih foto"}
                                        </p>
                                        <div className="mt-2 flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    openCamera("before")
                                                }
                                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                            >
                                                <Camera size={14} />
                                                Kamera
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    openGalleryPicker("before")
                                                }
                                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                            >
                                                Pilih Galeri
                                            </button>
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-600">
                                        <input
                                            ref={progressFileInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={(event) =>
                                                handleGallerySelect(
                                                    "progress",
                                                    event,
                                                )
                                            }
                                            className="hidden"
                                        />
                                        <p className="font-medium">
                                            Foto Progress
                                        </p>
                                        <p className="mt-1 truncate text-xs text-slate-500">
                                            {progressPhotoFile
                                                ? progressPhotoFile.name
                                                : "Belum pilih foto"}
                                        </p>
                                        <div className="mt-2 flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    openCamera("progress")
                                                }
                                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                            >
                                                <Camera size={14} />
                                                Kamera
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    openGalleryPicker(
                                                        "progress",
                                                    )
                                                }
                                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                            >
                                                Pilih Galeri
                                            </button>
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-600">
                                        <input
                                            ref={afterFileInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={(event) =>
                                                handleGallerySelect(
                                                    "after",
                                                    event,
                                                )
                                            }
                                            className="hidden"
                                        />
                                        <p className="font-medium">
                                            Foto After
                                        </p>
                                        <p className="mt-1 truncate text-xs text-slate-500">
                                            {afterPhotoFile
                                                ? afterPhotoFile.name
                                                : "Belum pilih foto"}
                                        </p>
                                        <div className="mt-2 flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    openCamera("after")
                                                }
                                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                            >
                                                <Camera size={14} />
                                                Kamera
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    openGalleryPicker("after")
                                                }
                                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                            >
                                                Pilih Galeri
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

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

            {photoPreview.open && (
                <div className="fixed inset-0 z-55 flex items-center justify-center bg-slate-900/70 p-4">
                    <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl">
                        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                            <h3 className="text-sm font-semibold text-slate-900">
                                Preview Foto {photoPreview.label}
                            </h3>
                            <button
                                type="button"
                                onClick={() =>
                                    setPhotoPreview({
                                        open: false,
                                        url: "",
                                        label: "",
                                    })
                                }
                                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="bg-black">
                            <img
                                src={photoPreview.url}
                                alt={`Foto ${photoPreview.label}`}
                                className="max-h-[75vh] w-full object-contain"
                            />
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
