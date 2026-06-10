import { useMemo, useState } from "react";
import {
    CircleCheckBig,
    ClipboardList,
    Clock3,
    History,
    Plus,
    SearchCheck,
    Wrench,
} from "lucide-react";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import OperationalDashboard from "../../components/dashboard/OperationalDashboard";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import { useAuth } from "../../context/useAuth";
import useCustomerRequests from "../../hooks/useCustomerRequests";
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

export default function CustomerDashboard() {
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const { user, profile } = useAuth();
    const { requests } = useCustomerRequests(user);
    const [hoveredStatus, setHoveredStatus] = useState(null);
    const [hoveredDayKey, setHoveredDayKey] = useState(null);

    const statusCounts = useMemo(() => {
        const counts = { pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
        for (const row of requests) {
            counts[normalizeStatusKey(row.status)] += 1;
        }
        return counts;
    }, [requests]);

    const totalRequests = requests.length;
    const activeRequests = statusCounts.pending + statusCounts.in_progress;
    const completionRate = totalRequests
        ? Math.round((statusCounts.completed / totalRequests) * 100)
        : 0;

    const kpis = [
        {
            label: "Request Aktif",
            value: activeRequests,
            meta: `${totalRequests} total request`,
            icon: ClipboardList,
            tone: "sky",
        },
        {
            label: "Menunggu Teknisi",
            value: statusCounts.pending,
            meta: totalRequests ? `${Math.round((statusCounts.pending / totalRequests) * 100)}% dari total` : "0%",
            icon: Clock3,
            tone: "amber",
        },
        {
            label: "Sedang Dikerjakan",
            value: statusCounts.in_progress,
            meta: "Dalam penanganan",
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
        { label: "Buat Request", to: "/customer/request", icon: Plus },
        { label: "Lihat Progress", to: "/services", icon: SearchCheck },
        { label: "Riwayat Pekerjaan", to: "/services", icon: History },
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

        for (const row of requests) {
            const key = toDateKey(row.updated_at ?? row.created_at);
            if (byDate[key]) byDate[key].count += 1;
        }

        return Object.values(byDate);
    }, [requests]);

    const recentActivities = useMemo(
        () =>
            requests.slice(0, 10).map((row) => ({
                id: row.id,
                type: "job",
                time: row.updated_at ?? row.created_at,
                timeLabel: formatRelativeTime(row.updated_at ?? row.created_at),
                text: `Request ${row.title ?? `#${row.id}`} sedang berstatus ${normalizeStatusKey(row.status).replaceAll("_", " ")}`,
            })),
        [requests],
    );

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
                        attentionCount={activeRequests}
                        kpis={kpis}
                        quickActions={quickActions}
                        completedCount={statusCounts.completed}
                        totalCount={totalRequests}
                        statusSegments={buildStatusSegments(statusCounts)}
                        activityDays={last7Days}
                        accommodationItems={[]}
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
