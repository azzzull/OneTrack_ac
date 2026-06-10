import { useEffect, useMemo, useRef, useState } from "react";
import {
    CircleCheckBig,
    ClipboardList,
    ClipboardPlus,
    Clock3,
    FilePenLine,
    Plus,
    Wallet,
    Wrench,
} from "lucide-react";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import AttendanceDashboardSimple from "../../components/AttendanceDashboardSimple";
import OperationalDashboard from "../../components/dashboard/OperationalDashboard";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import { useAuth } from "../../context/useAuth";
import supabase from "../../supabaseClient";
import { createUniqueChannelName } from "../../utils/realtimeChannelManager";
import { getTechnicianJobIds } from "../../services/jobTechniciansService";
import { buildStatusSegments } from "../../utils/dashboardStatus";

const normalizeStatusKey = (value) => {
    const raw = String(value ?? "")
        .trim()
        .toLowerCase()
        .replaceAll("-", "_")
        .replaceAll(" ", "_");
    if (raw === "inprogress") return "in_progress";
    if (raw === "in_progress" || raw === "on_progress") return "in_progress";
    if (raw === "completed" || raw === "done" || raw === "selesai") return "completed";
    if (raw === "cancelled" || raw === "canceled" || raw === "rejected")
        return "cancelled";
    if (raw === "requested") return "pending";
    if (raw === "pending" || raw === "") return "pending";
    return "pending";
};

const normalizeAccommodationStatus = (value) => {
    const raw = String(value ?? "")
        .trim()
        .toLowerCase()
        .replaceAll("-", "_")
        .replaceAll(" ", "_");
    if (["rejected", "ditolak"].includes(raw)) return "rejected";
    if (["realized", "realisasi", "fully_realized"].includes(raw))
        return "approved";
    if (
        [
            "approved",
            "disetujui",
            "paid",
            "unrealized",
            "belum_realisasi",
            "not_realized",
            "realization_process",
            "partial_realized",
            "partial_realize",
            "partially_realized",
        ].includes(raw)
    ) {
        return "unrealized";
    }
    return "active";
};

