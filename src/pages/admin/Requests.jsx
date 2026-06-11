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
    Users,
    Wrench,
    X,
    ChevronLeft,
    ChevronRight,
    FileSpreadsheet,
    RotateCcw,
    Trash2,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import PhotoUploadInput from "../../components/PhotoUploadInput";
import CustomSelect from "../../components/ui/CustomSelect";
import ScopeDetailsCard from "../../components/ScopeDetailsCard";
import JobTechnicianManagerModal from "../../components/job-technicians/JobTechnicianManagerModal";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import useJobTechnicians from "../../hooks/useJobTechnicians";
import useTechnicianDirectory from "../../hooks/useTechnicianDirectory";
import useNetworkStatus from "../../hooks/useNetworkStatus";
import { useAuth } from "../../context/useAuth";
import { useDialog } from "../../context/useDialog";
import supabase from "../../supabaseClient";
import { scanBarcodeFromFile } from "../../utils/barcodeScanner";
import { formatDateUniversal } from "../../utils/dateFormatter";
import { createUniqueChannelName } from "../../utils/realtimeChannelManager";
import { createOfflineQueueItem } from "../../utils/offlineQueue";
import { getScopeSummaryMeta } from "../../utils/jobScopeCatalog";
import {
    claimPendingRequestJob,
    getTechnicianJobIds,
    getTechnicianVisibleJobIds,
    syncJobTechnicians,
} from "../../services/jobTechniciansService";
import {
    NOTIFICATION_EVENT_TYPES,
    notifyEvent,
} from "../../services/notificationEvents";

const FILTERS = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "in_progress", label: "In Progress" },
    { key: "completed", label: "Completed" },
];

const getValidFilter = (value) =>
    FILTERS.some((filter) => filter.key === value) ? value : "all";

const STATUS_LABELS = {
    pending: "PENDING",
    in_progress: "IN PROGRESS",
    completed: "COMPLETED",
    cancelled: "DIBATALKAN",
};

const STATUS_STYLES = {
    pending: "bg-amber-100 text-amber-700",
    in_progress: "bg-blue-100 text-blue-700",
    completed: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-rose-100 text-rose-700",
};

const STATUS_OPTIONS = [
    { value: "pending", label: "Pending" },
    { value: "in_progress", label: "In Progress" },
    { value: "completed", label: "Completed" },
];

const PERIOD_OPTIONS = [
    { value: "all", label: "Semua Periode" },
    { value: "today", label: "Hari Ini" },
    { value: "week", label: "Minggu Ini" },
    { value: "month", label: "Bulan Ini" },
    { value: "year", label: "Tahun Ini" },
    { value: "custom", label: "Custom Periode" },
];

const normalizeStatusKey = (value) => {
    const raw = String(value ?? "")
        .trim()
        .toLowerCase()
        .replaceAll("-", "_")
        .replaceAll(" ", "_");
    if (raw === "inprogress") return "in_progress";
    if (raw === "in_progress") return "in_progress";
    if (raw === "completed" || raw === "done") return "completed";
    if (raw === "cancelled" || raw === "canceled") return "cancelled";
    if (raw === "requested") return "pending";
    if (raw === "pending" || raw === "") return "pending";
    return "pending";
};

const pickFirst = (obj, keys, fallback = "") => {
    for (const key of keys) {
        const value = obj?.[key];
        if (value !== null && value !== undefined && value !== "") {
            return value;
        }
    }
    return fallback;
};

const startOfDay = (date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate());

const endOfDay = (date) =>
    new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        23,
        59,
        59,
        999,
    );

const getDateRangeForPeriod = (period, customStartDate, customEndDate) => {
    const now = new Date();
    let start = null;
    let end = null;

    if (period === "today") {
        start = startOfDay(now);
        end = endOfDay(now);
    } else if (period === "week") {
        const currentDay = now.getDay();
        const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
        start = startOfDay(
            new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset),
        );
        end = endOfDay(
            new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6),
        );
    } else if (period === "month") {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    } else if (period === "year") {
        start = new Date(now.getFullYear(), 0, 1);
        end = endOfDay(new Date(now.getFullYear(), 11, 31));
    } else if (period === "custom") {
        start = customStartDate ? startOfDay(new Date(customStartDate)) : null;
        end = customEndDate ? endOfDay(new Date(customEndDate)) : null;
    }

    return { start, end };
};

const isDateInRange = (value, range) => {
    if (!range.start && !range.end) return true;
    if (!value) return false;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    if (range.start && date < range.start) return false;
    if (range.end && date > range.end) return false;
    return true;
};

const getPeriodLabel = (period, customStartDate, customEndDate) => {
    if (period === "custom") {
        if (customStartDate && customEndDate) {
            return `${customStartDate} sampai ${customEndDate}`;
        }
        if (customStartDate) return `mulai ${customStartDate}`;
        if (customEndDate) return `sampai ${customEndDate}`;
    }

    return (
        PERIOD_OPTIONS.find((item) => item.value === period)?.label ??
        "Semua Periode"
    );
};

const getReadableExportFileName = ({
    period,
    customStartDate,
    customEndDate,
    technicianName,
}) => {
    const parts = ["Laporan", "Pekerjaan"];

    if (technicianName) {
        parts.push(technicianName);
    }

    if (period === "custom" && (customStartDate || customEndDate)) {
        parts.push(`${customStartDate || "Awal"} sampai ${customEndDate || "Akhir"}`);
    } else if (period !== "all") {
        parts.push(getPeriodLabel(period));
    }

    return `${parts
        .join(" ")
        .trim()
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")}.xlsx`;
};

const parseExcelDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const getExportStatusLabel = (value) => {
    const status = normalizeStatusKey(value);
    if (status === "in_progress") return "Dalam Progress";
    if (status === "completed") return "Selesai";
    if (status === "cancelled") return "Dibatalkan";
    return "Pending";
};

const buildStatusSummary = (items) =>
    items.reduce(
        (acc, item) => {
            const status = normalizeStatusKey(item.status);
            acc.total += 1;
            if (status === "pending") acc.pending += 1;
            if (status === "in_progress") acc.in_progress += 1;
            if (status === "completed") acc.completed += 1;
            if (status === "cancelled") acc.cancelled += 1;
            return acc;
        },
        {
            total: 0,
            pending: 0,
            in_progress: 0,
            completed: 0,
            cancelled: 0,
        },
    );

const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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

const getNotificationName = (value, fallback) => {
    const primary = String(value ?? "").trim();
    if (primary && primary !== "-") return primary;
    const secondary = String(fallback ?? "").trim();
    return secondary && secondary !== "-" ? secondary : "";
};

const REQUEST_CACHE_PREFIX = "onetrack.requests.cache";

const readCachedRequests = (userId) => {
    if (!userId || typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(
            `${REQUEST_CACHE_PREFIX}.${userId}`,
        );
        return raw ? JSON.parse(raw) : [];
    } catch (error) {
        console.warn("Failed to read cached requests:", error);
        return [];
    }
};

const writeCachedRequests = (userId, requests) => {
    if (!userId || typeof window === "undefined") return;
    try {
        window.localStorage.setItem(
            `${REQUEST_CACHE_PREFIX}.${userId}`,
            JSON.stringify(requests),
        );
    } catch (error) {
        console.warn("Failed to cache requests:", error);
    }
};

const isNetworkFailure = (error) => {
    const message = String(error?.message ?? error ?? "").toLowerCase();
    return (
        !navigator.onLine ||
        message.includes("failed to fetch") ||
        message.includes("network") ||
        message.includes("load failed") ||
        message.includes("timeout")
    );
};

