import { useEffect, useMemo, useRef, useState } from "react";
import {
    BarChart3,
    BriefcaseBusiness,
    CircleCheckBig,
    Clock3,
    Plus,
    Users,
    Wallet,
    Wrench,
    X,
} from "lucide-react";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import AttendanceDashboardSimple from "../../components/AttendanceDashboardSimple";
import OperationalDashboard from "../../components/dashboard/OperationalDashboard";
import AppToast from "../../components/ui/AppToast";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import { useAuth } from "../../context/useAuth";
import supabase from "../../supabaseClient";
import { createUniqueChannelName } from "../../utils/realtimeChannelManager";
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
    if (["pending", "requested", ""].includes(raw)) return "pending";
    if (["approved", "disetujui", "paid"].includes(raw)) return "approved";
    if (["rejected", "ditolak"].includes(raw)) return "rejected";
    if (
        [
            "need_review",
            "review",
            "revision",
            "needs_review",
            "realization_process",
            "partial_realized",
            "partial_realize",
            "partially_realized",
            "realized",
        ].includes(raw)
    ) {
        return "need_review";
    }
    return "need_review";
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

export default function AdminDashboard() {
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const { user, profile, role, loading: authLoading } = useAuth();
    const [requests, setRequests] = useState([]);
    const [accommodations, setAccommodations] = useState([]);
    const [paymentRequests, setPaymentRequests] = useState({
        accommodation: [],
        reimbursement: [],
        loan: [],
    });
    const [paymentSummaryLoaded, setPaymentSummaryLoaded] = useState(false);
    const [paymentToast, setPaymentToast] = useState("");
    const [hoveredStatus, setHoveredStatus] = useState(null);
    const [hoveredDayKey, setHoveredDayKey] = useState(null);
    const channelRef = useRef(null);
    const isMountedRef = useRef(true);
    const authLoadingRef = useRef(authLoading);

    useEffect(() => {
        authLoadingRef.current = authLoading;
    }, [authLoading]);

    const loadRequests = async () => {
        try {
            const { data, error } = await supabase
                .from("requests")
                .select("*")
                .order("created_at", { ascending: false });

            if (error) throw error;
            if (isMountedRef.current) setRequests(data ?? []);
        } catch (error) {
            console.error("Error loading admin dashboard data:", error);
            if (isMountedRef.current) setRequests([]);
        }
    };

    const loadAccommodations = async () => {
        try {
            const { data, error } = await supabase
                .from("accommodation_requests")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(50);

            if (error) throw error;
            if (isMountedRef.current) setAccommodations(data ?? []);
        } catch (error) {
            console.warn("Accommodation summary skipped:", error.message);
            if (isMountedRef.current) setAccommodations([]);
        }
    };

    const loadPaymentRequests = async () => {
        const queries = [
            ["accommodation", supabase.from("accommodation_requests").select("id, requested_amount").eq("status", "pending")],
            ["reimbursement", supabase.from("reimbursements").select("id, claim_amount").eq("status", "pending")],
            ["loan", supabase.from("loans").select("id, loan_amount").eq("status", "pending")],
        ];
        const results = await Promise.allSettled(queries.map(([, query]) => query));
        if (!isMountedRef.current) return;

        setPaymentRequests((current) => {
            const next = { ...current };
            results.forEach((result, index) => {
                const key = queries[index][0];
                if (result.status === "fulfilled" && !result.value.error) {
                    next[key] = result.value.data ?? [];
                } else {
                    const error = result.status === "rejected" ? result.reason : result.value.error;
                    console.warn(`[AdminDashboard] ${key} payment summary skipped:`, error?.message ?? error);
                }
            });
            return next;
        });
        setPaymentSummaryLoaded(true);
    };

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (authLoadingRef.current || !user?.id) return;

        const timerId = setTimeout(() => {
            loadRequests();
            loadAccommodations();
            loadPaymentRequests();
        }, 0);

        const setupChannel = async () => {
            const channelName = createUniqueChannelName(
                "admin-dashboard",
                user.id,
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
                        if (isMountedRef.current) loadRequests();
                    },
                )
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "job_technicians" },
                    () => {
                        if (isMountedRef.current) loadRequests();
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
                        if (isMountedRef.current) {
                            loadAccommodations();
                            loadPaymentRequests();
                        }
                    },
                )
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "reimbursements" },
                    () => isMountedRef.current && loadPaymentRequests(),
                )
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "loans" },
                    () => isMountedRef.current && loadPaymentRequests(),
                );

            const { error } = await channelRef.current.subscribe();
            if (error) console.error("[AdminDashboard] Subscribe error:", error);
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
        for (const row of requests) {
            counts[normalizeStatusKey(row.status)] += 1;
        }
        return counts;
    }, [requests]);

    const accommodationCounts = useMemo(() => {
        const counts = { pending: 0, approved: 0, need_review: 0, rejected: 0 };
        for (const row of accommodations) {
            counts[normalizeAccommodationStatus(row.status)] += 1;
        }
        return counts;
    }, [accommodations]);

    const totalRequests = requests.length;
    const completionRate = totalRequests
        ? Math.round((statusCounts.completed / totalRequests) * 100)
        : 0;
    const activeAttention = statusCounts.pending + statusCounts.in_progress;

    const kpis = [
        {
            label: "Pending",
            value: statusCounts.pending,
            meta: totalRequests ? `${Math.round((statusCounts.pending / totalRequests) * 100)}% dari total` : "0%",
            icon: Clock3,
            tone: "amber",
        },
        {
            label: "In Progress",
            value: statusCounts.in_progress,
            meta: totalRequests ? `${Math.round((statusCounts.in_progress / totalRequests) * 100)}% dari total` : "0%",
            icon: Wrench,
            tone: "sky",
        },
        {
            label: "Completed",
            value: statusCounts.completed,
            meta: `${completionRate}% selesai`,
            icon: CircleCheckBig,
            tone: "emerald",
        },
        {
            label: "Total Pekerjaan",
            value: totalRequests,
            meta: `${activeAttention} aktif`,
            icon: BriefcaseBusiness,
            tone: "slate",
        },
    ];

    const baseAccommodationPath =
        role === "management" ? "/management/accommodation" : "/admin/accommodation";
    const formatRupiah = (value) =>
        new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency: "IDR",
            maximumFractionDigits: 0,
        }).format(value);
    const paymentRequestItems = [
        {
            key: "accommodation",
            label: "Akomodasi",
            tone: "blue",
            to: `${baseAccommodationPath}?status=pending&period=all`,
            count: paymentRequests.accommodation.length,
            amountLabel: formatRupiah(paymentRequests.accommodation.reduce((sum, row) => sum + Number(row.requested_amount ?? 0), 0)),
        },
        {
            key: "reimbursement",
            label: "Reimbursement",
            tone: "blue",
            to: "/reimburse?status=pending&period=all",
            count: paymentRequests.reimbursement.length,
            amountLabel: formatRupiah(paymentRequests.reimbursement.reduce((sum, row) => sum + Number(row.claim_amount ?? 0), 0)),
        },
        {
            key: "loan",
            label: "Pinjaman",
            tone: "blue",
            to: "/loans?status=pending&period=all",
            count: paymentRequests.loan.length,
            amountLabel: formatRupiah(paymentRequests.loan.reduce((sum, row) => sum + Number(row.loan_amount ?? 0), 0)),
        },
    ];
    const pendingPaymentCount = paymentRequestItems.reduce(
        (sum, item) => sum + item.count,
        0,
    );

    useEffect(() => {
        if (!paymentSummaryLoaded || !pendingPaymentCount || !user?.id) return;

        const toastKey = `payment-pending-toast:${user.id}`;
        try {
            if (sessionStorage.getItem(toastKey)) return;
            sessionStorage.setItem(toastKey, "shown");
        } catch {
            // Tetap tampilkan toast jika sessionStorage tidak tersedia.
        }

        setPaymentToast(
            `Ada ${pendingPaymentCount} transaksi pembayaran yang menunggu persetujuan. Silakan ditinjau agar tidak tertunda.`,
        );
    }, [paymentSummaryLoaded, pendingPaymentCount, user?.id]);

    useEffect(() => {
        if (!paymentToast) return undefined;
        const timerId = window.setTimeout(() => setPaymentToast(""), 7000);
        return () => window.clearTimeout(timerId);
    }, [paymentToast]);
    const quickActions = [
        { label: "Buat Pekerjaan", to: "/jobs/new", icon: Plus },
        { label: "Tambah Customer", to: "/master-data", icon: Users },
        { label: "Pengajuan Akomodasi", to: baseAccommodationPath, icon: Wallet },
        {
            label: "Laporan",
            to: `${baseAccommodationPath}/reports`,
            icon: BarChart3,
        },
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

    const recentActivities = useMemo(() => {
        const jobItems = requests.slice(0, 10).map((row) => ({
            id: row.id,
            type: "job",
            time: row.updated_at ?? row.created_at,
            timeLabel: formatRelativeTime(row.updated_at ?? row.created_at),
            text: `${row.customer_name ?? "Customer"} membuat atau memperbarui pekerjaan ${row.title ?? `#${row.id}`}`,
        }));
        const accommodationItems = accommodations.slice(0, 10).map((row) => ({
            id: row.id,
            type: "accommodation",
            time: row.updated_at ?? row.created_at,
            timeLabel: formatRelativeTime(row.updated_at ?? row.created_at),
            text: `${row.technician_name ?? "Teknisi"} mengajukan akomodasi ${row.request_title ?? ""}`.trim(),
        }));

        return [...jobItems, ...accommodationItems]
            .sort((a, b) => new Date(b.time ?? 0) - new Date(a.time ?? 0))
            .slice(0, 10);
    }, [requests, accommodations]);

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
                        paymentRequests={paymentRequestItems}
                        completedCount={statusCounts.completed}
                        totalCount={totalRequests}
                        statusSegments={buildStatusSegments(statusCounts)}
                        activityDays={last7Days}
                        accommodationItems={[
                            {
                                label: "Pending Approval",
                                value: accommodationCounts.pending,
                            },
                            { label: "Approved", value: accommodationCounts.approved },
                            {
                                label: "Need Review",
                                value: accommodationCounts.need_review,
                            },
                            { label: "Rejected", value: accommodationCounts.rejected },
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
            {paymentToast ? (
                <AppToast tone="amber" className="flex items-start gap-3">
                    <Wallet size={19} className="mt-0.5 shrink-0" />
                    <p className="min-w-0 flex-1">{paymentToast}</p>
                    <button
                        type="button"
                        onClick={() => setPaymentToast("")}
                        className="rounded-md p-0.5 text-amber-600 hover:bg-amber-100"
                        aria-label="Tutup notifikasi"
                    >
                        <X size={17} />
                    </button>
                </AppToast>
            ) : null}
        </div>
    );
}