const toDateKey = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const formatRelativeTime = (value) => {
    if (!value) return "Baru saja";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Baru saja";
    return date.toLocaleString("id-ID", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
};

export default function TechnicianDashboard() {
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const { user, profile, loading: authLoading } = useAuth();
    const [tasks, setTasks] = useState([]);
    const [availableJobs, setAvailableJobs] = useState(0);
    const [accommodations, setAccommodations] = useState([]);
    const [hoveredStatus, setHoveredStatus] = useState(null);
    const [hoveredDayKey, setHoveredDayKey] = useState(null);
    const channelRef = useRef(null);
    const isMountedRef = useRef(true);
    const userIdRef = useRef(user?.id);
    const authLoadingRef = useRef(authLoading);

    useEffect(() => {
        userIdRef.current = user?.id;
    }, [user?.id]);

    useEffect(() => {
        authLoadingRef.current = authLoading;
    }, [authLoading]);

    const loadTasks = async () => {
        if (!userIdRef.current) return;

        try {
            const jobIds = await getTechnicianJobIds(userIdRef.current);
            if (jobIds.length === 0) {
                if (isMountedRef.current) setTasks([]);
            } else {
                const { data, error } = await supabase
                    .from("requests")
                    .select("*")
                    .in("id", jobIds)
                    .order("created_at", { ascending: false });

                if (error) throw error;
                if (isMountedRef.current) setTasks(data ?? []);
            }

            const { count, error: availableError } = await supabase
                .from("requests")
                .select("id", { count: "exact", head: true })
                .in("status", ["pending", "requested"]);

            if (availableError) throw availableError;
            if (isMountedRef.current) setAvailableJobs(count ?? 0);
        } catch (error) {
            console.error("Error loading technician dashboard data:", error);
            if (isMountedRef.current) {
                setTasks([]);
                setAvailableJobs(0);
            }
        }
    };

    const loadAccommodations = async () => {
        if (!userIdRef.current) return;
        try {
            const { data, error } = await supabase
                .from("accommodation_requests")
                .select("*")
                .eq("technician_id", userIdRef.current)
                .order("created_at", { ascending: false })
                .limit(50);

            if (error) throw error;
            if (isMountedRef.current) setAccommodations(data ?? []);
        } catch (error) {
            console.warn("Technician accommodation summary skipped:", error.message);
            if (isMountedRef.current) setAccommodations([]);
        }
    };

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (authLoadingRef.current || !userIdRef.current) return;

        const timerId = setTimeout(() => {
            loadTasks();
            loadAccommodations();
        }, 0);

        const setupChannel = async () => {
            const channelName = createUniqueChannelName(
                "technician-dashboard",
                userIdRef.current,
            );
            const existing = supabase
                .getChannels()
                .find((ch) => ch.topic === `realtime:${channelName}`);

            if (existing) {
                channelRef.current = existing;
                return;
            }

            channelRef.current = supabase
                .channel(channelName)
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "requests" },
                    () => {
                        if (isMountedRef.current) loadTasks();
                    },
                )
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "job_technicians" },
                    () => {
                        if (isMountedRef.current) loadTasks();
                    },
                )
                .on(
                    "postgres_changes",
                    {
                        event: "*",
                        schema: "public",
                        table: "accommodation_requests",
                    },
                    () => {
                        if (isMountedRef.current) loadAccommodations();
                    },
                );

            const { error } = await channelRef.current.subscribe();
            if (error) console.error("[TechDashboard] Subscribe error:", error);
        };

        setupChannel();

        return () => {
            clearTimeout(timerId);
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [user?.id]);

    const statusCounts = useMemo(() => {
        const counts = { pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
        for (const row of tasks) {
            counts[normalizeStatusKey(row.status)] += 1;
        }
        return counts;
    }, [tasks]);

    const accommodationCounts = useMemo(() => {
        const counts = { active: 0, approved: 0, unrealized: 0, rejected: 0 };
        for (const row of accommodations) {
            counts[normalizeAccommodationStatus(row.status)] += 1;
        }
        return counts;
    }, [accommodations]);

    const totalTasks = tasks.length;
    const completionRate = totalTasks
        ? Math.round((statusCounts.completed / totalTasks) * 100)
        : 0;
    const activeAttention = availableJobs + statusCounts.pending + statusCounts.in_progress;

    const kpis = [
        {
            label: "Job Tersedia",
            value: availableJobs,
            meta: "Siap diambil",
            icon: ClipboardList,
            tone: "amber",
        },
        {
            label: "Job Saya",
            value: totalTasks,
            meta: `${statusCounts.pending + statusCounts.in_progress} aktif`,
            icon: ClipboardPlus,
            tone: "sky",
        },
        {
            label: "Dalam Progress",
            value: statusCounts.in_progress,
            meta: totalTasks ? `${Math.round((statusCounts.in_progress / totalTasks) * 100)}% dari job saya` : "0%",
            icon: Wrench,
            tone: "sky",
        },
        {
            label: "Selesai",
            value: statusCounts.completed,
            meta: `${completionRate}% selesai`,
            icon: CircleCheckBig,
            tone: "emerald",
        },
    ];

    const quickActions = [
        { label: "Ambil Job", to: "/technician/requests", icon: ClipboardList },
        { label: "Buat Job Baru", to: "/jobs/new", icon: Plus },
        { label: "Ajukan Akomodasi", to: "/accommodation", icon: Wallet },
        { label: "Draft Offline", to: "/jobs/new", icon: FilePenLine },
    ];

    const last7Days = useMemo(() => {
        const byDate = {};
        for (let i = 6; i >= 0; i -= 1) {
            const date = new Date();
            date.setHours(0, 0, 0, 0);
            date.setDate(date.getDate() - i);
            const key = toDateKey(date);
            byDate[key] = {
                key,
                label: date.toLocaleDateString("id-ID", { weekday: "short" }),
                count: 0,
            };
        }

        for (const row of tasks) {
            const key = toDateKey(row.updated_at ?? row.created_at);
            if (byDate[key]) byDate[key].count += 1;
        }

        return Object.values(byDate);
    }, [tasks]);

    const recentActivities = useMemo(() => {
        const jobItems = tasks.slice(0, 10).map((row) => ({
            id: row.id,
            type: "job",
            time: row.updated_at ?? row.created_at,
            timeLabel: formatRelativeTime(row.updated_at ?? row.created_at),
            text: `Anda memperbarui pekerjaan ${row.title ?? `#${row.id}`}`,
        }));
        const accommodationItems = accommodations.slice(0, 10).map((row) => ({
            id: row.id,
            type: "accommodation",
            time: row.updated_at ?? row.created_at,
            timeLabel: formatRelativeTime(row.updated_at ?? row.created_at),
            text: `Anda mengajukan akomodasi ${row.request_title ?? ""}`.trim(),
        }));

        return [...jobItems, ...accommodationItems]
            .sort((a, b) => new Date(b.time ?? 0) - new Date(a.time ?? 0))
            .slice(0, 10);
    }, [tasks, accommodations]);

    return (
        <div className="min-h-screen bg-sky-50">
            <div className="flex min-h-screen">
                <Sidebar
                    collapsed={sidebarCollapsed}
                    onToggle={toggleSidebar}
                />

                <main className="min-w-0 flex-1 p-4 pb-24 md:p-8 md:pb-8">
                    <OperationalDashboard
                        user={user}
                        profile={profile}
                        attentionCount={activeAttention}
                        attendance={
                            <AttendanceDashboardSimple
                                technicianId={user?.id}
                                onDataChange={() => {}}
                            />
                        }
                        kpis={kpis}
                        quickActions={quickActions}
                        completedCount={statusCounts.completed}
                        totalCount={totalTasks}
                        statusSegments={buildStatusSegments(statusCounts)}
                        activityDays={last7Days}
                        accommodationItems={[
                            {
                                label: "Pengajuan Aktif",
                                value: accommodationCounts.active,
                            },
                            { label: "Disetujui", value: accommodationCounts.approved },
                            {
                                label: "Belum Realisasi",
                                value: accommodationCounts.unrealized,
                            },
                            { label: "Ditolak", value: accommodationCounts.rejected },
                        ]}
                        recentActivities={recentActivities}
                        hoveredStatus={hoveredStatus}
                        onHoverStatus={setHoveredStatus}
                        hoveredDayKey={hoveredDayKey}
                        onHoverDay={setHoveredDayKey}
                    />
                </main>
            </div>

            <MobileBottomNav />
        </div>
    );
}