const normalizeRequest = (row, creatorName = "", jobTechnicians = []) => {
    const status = normalizeStatusKey(pickFirst(row, ["status"], "pending"));
    const directTechnicianId = pickFirst(row, ["technician_id"], "");
    const technicianIds = [
        ...new Set(
            [
                ...jobTechnicians.map((item) => item.technician_id),
                directTechnicianId,
            ]
                .filter(Boolean)
                .map((id) => String(id)),
        ),
    ];
    const technicianNames = [
        ...new Set(
            [...jobTechnicians]
                .sort((left, right) => {
                    if (left.role === right.role) return 0;
                    return left.role === "creator" ? -1 : 1;
                })
                .map((item) => item.technician_name)
                .filter((name) => name && name !== "-"),
        ),
    ];
    const assignedTechnicianName = technicianNames.join(", ");
    const directTechnicianName =
        technicianIds.length > 0
            ? pickFirst(
                  row,
                  ["technician_name", "assignee", "crew_name", "team_name"],
                  "",
              )
            : "";
    const displayTechnicianName =
        assignedTechnicianName || directTechnicianName || "-";

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
        customerId: pickFirst(row, ["customer_id"], ""),
        technicianId: directTechnicianId,
        technicianIds,
        technicianNames,
        assignee: displayTechnicianName,
        technicianName: displayTechnicianName,
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
        jobBrief: pickFirst(row, ["job_brief", "brief"], "-"),
        jobScope: pickFirst(row, ["job_scope"], "AC"),
        dynamicData:
            row?.dynamic_data && typeof row.dynamic_data === "object"
                ? row.dynamic_data
                : {},
        troubleDescription: pickFirst(row, ["trouble_description"], "-"),
        replacedParts: pickFirst(row, ["replaced_parts"], "-"),
        reconditionedParts: pickFirst(row, ["reconditioned_parts"], "-"),
        beforePhotoUrl: pickFirst(row, ["before_photo_url"], ""),
        progressPhotoUrl: pickFirst(row, ["progress_photo_url"], ""),
        afterPhotoUrl: pickFirst(row, ["after_photo_url"], ""),
        createdAt: pickFirst(row, ["created_at"], null),
        updatedAt: pickFirst(row, ["updated_at"], null),
        completedAt: pickFirst(row, ["completed_at"], null),
        reportDate: pickFirst(row, ["created_at", "updated_at"], null),
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

const sortRequestsByDateDesc = (items) =>
    [...items].sort((a, b) => new Date(b?.date ?? 0) - new Date(a?.date ?? 0));

const getCompactPagination = (currentPage, totalPages) => {
    if (totalPages <= 5) {
        return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    if (currentPage <= 3) {
        return [1, 2, 3, 4, "end-ellipsis", totalPages];
    }

    if (currentPage >= totalPages - 2) {
        return [
            1,
            "start-ellipsis",
            totalPages - 3,
            totalPages - 2,
            totalPages - 1,
            totalPages,
        ];
    }

    return [
        1,
        "start-ellipsis",
        currentPage - 1,
        currentPage,
        currentPage + 1,
        "end-ellipsis",
        totalPages,
    ];
};

const upsertNormalizedRequest = (items, nextItem) => {
    const next = [...items];
    const index = next.findIndex((item) => item.id === nextItem.id);

    if (index >= 0) {
        next[index] = nextItem;
    } else {
        next.push(nextItem);
    }

    return sortRequestsByDateDesc(next);
};

const shouldIncludeRequestForRole = (row, role, userId) => {
    if (role !== "technician") return true;
    if (!row) return false;

    const technicianId = row.technician_id ?? "";

    return Boolean(userId) && technicianId === userId;
};

export default function AdminRequestsPage() {
    const { user, role, profile, loading: authLoading } = useAuth();
    const { isOnline } = useNetworkStatus();
    const { alert: showAlert, confirm: showConfirm } = useDialog();
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeFilter, setActiveFilter] = useState(
        getValidFilter(searchParams.get("status") ?? "all"),
    );
    const [search, setSearch] = useState("");
    const [periodFilter, setPeriodFilter] = useState("all");
    const [customStartDate, setCustomStartDate] = useState("");
    const [customEndDate, setCustomEndDate] = useState("");
    const [selectedTechnicianId, setSelectedTechnicianId] = useState("all");
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exportLoading, setExportLoading] = useState(null);
    const [selectedRequestId, setSelectedRequestId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [repairNotes, setRepairNotes] = useState({
        troubleDescription: "",
        replacedParts: "",
        reconditionedParts: "",
    });
    const [serialNumberInput, setSerialNumberInput] = useState("");
    const [beforePhotoUrl, setBeforePhotoUrl] = useState(null);
    const [progressPhotoUrl, setProgressPhotoUrl] = useState(null);
    const [afterPhotoUrl, setAfterPhotoUrl] = useState(null);
    const [pendingPhotoTypes, setPendingPhotoTypes] = useState({});
    const [cameraOpen, setCameraOpen] = useState(false);
    const [cameraTarget, setCameraTarget] = useState(null);
    const [cameraError, setCameraError] = useState("");
    const [photoPreview, setPhotoPreview] = useState({
        open: false,
        url: "",
        label: "",
    });
    const [jobTechnicianModalOpen, setJobTechnicianModalOpen] = useState(false);
    const [hasDeferredRefresh, setHasDeferredRefresh] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 5;

    const streamRef = useRef(null);
    const videoRef = useRef(null);
    const deferRefreshRef = useRef(false);
    const channelRef = useRef(null);
    const isMountedRef = useRef(true);
    const roleRef = useRef(role);
    const userIdRef = useRef(user?.id);
    const authLoadingRef = useRef(authLoading);

    useEffect(() => {
        isMountedRef.current = true;
        roleRef.current = role;
        userIdRef.current = user?.id;
        authLoadingRef.current = authLoading;
        return () => {
            isMountedRef.current = false;
        };
    }, [role, user?.id, authLoading]);

    const loadRequests = useCallback(async () => {
        try {
            if (!navigator.onLine) {
                if (isMountedRef.current) {
                    setRequests(readCachedRequests(userIdRef.current));
                    setLoading(false);
                }
                return;
            }

            let query = supabase
                .from("requests")
                .select("*")
                .order("created_at", { ascending: false });

            if (roleRef.current === "technician" && userIdRef.current) {
                const technicianJobIds = await getTechnicianVisibleJobIds(
                    userIdRef.current,
                );
                if (technicianJobIds.length === 0) {
                    if (isMountedRef.current) {
                        setRequests([]);
                        setLoading(false);
                    }
                    return;
                }
                query = query.in("id", technicianJobIds);
            }

            const { data, error } = await query;

            if (error) throw error;
            const requestRows = data ?? [];
            const requestIds = requestRows.map((row) => row.id).filter(Boolean);

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
                    console.warn(
                        "Profiles lookup skipped due to RLS:",
                        profilesError.message,
                    )
                    .on(
                        "postgres_changes",
                        {
                            event: "*",
                            schema: "public",
                            table: "job_technicians",
                        },
                        () => {
                            if (!isMountedRef.current) return;
                            if (deferRefreshRef.current) {
                                setHasDeferredRefresh(true);
                                return;
                            }
                            loadRequests();
                        },
                    );
                } else {
                    creatorMap = (profiles ?? []).reduce((acc, profile) => {
                        acc[profile.id] = getProfileDisplayName(profile);
                        return acc;
                    }, {});
                }
            }

            let jobTechnicianMap = {};
            if (requestIds.length > 0) {
                const {
                    data: technicianSummaryRows,
                    error: technicianSummaryError,
                } = await supabase.rpc("get_request_technician_summaries", {
                    p_request_ids: requestIds,
                });

                if (!technicianSummaryError) {
                    jobTechnicianMap = (technicianSummaryRows ?? []).reduce(
                        (acc, row) => {
                            const jobId = row.job_id;
                            if (!jobId) return acc;
                            if (!acc[jobId]) acc[jobId] = [];
                            acc[jobId].push({
                                technician_id: row.technician_id,
                                technician_name:
                                    row.technician_name ??
                                    "Teknisi tidak ditemukan",
                                role: row.role,
                            });
                            return acc;
                        },
                        {},
                    );
                } else {
                    console.warn(
                        "Technician summary lookup skipped:",
                        technicianSummaryError.message,
                    );
                }
            }

            if (requestIds.length > 0 && Object.keys(jobTechnicianMap).length === 0) {
                const { data: jobTechnicianRows, error: jobTechniciansError } =
                    await supabase
                        .from("job_technicians")
                        .select("job_id, technician_id, role")
                        .in("job_id", requestIds);

                if (jobTechniciansError) {
                    console.warn(
                        "Job technician lookup skipped:",
                        jobTechniciansError.message,
                    );
                } else {
                    const technicianIds = [
                        ...new Set(
                            (jobTechnicianRows ?? [])
                                .map((row) => row.technician_id)
                                .filter(Boolean),
                        ),
                    ];
                    let technicianNameMap = {};

                    if (technicianIds.length > 0) {
                        const { data: technicianProfiles, error: techniciansError } =
                            await supabase
                                .from("profiles")
                                .select("id, first_name, last_name, name, email")
                                .in("id", technicianIds);

                        if (techniciansError) {
                            console.warn(
                                "Technician profile lookup skipped:",
                                techniciansError.message,
                            );
                        } else {
                            technicianNameMap = (technicianProfiles ?? []).reduce(
                                (acc, technician) => {
                                    acc[technician.id] =
                                        getProfileDisplayName(technician);
                                    return acc;
                                },
                                {},
                            );
                        }
                    }

                    jobTechnicianMap = (jobTechnicianRows ?? []).reduce(
                        (acc, row) => {
                            const jobId = row.job_id;
                            if (!jobId) return acc;
                            if (!acc[jobId]) acc[jobId] = [];
                            acc[jobId].push({
                                technician_id: row.technician_id,
                                technician_name:
                                    technicianNameMap[row.technician_id] ??
                                    "Teknisi tidak ditemukan",
                                role: row.role,
                            });
                            return acc;
                        },
                        {},
                    );
                }
            }

            if (isMountedRef.current) {
                const normalizedRequests = requestRows.map((row) =>
                    normalizeRequest(
                        row,
                        creatorMap[row.created_by] ??
                            (row.created_by ? "User tidak ditemukan" : "-"),
                        jobTechnicianMap[row.id] ?? [],
                    ),
                );
                setRequests(normalizedRequests);
                writeCachedRequests(userIdRef.current, normalizedRequests);
            }
        } catch (error) {
            console.error("Error loading requests:", error);
            if (isMountedRef.current) {
                setRequests(readCachedRequests(userIdRef.current));
            }
        } finally {
            if (isMountedRef.current) {
                setLoading(false);
            }
        }
    }, []);

    // ✅ Setup channel with proper lifecycle management
    useEffect(() => {
        // ⚠️ CRITICAL GUARD: Don't setup if still loading auth OR no user
        // This prevents the "cannot add postgres_changes callbacks after subscribe()" error
        if (authLoadingRef.current || !userIdRef.current) {
            console.log(
                "[AdminRequests] Skipping channel setup - auth loading or no user:",
                {
                    loading: authLoadingRef.current,
                    userId: userIdRef.current,
                },
            );
            return;
        }

        const timerId = setTimeout(() => {
            loadRequests();
        }, 0);

        if (!isOnline) {
            return () => clearTimeout(timerId);
        }

        // Async channel setup with proper cleanup
        const setupChannel = async () => {
            try {
                // ✅ CRITICAL FIX: Cleanup ALL existing channels before creating new one
                // This prevents "cannot add postgres_changes callbacks after subscribe()" error
                // ✅ CRITICAL FIX: Use unique channel name with user ID
                const channelName = createUniqueChannelName(
                    "admin-requests",
                    userIdRef.current,
                );

                // ✅ Skip if channel already exists
                const existingChannels = supabase.getChannels();
                const existing = existingChannels.find(
                    (ch) => ch.topic === `realtime:${channelName}`,
                );

                if (existing) {
                    console.log(
                        "[AdminRequests] Channel already exists, reusing:",
                        channelName,
                    );
                    channelRef.current = existing;
                    return;
                }

                // ✅ Create new channel with user-specific name
                channelRef.current = supabase
                    .channel(channelName)
                    .on(
                        "postgres_changes",
                        {
                            event: "DELETE",
                            schema: "public",
                            table: "requests",
                        },
                        (payload) => {
                            if (!isMountedRef.current) return;
                            if (deferRefreshRef.current) {
                                setHasDeferredRefresh(true);
                                return;
                            }
                            setRequests((current) =>
                                current.filter(
                                    (item) => item.id !== payload.old.id,
                                ),
                            );
                        },
                    )
                    .on(
                        "postgres_changes",
                        {
                            event: "INSERT",
                            schema: "public",
                            table: "requests",
                        },
                        (payload) => {
                            if (!isMountedRef.current) return;
                            if (deferRefreshRef.current) {
                                setHasDeferredRefresh(true);
                                return;
                            }

                            if (roleRef.current === "technician") {
                                loadRequests();
                                return;
                            }

                            if (
                                !shouldIncludeRequestForRole(
                                    payload.new,
                                    roleRef.current,
                                    userIdRef.current,
                                )
                            ) {
                                return;
                            }

                            const creatorName = payload.new.created_by
                                ? "User tidak ditemukan"
                                : "-";
                            setRequests((current) =>
                                upsertNormalizedRequest(
                                    current,
                                    normalizeRequest(payload.new, creatorName),
                                ),
                            );
                        },
                    )
                    .on(
                        "postgres_changes",
                        {
                            event: "UPDATE",
                            schema: "public",
                            table: "requests",
                        },
                        (payload) => {
                            if (!isMountedRef.current) return;
                            if (deferRefreshRef.current) {
                                setHasDeferredRefresh(true);
                                return;
                            }

                            if (roleRef.current === "technician") {
                                loadRequests();
                                return;
                            }

                            const shouldInclude = shouldIncludeRequestForRole(
                                payload.new,
                                roleRef.current,
                                userIdRef.current,
                            );

                            if (!shouldInclude) {
                                setRequests((current) =>
                                    current.filter(
                                        (item) => item.id !== payload.new.id,
                                    ),
                                );
                                return;
                            }

                            setRequests((current) => {
                                const existing = current.find(
                                    (item) => item.id === payload.new.id,
                                );
                                return upsertNormalizedRequest(
                                    current,
                                    normalizeRequest(
                                        payload.new,
                                        existing?.createdByName ??
                                            (payload.new.created_by
                                                ? "User tidak ditemukan"
                                                : "-"),
                                    ),
                                );
                            });
                        },
                    );

                channelRef.current.on(
                    "postgres_changes",
                    {
                        event: "*",
                        schema: "public",
                        table: "job_technicians",
                    },
                    () => {
                        if (!isMountedRef.current) return;
                        if (deferRefreshRef.current) {
                            setHasDeferredRefresh(true);
                            return;
                        }
                        loadRequests();
                    },
                );

                const { error } = await channelRef.current.subscribe();

                if (error) {
                    console.error("[AdminRequests] Subscribe error:", error);
                    return;
                }

                console.log("[AdminRequests] Subscribed to:", channelName);
            } catch (error) {
                console.error("[AdminRequests] Channel setup error:", error);
            }
        };

        setupChannel();

        return () => {
            clearTimeout(timerId);
            // ✅ CRITICAL FIX: Proper cleanup using supabase.removeChannel()
            // NOT .unsubscribe() - that only stops receiving events
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
                console.log("[AdminRequests] Channel cleaned up");
            }
        };
    }, [isOnline, user?.id, loadRequests]);

    useEffect(() => {
        deferRefreshRef.current = Boolean(cameraOpen || saving);
    }, [cameraOpen, saving]);

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
            setBeforePhotoUrl(null);
            setProgressPhotoUrl(null);
            setAfterPhotoUrl(null);
            setPhotoPreview({ open: false, url: "", label: "" });
        }
    }, [requests, selectedRequestId]);

    useEffect(() => {
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
            document.removeEventListener(
                "visibilitychange",
                onVisibilityChange,
            );
        };
    }, [loadRequests]);

    const { technicians: technicianDirectory } = useTechnicianDirectory();
    const canFilterByTechnician = role === "admin" || role === "management";

    const selectedTechnicianName = useMemo(() => {
        if (selectedTechnicianId === "all") return "";
        const technician = technicianDirectory.find(
            (item) => String(item.id) === String(selectedTechnicianId),
        );
        return getProfileDisplayName(technician);
    }, [selectedTechnicianId, technicianDirectory]);

    const technicianOptions = useMemo(
        () => [
            { value: "all", label: "Semua Teknisi" },
            ...technicianDirectory.map((item) => ({
                value: item.id,
                label: getProfileDisplayName(item),
            })),
        ],
        [technicianDirectory],
    );

    const baseFilteredRequests = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        const dateRange = getDateRangeForPeriod(
            periodFilter,
            customStartDate,
            customEndDate,
        );

        return requests.filter((item) => {
            const scopeSummary = getScopeSummaryMeta(
                item.jobScope,
                item.dynamicData,
                item.roomLocation,
            );
            const technicianIds = [
                ...(item.technicianIds ?? []),
                item.technicianId,
                item.createdBy,
            ]
                .filter(Boolean)
                .map((id) => String(id));
            const matchPeriod = isDateInRange(item.reportDate, dateRange);
            const matchTechnician =
                !canFilterByTechnician || selectedTechnicianId === "all"
                    ? true
                    : technicianIds.includes(String(selectedTechnicianId));
            const matchSearch = keyword
                ? `${item.title} ${item.address} ${scopeSummary.value} ${item.jobBrief} ${item.troubleDescription} ${item.assignee} ${(item.technicianNames ?? []).join(" ")} ${item.requester} ${item.id} ${formatOrderId(item.id)}`
                      .toLowerCase()
                      .includes(keyword)
                : true;
            return matchPeriod && matchTechnician && matchSearch;
        });
    }, [
        canFilterByTechnician,
        customEndDate,
        customStartDate,
        periodFilter,
        requests,
        search,
        selectedTechnicianId,
    ]);

    const filteredRequests = useMemo(() => {
        if (activeFilter === "all") return baseFilteredRequests;
        return baseFilteredRequests.filter(
            (item) => normalizeStatusKey(item.status) === activeFilter,
        );
    }, [activeFilter, baseFilteredRequests]);

    const requestCounts = useMemo(() => {
        return baseFilteredRequests.reduce(
            (acc, item) => {
                const status = normalizeStatusKey(item.status);
                acc.all += 1;
                if (status === "pending") acc.pending += 1;
                if (status === "in_progress") acc.in_progress += 1;
                if (status === "completed") acc.completed += 1;
                return acc;
            },
            {
                all: 0,
                pending: 0,
                in_progress: 0,
                completed: 0,
            },
        );
    }, [baseFilteredRequests]);

    // Pagination calculations
    const totalPages = Math.ceil(filteredRequests.length / ITEMS_PER_PAGE);
    const paginatedRequests = useMemo(() => {
        const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIdx = startIdx + ITEMS_PER_PAGE;
        return filteredRequests.slice(startIdx, endIdx);
    }, [filteredRequests, currentPage]);
    const paginationItems = useMemo(
        () => getCompactPagination(currentPage, totalPages),
        [currentPage, totalPages],
    );

    const activePeriodLabel = useMemo(
        () => getPeriodLabel(periodFilter, customStartDate, customEndDate),
        [customEndDate, customStartDate, periodFilter],
    );
    const hasActiveAdvancedFilter =
        search.trim() !== "" ||
        activeFilter !== "all" ||
        periodFilter !== "all" ||
        (canFilterByTechnician && selectedTechnicianId !== "all");
    const filterSummary = useMemo(() => {
        const statusLabel =
            activeFilter === "all"
                ? "semua status"
                : FILTERS.find((item) => item.key === activeFilter)?.label ??
                  activeFilter;
        const periodLabel =
            periodFilter === "all"
                ? "semua periode"
                : activePeriodLabel.toLowerCase();
        const technicianLabel =
            canFilterByTechnician && selectedTechnicianName
                ? ` oleh ${selectedTechnicianName}`
                : "";

        return `Menampilkan ${filteredRequests.length} pekerjaan ${statusLabel} ${periodLabel}${technicianLabel}.`;
    }, [
        activeFilter,
        activePeriodLabel,
        canFilterByTechnician,
        filteredRequests.length,
        periodFilter,
        selectedTechnicianName,
    ]);

    const buildExportRows = useCallback(
        (items) =>
            items.map((item) => {
                const scopeSummary = getScopeSummaryMeta(
                    item.jobScope,
                    item.dynamicData,
                    item.roomLocation,
                );
                return {
                    "Nomor Pekerjaan": formatOrderId(item.id),
                    "Job ID": item.id ?? "-",
                    Tanggal: parseExcelDate(item.reportDate),
                    Status: getExportStatusLabel(item.status),
                    Customer: item.requester ?? "-",
                    "Project / Lokasi": scopeSummary.value ?? "-",
                    Alamat: item.address ?? "-",
                    Teknisi:
                        (item.technicianNames ?? []).join(", ") ||
                        item.assignee ||
                        "-",
                    "Jenis Pekerjaan / Scope": item.jobScope ?? "-",
                    "Brief Pekerjaan": item.jobBrief ?? "-",
                    "Keluhan / Trouble": item.troubleDescription ?? "-",
                    "Tindakan / Perbaikan": item.reconditionedParts ?? "-",
                    Sparepart: item.replacedParts ?? "-",
                    "Created At": parseExcelDate(item.createdAt),
                    "Completed At": parseExcelDate(item.completedAt),
                };
            }),
        [],
    );

    const handleResetFilters = () => {
        setSearch("");
        setActiveFilter("all");
        setPeriodFilter("all");
        setCustomStartDate("");
        setCustomEndDate("");
        setSelectedTechnicianId("all");
        setSearchParams({});
    };

    const handleExportExcel = async () => {
        if (filteredRequests.length === 0) {
            await showAlert("Tidak ada data untuk didownload.", {
                title: "Export",
            });
            return;
        }

        setExportLoading("excel");
        try {
            const ExcelJSModule = await import("exceljs");
            const ExcelJS = ExcelJSModule.default ?? ExcelJSModule;
            const rows = buildExportRows(filteredRequests);
            const headers = Object.keys(rows[0] ?? {});
            const summary = buildStatusSummary(filteredRequests);
            const statusLabel =
                activeFilter === "all"
                    ? "Semua Status"
                    : FILTERS.find((item) => item.key === activeFilter)?.label ??
                      activeFilter;
            const technicianLabel =
                canFilterByTechnician && selectedTechnicianName
                    ? selectedTechnicianName
                    : "Semua Teknisi";

            const workbook = new ExcelJS.Workbook();
            workbook.creator = "OneTrack";
            workbook.created = new Date();
            workbook.modified = new Date();

            const worksheet = workbook.addWorksheet("Laporan Pekerjaan", {
                views: [{ state: "frozen", ySplit: 8 }],
            });
            worksheet.properties.defaultRowHeight = 18;

            const lastColumnNumber = headers.length;
            const titleRow = worksheet.getRow(1);
            worksheet.mergeCells(1, 1, 1, lastColumnNumber);
            titleRow.getCell(1).value = "Laporan Pekerjaan OneTrack";
            titleRow.getCell(1).font = {
                bold: true,
                size: 18,
                color: { argb: "FF0F172A" },
            };
            titleRow.getCell(1).alignment = {
                horizontal: "center",
                vertical: "middle",
            };
            titleRow.height = 28;

            const filterRows = [
                ["Periode", activePeriodLabel],
                ["Status", statusLabel],
                ["Teknisi", technicianLabel],
                ["Tanggal Export", new Date()],
            ];
            filterRows.forEach(([label, value], index) => {
                const row = worksheet.getRow(index + 3);
                row.getCell(1).value = label;
                row.getCell(2).value = value;
                row.getCell(1).font = { bold: true, color: { argb: "FF334155" } };
                row.getCell(2).alignment = { vertical: "middle" };
                if (value instanceof Date) {
                    row.getCell(2).numFmt = "dd/mm/yyyy";
                }
            });

            const headerRowNumber = 8;
            const headerRow = worksheet.getRow(headerRowNumber);
            headers.forEach((header, index) => {
                const cell = headerRow.getCell(index + 1);
                cell.value = header;
                cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
                cell.fill = {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: "FF0284C7" },
                };
                cell.alignment = {
                    horizontal: "center",
                    vertical: "middle",
                    wrapText: true,
                };
                cell.border = {
                    top: { style: "thin", color: { argb: "FFCBD5E1" } },
                    left: { style: "thin", color: { argb: "FFCBD5E1" } },
                    bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
                    right: { style: "thin", color: { argb: "FFCBD5E1" } },
                };
            });
            headerRow.height = 24;

            rows.forEach((rowData, rowIndex) => {
                const row = worksheet.getRow(headerRowNumber + 1 + rowIndex);
                headers.forEach((header, columnIndex) => {
                    const cell = row.getCell(columnIndex + 1);
                    cell.value = rowData[header] ?? "-";
                    cell.alignment = {
                        vertical: "top",
                        wrapText: [
                            "Alamat",
                            "Keluhan / Trouble",
                            "Tindakan / Perbaikan",
                            "Sparepart",
                        ].includes(header),
                    };
                    cell.border = {
                        top: { style: "thin", color: { argb: "FFE2E8F0" } },
                        left: { style: "thin", color: { argb: "FFE2E8F0" } },
                        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
                        right: { style: "thin", color: { argb: "FFE2E8F0" } },
                    };
                    if (rowIndex % 2 === 1) {
                        cell.fill = {
                            type: "pattern",
                            pattern: "solid",
                            fgColor: { argb: "FFF8FAFC" },
                        };
                    }
                    if (["Tanggal", "Created At", "Completed At"].includes(header)) {
                        cell.numFmt = "dd/mm/yyyy";
                    }
                });
            });

            const dataEndRowNumber = headerRowNumber + rows.length;
            worksheet.autoFilter = {
                from: { row: headerRowNumber, column: 1 },
                to: { row: dataEndRowNumber, column: lastColumnNumber },
            };

            const summaryStartRow = dataEndRowNumber + 3;
            worksheet.mergeCells(summaryStartRow, 1, summaryStartRow, 2);
            const summaryTitle = worksheet.getRow(summaryStartRow).getCell(1);
            summaryTitle.value = "Ringkasan Status";
            summaryTitle.font = { bold: true, size: 13, color: { argb: "FF0F172A" } };

            [
                ["Total Pekerjaan", summary.total],
                ["Pending", summary.pending],
                ["In Progress", summary.in_progress],
                ["Completed", summary.completed],
                ["Cancelled", summary.cancelled],
            ].forEach(([label, value], index) => {
                const row = worksheet.getRow(summaryStartRow + 1 + index);
                row.getCell(1).value = label;
                row.getCell(2).value = value;
                row.getCell(1).font = { bold: true };
                [1, 2].forEach((column) => {
                    const cell = row.getCell(column);
                    cell.border = {
                        top: { style: "thin", color: { argb: "FFCBD5E1" } },
                        left: { style: "thin", color: { argb: "FFCBD5E1" } },
                        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
                        right: { style: "thin", color: { argb: "FFCBD5E1" } },
                    };
                    cell.alignment = { vertical: "middle" };
                });
            });

            worksheet.columns.forEach((column, index) => {
                const header = headers[index] ?? "";
                let maxLength = String(header).length;
                column.eachCell({ includeEmpty: true }, (cell) => {
                    const value = cell.value;
                    const text =
                        value instanceof Date
                            ? "dd/mm/yyyy"
                            : String(value?.text ?? value ?? "");
                    maxLength = Math.max(maxLength, text.length);
                });
                const isLongColumn = [
                    "Alamat",
                    "Keluhan / Trouble",
                    "Tindakan / Perbaikan",
                    "Sparepart",
                    "Project / Lokasi",
                ].includes(header);
                column.width = Math.min(
                    Math.max(maxLength + 2, isLongColumn ? 24 : 12),
                    isLongColumn ? 48 : 26,
                );
            });

            const buffer = await workbook.xlsx.writeBuffer();
            downloadBlob(
                new Blob([buffer], {
                    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                }),
                getReadableExportFileName({
                    period: periodFilter,
                    customStartDate,
                    customEndDate,
                    technicianName: selectedTechnicianName,
                }),
            );
        } catch (error) {
            console.error("Failed to export Excel:", error);
            await showAlert(
                "Gagal menyiapkan file Excel. Jika sedang memakai dev server, restart Vite lalu coba lagi.",
                { title: "Export Gagal" },
            );
        } finally {
            setExportLoading(null);
        }
    };

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [
        activeFilter,
        customEndDate,
        customStartDate,
        periodFilter,
        search,
        selectedTechnicianId,
    ]);

    useEffect(() => {
        const nextFilter = getValidFilter(searchParams.get("status") ?? "all");
        if (nextFilter !== activeFilter) {
            setActiveFilter(nextFilter);
        }
    }, [activeFilter, searchParams]);

    const selectedRequest = useMemo(
        () => requests.find((item) => item.id === selectedRequestId) ?? null,
        [requests, selectedRequestId],
    );
    const {
        technicians: selectedRequestTechnicians,
        loading: selectedRequestTechniciansLoading,
        reload: reloadSelectedRequestTechnicians,
    } = useJobTechnicians(selectedRequest?.id);
    const creatorTechnicianId = useMemo(() => {
        const creatorRow =
            selectedRequestTechnicians.find(
                (item) => item.role === "creator",
            ) ?? null;
        return (
            creatorRow?.technician_id ??
            selectedRequest?.technicianId ??
            ""
        );
    }, [selectedRequest?.technicianId, selectedRequestTechnicians]);
    const selectedRequestTechniciansForDisplay = useMemo(() => {
        if (selectedRequestTechnicians.length > 0) {
            return selectedRequestTechnicians;
        }

        if (!selectedRequest) return [];

        const fallbackTechnicianId = selectedRequest.technicianId;
        if (!fallbackTechnicianId) return [];

        const directoryProfile =
            technicianDirectory.find(
                (item) => String(item.id) === String(fallbackTechnicianId),
            ) ?? null;
        const fallbackProfile = directoryProfile;
        const profileName = getProfileDisplayName(fallbackProfile);
        const fallbackName =
            (profileName && profileName !== "-" ? profileName : "") ||
            selectedRequest.technicianName ||
            "Teknisi";

        return [
            {
                id: `fallback-creator-${fallbackTechnicianId}`,
                job_id: selectedRequest.id,
                technician_id: fallbackTechnicianId,
                role: "creator",
                technician: {
                    ...(fallbackProfile ?? {}),
                    id: fallbackTechnicianId,
                    email: fallbackProfile?.email ?? user?.email ?? null,
                },
                technician_name:
                    fallbackName && fallbackName !== "-"
                        ? fallbackName
                        : "Teknisi",
            },
        ];
    }, [
        selectedRequest,
        selectedRequestTechnicians,
        technicianDirectory,
    ]);
    const canManageTechnicians =
        role === "admin" ||
        role === "management" ||
        (Boolean(user?.id) && String(creatorTechnicianId) === String(user?.id));
    const currentTechnicianIsAssigned = useMemo(
        () =>
            Boolean(user?.id) &&
            selectedRequestTechnicians.some(
                (item) => String(item.technician_id) === String(user.id),
            ),
        [selectedRequestTechnicians, user?.id],
    );
    const selectedRequestNeedsClaim =
        role === "technician" &&
        Boolean(user?.id) &&
        Boolean(selectedRequest) &&
        !currentTechnicianIsAssigned &&
        ["pending", "requested"].includes(
            normalizeStatusKey(selectedRequest?.status),
        );
    const canEditSelectedRequest =
        role !== "technician" || !selectedRequestNeedsClaim;

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
        setBeforePhotoUrl(null);
        setProgressPhotoUrl(null);
        setAfterPhotoUrl(null);
        setPendingPhotoTypes({});
    }, [selectedRequest]);

    const closeDetail = () => {
        setSelectedRequestId(null);
        setSaving(false);
        setJobTechnicianModalOpen(false);
        setPhotoPreview({ open: false, url: "", label: "" });
        setBeforePhotoUrl(null);
        setProgressPhotoUrl(null);
        setAfterPhotoUrl(null);
        setPendingPhotoTypes({});
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
        }
    };

    const queueJobDraft = async ({ payload, action }) => {
        const queueItem = await createOfflineQueueItem({
            user_id: user.id,
            type: "job_action",
            entity_table: "requests",
            entity_id: selectedRequest.id,
            action,
            payload: {
                ...payload,
                request_id: selectedRequest.id,
                job_id: selectedRequest.id,
                old_status: selectedRequest.status,
                technician_id: user.id,
                timestamp: new Date().toISOString(),
            },
            attachments: [],
        });

        setRequests((current) => {
            const next = current.map((item) =>
                item.id === selectedRequest.id
                    ? {
                          ...item,
                          troubleDescription:
                              payload.trouble_description ??
                              item.troubleDescription,
                          replacedParts:
                              payload.replaced_parts ?? item.replacedParts,
                          reconditionedParts:
                              payload.reconditioned_parts ??
                              item.reconditionedParts,
                          serialNumber:
                              payload.serial_number ?? item.serialNumber,
                          status: payload.status ?? item.status,
                          localSyncStatus: "pending",
                      }
                    : item,
            );
            writeCachedRequests(user?.id, next);
            return next;
        });

        setBeforePhotoUrl(null);
        setProgressPhotoUrl(null);
        setAfterPhotoUrl(null);
        setPendingPhotoTypes({});

        await showAlert(
            "Data disimpan offline dan akan disinkronkan saat internet kembali.",
            { title: "Draft Offline" },
        );

        return queueItem;
    };

    const claimSelectedRequest = async () => {
        if (!selectedRequest || role !== "technician" || !user?.id) return;

        try {
            setSaving(true);
            await claimPendingRequestJob({
                jobId: selectedRequest.id,
                technicianId: user.id,
            });

            const technicianName =
                getNotificationName(user?.user_metadata?.full_name, user?.email) ||
                "Teknisi";
            const customerName =
                getNotificationName(selectedRequest.requester) || "customer";

            await notifyEvent(NOTIFICATION_EVENT_TYPES.JOB_TAKEN, {
                request_id: selectedRequest.id,
                technician_id: user.id,
                technician_name: technicianName,
                customer_id: selectedRequest.customerId,
                customer_name: customerName,
            });

            await loadRequests();
            await reloadSelectedRequestTechnicians();
            await showAlert(
                "Pekerjaan berhasil diambil. Anda sekarang bisa mengisi form pekerjaan.",
                { title: "Pekerjaan Diambil" },
            );
        } catch (error) {
            console.error("Error claiming request:", error);
            await showAlert(
                error?.message ??
                    "Gagal mengambil pekerjaan. Pastikan Anda di-assign ke customer ini.",
                { title: "Gagal" },
            );
        } finally {
            setSaving(false);
        }
    };

    const saveChanges = async () => {
        if (!selectedRequest) return;

        if (selectedRequestNeedsClaim) {
            await showAlert(
                "Ambil pekerjaan ini terlebih dahulu sebelum mengisi form pekerjaan.",
                { title: "Ambil Pekerjaan" },
            );
            return;
        }

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
            beforePhotoUrl ||
            progressPhotoUrl ||
            afterPhotoUrl ||
            pendingPhotoTypes.before ||
            pendingPhotoTypes.progress ||
            pendingPhotoTypes.after;

        if (!hasRepairNoteChanges && !hasNewPhotos) {
            await showAlert("Tidak ada perubahan yang disimpan.", {
                title: "Informasi",
            });
            return;
        }

        let payloadForOffline = null;

        try {
            setSaving(true);

            const payload = {
                trouble_description: nextTrouble,
                replaced_parts: nextReplaced,
                reconditioned_parts: nextReconditioned,
                serial_number: nextSerial,
                updated_at: new Date().toISOString(),
            };

            // Add photo URLs if uploaded
            if (beforePhotoUrl) payload.before_photo_url = beforePhotoUrl;
            if (progressPhotoUrl) payload.progress_photo_url = progressPhotoUrl;
            if (afterPhotoUrl) payload.after_photo_url = afterPhotoUrl;

            // Determine status automatically based on photos
            // Check current photos + newly uploaded ones
            const hasBefore =
                beforePhotoUrl ||
                pendingPhotoTypes.before ||
                selectedRequest.beforePhotoUrl;
            const hasProgress =
                progressPhotoUrl ||
                pendingPhotoTypes.progress ||
                selectedRequest.progressPhotoUrl;
            const hasAfter =
                afterPhotoUrl ||
                pendingPhotoTypes.after ||
                selectedRequest.afterPhotoUrl;

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
                payload.status = "requested";
            } else {
                // Keep current status if no photos
                payload.status = selectedRequest.status;
            }

            payloadForOffline = payload;

            if (!isOnline && role === "technician") {
                await queueJobDraft({
                    payload,
                    action:
                        payload.status === "completed"
                            ? "submit_job_completion"
                            : "update_job_progress",
                });
                return;
            }

            const technicianAlreadyAssigned =
                role === "technician" &&
                user?.id &&
                selectedRequestTechnicians.some(
                    (item) => String(item.technician_id) === String(user.id),
                );

            if (role === "technician" && user?.id && !technicianAlreadyAssigned) {
                await claimPendingRequestJob({
                    jobId: selectedRequest.id,
                    technicianId: user.id,
                });
            }

            const { error } = await supabase
                .from("requests")
                .update(payload)
                .eq("id", selectedRequest.id);

            if (error) throw error;

            if (role === "technician" && user?.id) {
                const currentTechnician = selectedRequestTechnicians.find(
                    (item) => String(item.technician_id) === String(user.id),
                );
                const technicianName =
                    getNotificationName(
                        currentTechnician?.technician_name,
                        selectedRequest.technicianName,
                    ) ||
                    getNotificationName(user?.user_metadata?.full_name, user?.email) ||
                    "Teknisi";
                const customerName =
                    getNotificationName(selectedRequest.requester) ||
                    "customer";

                if (technicianAlreadyAssigned) {
                    await syncJobTechnicians({
                        jobId: selectedRequest.id,
                        creatorId: creatorTechnicianId || user.id,
                        technicianIds: [
                            ...selectedRequestTechnicians
                                .filter((item) => item.role !== "creator")
                                .map((item) => item.technician_id),
                            user.id,
                        ],
                        addedBy: user.id,
                    });
                }

                if (!technicianAlreadyAssigned) {
                    await notifyEvent(NOTIFICATION_EVENT_TYPES.JOB_TAKEN, {
                        request_id: selectedRequest.id,
                        technician_id: user.id,
                        technician_name: technicianName,
                        customer_id: selectedRequest.customerId,
                        customer_name: customerName,
                    });
                }

                if (payload.status !== selectedRequest.status) {
                    await notifyEvent(
                        NOTIFICATION_EVENT_TYPES.JOB_STATUS_CHANGED,
                        {
                            request_id: selectedRequest.id,
                            status: payload.status,
                            previous_status: selectedRequest.status,
                            technician_id: user.id,
                            technician_name: technicianName,
                            customer_id: selectedRequest.customerId,
                            customer_name: customerName,
                        },
                    );
                }
            }

            await loadRequests();
            await reloadSelectedRequestTechnicians();
            setBeforePhotoUrl(null);
            setProgressPhotoUrl(null);
            setAfterPhotoUrl(null);
            setPendingPhotoTypes({});

            await showAlert("Perubahan berhasil disimpan.", {
                title: "Sukses",
            });
        } catch (error) {
            console.error("Error saving changes:", error);
            if (
                role === "technician" &&
                payloadForOffline &&
                isNetworkFailure(error)
            ) {
                await queueJobDraft({
                    payload: payloadForOffline,
                    action:
                        payloadForOffline.status === "completed"
                            ? "submit_job_completion"
                            : "update_job_progress",
                });
                return;
            }
            await showAlert("Gagal menyimpan perubahan.", { title: "Error" });
        } finally {
            setSaving(false);
        }
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
                        <div>
                            <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">
                                Daftar Pekerjaan
                            </h1>
                            {!isOnline && (
                                <p className="mt-1 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                                    Data Offline
                                </p>
                            )}
                        </div>
                    </div>

                    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:mt-6 md:p-5">
                        <label className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500 md:px-4 md:py-3">
                            <Search size={16} />
                            <input
                                type="text"
                                value={search}
                                onChange={(event) =>
                                    setSearch(event.target.value)
                                }
                                placeholder="Cari teknisi, customer, alamat, lokasi, atau nomor pekerjaan..."
                                className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 md:text-base"
                            />
                        </label>

                        <div className="mt-4 grid gap-3 lg:grid-cols-[auto_220px_220px] lg:items-end">
                            <div>
                                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Status
                                </p>
                                <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-1 md:inline-flex md:grid-cols-none md:gap-0 md:rounded-full">
                                    {FILTERS.map((filter) => (
                                        <button
                                            key={filter.key}
                                            type="button"
                                            onClick={() => {
                                                setActiveFilter(filter.key);
                                                if (filter.key === "all") {
                                                    setSearchParams({});
                                                    return;
                                                }
                                                setSearchParams({
                                                    status: filter.key,
                                                });
                                            }}
                                            className={`cursor-pointer rounded-xl px-3 py-2 text-xs transition md:rounded-full md:px-5 md:text-sm ${
                                                activeFilter === filter.key
                                                    ? "bg-sky-500 font-semibold text-white"
                                                    : "font-medium text-slate-600 hover:bg-slate-100"
                                            }`}
                                        >
                                            <span className="inline-flex items-center gap-2">
                                                <span>{filter.label}</span>
                                                <span
                                                    className={`inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                                        activeFilter ===
                                                        filter.key
                                                            ? "bg-white/20 text-white"
                                                            : "bg-slate-200 text-slate-700"
                                                    }`}
                                                >
                                                    {requestCounts[
                                                        filter.key
                                                    ] ?? 0}
                                                </span>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <label className="block">
                                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Periode
                                </span>
                                <CustomSelect
                                    value={periodFilter}
                                    onChange={setPeriodFilter}
                                    options={PERIOD_OPTIONS}
                                />
                            </label>

                            {canFilterByTechnician && (
                                <label className="block">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        Teknisi
                                    </span>
                                    <CustomSelect
                                        value={selectedTechnicianId}
                                        onChange={setSelectedTechnicianId}
                                        options={technicianOptions}
                                    />
                                </label>
                            )}
                        </div>

                        {periodFilter === "custom" && (
                            <div className="mt-3 grid gap-3 md:grid-cols-2 lg:max-w-xl">
                                <label className="block">
                                    <span className="text-xs font-medium text-slate-600">
                                        Start Date
                                    </span>
                                    <input
                                        type="date"
                                        value={customStartDate}
                                        onChange={(event) =>
                                            setCustomStartDate(
                                                event.target.value,
                                            )
                                        }
                                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-300 focus:bg-white"
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-xs font-medium text-slate-600">
                                        End Date
                                    </span>
                                    <input
                                        type="date"
                                        value={customEndDate}
                                        onChange={(event) =>
                                            setCustomEndDate(
                                                event.target.value,
                                            )
                                        }
                                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-300 focus:bg-white"
                                    />
                                </label>
                            </div>
                        )}

                        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 md:flex-row md:items-center md:justify-between">
                            <p className="text-sm text-slate-600">
                                {filterSummary}
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={handleResetFilters}
                                    disabled={!hasActiveAdvancedFilter}
                                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <RotateCcw size={15} />
                                    Reset Filter
                                </button>
                                <button
                                    type="button"
                                    onClick={handleExportExcel}
                                    disabled={Boolean(exportLoading)}
                                    className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <FileSpreadsheet size={15} />
                                    {exportLoading === "excel"
                                        ? "Menyiapkan file..."
                                        : "Download Excel"}
                                </button>
                            </div>
                        </div>

                    </section>

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
                                    {!isOnline
                                        ? "Data ini belum tersedia offline. Buka data saat online terlebih dahulu."
                                        : hasActiveAdvancedFilter
                                          ? "Tidak ada pekerjaan yang sesuai dengan filter."
                                          : "Belum ada data pekerjaan"}
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
                                            {(() => {
                                                const scopeSummary =
                                                    getScopeSummaryMeta(
                                                        item.jobScope,
                                                        item.dynamicData,
                                                        item.roomLocation,
                                                    );
                                                return (
                                                    <>
                                                        <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
                                                            <div className="min-w-0">
                                                                <h2 className="wrap-break-word text-lg font-semibold text-slate-900  md:text-xl">
                                                                    {item.title}
                                                                </h2>
                                                                <p className="mt-1 break-all text-xs text-slate-500">
                                                                    Order ID:{" "}
                                                                    <span
                                                                        title={
                                                                            item.id ??
                                                                            "-"
                                                                        }
                                                                    >
                                                                        {formatOrderId(
                                                                            item.id,
                                                                        )}
                                                                    </span>
                                                                </p>
                                                                <p className="mt-2 flex items-start gap-2 wrap-break-word text-sm text-slate-500 md:text-base">
                                                                    <MapPin
                                                                        size={
                                                                            16
                                                                        }
                                                                    />
                                                                    <span>
                                                                        {
                                                                            item.address
                                                                        }
                                                                    </span>
                                                                </p>
                                                                <p className="mt-1 text-xs text-slate-500">
                                                                    {
                                                                        scopeSummary.label
                                                                    }
                                                                    :{" "}
                                                                    {previewText(
                                                                        scopeSummary.value,
                                                                        48,
                                                                    )}
                                                                </p>
                                                                <p className="mt-1 text-xs text-slate-500">
                                                                    Brief:{" "}
                                                                    {previewText(
                                                                        item.jobBrief,
                                                                    )}
                                                                </p>
                                                            </div>

                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span
                                                                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                                                        STATUS_STYLES[
                                                                            normalizeStatusKey(
                                                                                item.status,
                                                                            )
                                                                        ] ??
                                                                        STATUS_STYLES.pending
                                                                    }`}
                                                                >
                                                                    {STATUS_LABELS[
                                                                        normalizeStatusKey(
                                                                            item.status,
                                                                        )
                                                                    ] ?? "PENDING"}
                                                                </span>
                                                                {item.localSyncStatus ===
                                                                    "pending" && (
                                                                    <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                                                                        Menunggu
                                                                        Sync
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </>
                                                );
                                            })()}

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
                            <div className="mt-6 flex items-center justify-center sm:justify-between">
                                <div className="hidden text-sm text-slate-600 sm:block">
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

                                <div className="flex max-w-full items-center gap-1 sm:gap-2">
                                    <button
                                        onClick={() =>
                                            setCurrentPage((p) =>
                                                Math.max(1, p - 1),
                                            )
                                        }
                                        disabled={currentPage === 1}
                                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white p-1.5 text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-50 sm:h-auto sm:w-auto sm:p-2"
                                        title="Previous page"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>

                                    <div className="flex max-w-full flex-nowrap justify-center gap-1 overflow-hidden">
                                        {paginationItems.map((item) =>
                                            typeof item === "number" ? (
                                                <button
                                                    key={item}
                                                    onClick={() =>
                                                        setCurrentPage(item)
                                                    }
                                                    className={`inline-flex h-8 min-w-7 shrink-0 items-center justify-center rounded-lg px-1.5 py-1.5 text-xs font-medium transition sm:h-auto sm:min-w-10 sm:px-3 sm:py-2 sm:text-sm ${
                                                        currentPage === item
                                                            ? "bg-sky-500 text-white"
                                                            : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                                    }`}
                                                >
                                                    {item}
                                                </button>
                                            ) : (
                                                <span
                                                    key={item}
                                                    className="inline-flex h-8 min-w-5 shrink-0 items-center justify-center px-0.5 text-xs font-semibold text-slate-400 sm:min-w-8 sm:px-1 sm:text-sm"
                                                >
                                                    ...
                                                </span>
                                            ),
                                        )}
                                    </div>

                                    <button
                                        onClick={() =>
                                            setCurrentPage((p) =>
                                                Math.min(totalPages, p + 1),
                                            )
                                        }
                                        disabled={currentPage === totalPages}
                                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white p-1.5 text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-50 sm:h-auto sm:w-auto sm:p-2"
                                        title="Next page"
                                    >
                                        <ChevronRight size={16} />
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
                                {(role === "admin" || role === "management") && (
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
                                <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                                    <span className="font-semibold">
                                        Brief:
                                    </span>{" "}
                                    {selectedRequest.jobBrief}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 p-4 flex flex-col items-start gap-2">
                                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    <ShieldCheck size={14} />
                                    Status
                                </p>
                                <div className="mt-3 inline-flex rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 bg-slate-50">
                                    {STATUS_LABELS[
                                        normalizeStatusKey(
                                            selectedRequest.status,
                                        )
                                    ] ?? "PENDING"}
                                </div>
                                {selectedRequest.localSyncStatus ===
                                    "pending" && (
                                    <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                                        Menunggu Sync
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 p-4">
                                <ScopeDetailsCard
                                    jobScope={selectedRequest.jobScope}
                                    dynamicData={selectedRequest.dynamicData}
                                    acDetails={{
                                        brand: selectedRequest.acBrand,
                                        type: selectedRequest.acType,
                                        capacity: selectedRequest.acCapacityPk,
                                        roomLocation:
                                            selectedRequest.roomLocation,
                                        serialNumber:
                                            selectedRequest.serialNumber,
                                    }}
                                />
                                <div className="mt-4 border-t border-slate-200 pt-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                <Users size={14} />
                                                Teknisi Terlibat
                                            </p>
                                            <p className="mt-1 text-xs text-slate-500">
                                                Pembuat job diberi badge khusus.
                                            </p>
                                        </div>
                                        {canManageTechnicians && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setJobTechnicianModalOpen(
                                                        true,
                                                    )
                                                }
                                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                            >
                                                Kelola Teknisi
                                            </button>
                                        )}
                                    </div>

                                    <div className="mt-3 space-y-2">
                                        {selectedRequestTechniciansLoading ? (
                                            <p className="text-sm text-slate-500">
                                                Memuat teknisi...
                                            </p>
                                        ) : selectedRequestTechniciansForDisplay.length >
                                          0 ? (
                                            selectedRequestTechniciansForDisplay.map(
                                                (item) => {
                                                    const isCreator =
                                                        item.role === "creator";
                                                    return (
                                                        <div
                                                            key={item.id}
                                                            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                                                        >
                                                            <div className="min-w-0">
                                                                <p className="truncate text-sm font-medium text-slate-800">
                                                                    {
                                                                        item.technician_name
                                                                    }
                                                                </p>
                                                                <p className="truncate text-xs text-slate-500">
                                                                    {item
                                                                        .technician
                                                                        ?.email ??
                                                                        "-"}
                                                                </p>
                                                            </div>
                                                            <div className="flex shrink-0 items-center gap-2">
                                                                {isCreator && (
                                                                    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                                                        Pembuat
                                                                    </span>
                                                                )}
                                                                {!isCreator &&
                                                                    canManageTechnicians && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={async () => {
                                                                                try {
                                                                                    await syncJobTechnicians(
                                                                                        {
                                                                                            jobId: selectedRequest.id,
                                                                                            creatorId:
                                                                                                creatorTechnicianId ||
                                                                                                (role ===
                                                                                                "technician"
                                                                                                    ? user?.id
                                                                                                    : null) ||
                                                                                                item.technician_id,
                                                                                            technicianIds:
                                                                                                selectedRequestTechnicians
                                                                                                    .filter(
                                                                                                        (
                                                                                                            row,
                                                                                                        ) =>
                                                                                                            row.role !==
                                                                                                            "creator",
                                                                                                    )
                                                                                                    .map(
                                                                                                        (
                                                                                                            row,
                                                                                                        ) =>
                                                                                                            row.technician_id,
                                                                                                    )
                                                                                                    .filter(
                                                                                                        (
                                                                                                            id,
                                                                                                        ) =>
                                                                                                            id !==
                                                                                                            item.technician_id,
                                                                                                    ),
                                                                                            addedBy:
                                                                                                user?.id ??
                                                                                                null,
                                                                                        },
                                                                                    );
                                                                                    await reloadSelectedRequestTechnicians();
                                                                                } catch (error) {
                                                                                    console.error(
                                                                                        "Failed to remove technician:",
                                                                                        error,
                                                                                    );
                                                                                    await showAlert(
                                                                                        error?.message ??
                                                                                            "Gagal menghapus teknisi.",
                                                                                        {
                                                                                            title: "Gagal",
                                                                                        },
                                                                                    );
                                                                                }
                                                                            }}
                                                                            className="rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                                                                        >
                                                                            Hapus
                                                                        </button>
                                                                    )}
                                                            </div>
                                                        </div>
                                                    );
                                                },
                                            )
                                        ) : (
                                            <p className="text-sm text-slate-500">
                                                Belum ada teknisi terlibat.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 p-4">
                                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    <CheckCircle2 size={14} />
                                    Detail Perbaikan
                                </p>
                                {selectedRequestNeedsClaim ? (
                                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                                        <p className="text-sm font-semibold text-amber-800">
                                            Pekerjaan ini belum diambil.
                                        </p>
                                        <p className="mt-1 text-sm text-amber-700">
                                            Ambil pekerjaan terlebih dahulu untuk
                                            mulai mengisi form pekerjaan dan
                                            menambahkan teknisi terlibat.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={claimSelectedRequest}
                                            disabled={saving}
                                            className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {saving
                                                ? "Mengambil Pekerjaan..."
                                                : "Ambil Pekerjaan"}
                                        </button>
                                    </div>
                                ) : role === "technician" ? (
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

                            {selectedRequest.status !== "completed" &&
                                canEditSelectedRequest && (
                                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                                    <div>
                                        <label className="mb-2 block text-sm font-medium text-slate-700">
                                            Foto Before
                                        </label>
                                        <PhotoUploadInput
                                            folderName="before"
                                            photoType="before"
                                            entityId={selectedRequest.id}
                                            supabaseClient={supabase}
                                            onPhotoSelected={() => {}}
                                            onUploadSuccess={async (
                                                metadata,
                                                photoUrl,
                                            ) => {
                                                setBeforePhotoUrl(photoUrl);
                                            }}
                                            onUploadQueued={() => {
                                                setPendingPhotoTypes((prev) => ({
                                                    ...prev,
                                                    before: true,
                                                }));
                                            }}
                                            showQueuedStatus={false}
                                        />
                                        {(beforePhotoUrl ||
                                            pendingPhotoTypes.before) && (
                                            <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                                                <p className="text-xs text-emerald-700">
                                                    {pendingPhotoTypes.before
                                                        ? "Menunggu sinkronisasi"
                                                        : "Foto terpilih"}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-sm font-medium text-slate-700">
                                            Foto Progress
                                        </label>
                                        <PhotoUploadInput
                                            folderName="progress"
                                            photoType="progress"
                                            entityId={selectedRequest.id}
                                            supabaseClient={supabase}
                                            onPhotoSelected={() => {}}
                                            onUploadSuccess={async (
                                                metadata,
                                                photoUrl,
                                            ) => {
                                                setProgressPhotoUrl(photoUrl);
                                            }}
                                            onUploadQueued={() => {
                                                setPendingPhotoTypes((prev) => ({
                                                    ...prev,
                                                    progress: true,
                                                }));
                                            }}
                                            showQueuedStatus={false}
                                        />
                                        {(progressPhotoUrl ||
                                            pendingPhotoTypes.progress) && (
                                            <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                                                <p className="text-xs text-emerald-700">
                                                    {pendingPhotoTypes.progress
                                                        ? "Menunggu sinkronisasi"
                                                        : "Foto terpilih"}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-sm font-medium text-slate-700">
                                            Foto After
                                        </label>
                                        <PhotoUploadInput
                                            folderName="after"
                                            photoType="after"
                                            entityId={selectedRequest.id}
                                            supabaseClient={supabase}
                                            onPhotoSelected={() => {}}
                                            onUploadSuccess={async (
                                                metadata,
                                                photoUrl,
                                            ) => {
                                                setAfterPhotoUrl(photoUrl);
                                            }}
                                            onUploadQueued={() => {
                                                setPendingPhotoTypes((prev) => ({
                                                    ...prev,
                                                    after: true,
                                                }));
                                            }}
                                            showQueuedStatus={false}
                                        />
                                        {(afterPhotoUrl ||
                                            pendingPhotoTypes.after) && (
                                            <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                                                <p className="text-xs text-emerald-700">
                                                    {pendingPhotoTypes.after
                                                        ? "Menunggu sinkronisasi"
                                                        : "Foto terpilih"}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {canEditSelectedRequest && (
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
                            )}
                        </div>
                    </div>
                </div>
            )}

            <JobTechnicianManagerModal
                isOpen={jobTechnicianModalOpen}
                title={`Kelola Teknisi - ${selectedRequest?.title ?? "Job"}`}
                technicians={technicianDirectory}
                selectedTechnicianIds={selectedRequestTechnicians
                    .filter((item) => item.role !== "creator")
                    .map((item) => item.technician_id)}
                creatorTechnicianId={creatorTechnicianId || null}
                creatorLabel="Pembuat"
                saving={saving}
                onClose={() => setJobTechnicianModalOpen(false)}
                onSave={async (nextIds) => {
                    if (!selectedRequest?.id) return;
                    try {
                        await syncJobTechnicians({
                            jobId: selectedRequest.id,
                            creatorId:
                                creatorTechnicianId ||
                                (role === "technician" ? user?.id : null) ||
                                nextIds[0] ||
                                null,
                            technicianIds: nextIds,
                            addedBy: user?.id ?? null,
                        });
                        await reloadSelectedRequestTechnicians();
                        await loadRequests();
                        setJobTechnicianModalOpen(false);
                    } catch (error) {
                        console.error("Failed to sync job technicians:", error);
                        await showAlert(
                            error?.message ?? "Gagal menyimpan teknisi.",
                            { title: "Gagal" },
                        );
                    }
                }}
            />

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
