import { useEffect, useMemo, useRef, useState } from "react";
import {
    BarChart3,
    CalendarDays,
    ChartPie,
    CircleCheckBig,
    Clock3,
    Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import AttendanceDashboardSimple from "../../components/AttendanceDashboardSimple";
import Card from "../../components/card";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import { useAuth } from "../../context/useAuth";
import supabase from "../../supabaseClient";

const STATUS_META = {
    pending: { label: "Pending", color: "#0ea5e9" },
    in_progress: { label: "In Progress", color: "#67e8f9" },
    completed: { label: "Completed", color: "#0369a1" },
};

const normalizeStatusKey = (value) => {
    const raw = String(value ?? "")
        .trim()
        .toLowerCase()
        .replaceAll("-", "_")
        .replaceAll(" ", "_");
    if (raw === "inprogress") return "in_progress";
    if (raw === "in_progress") return "in_progress";
    if (raw === "completed" || raw === "done") return "completed";
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

const polarToCartesian = (cx, cy, radius, angleInDegrees) => {
    const radians = ((angleInDegrees - 90) * Math.PI) / 180;
    return {
        x: cx + radius * Math.cos(radians),
        y: cy + radius * Math.sin(radians),
    };
};

const describePieSlice = (cx, cy, radius, startAngle, endAngle) => {
    const start = polarToCartesian(cx, cy, radius, endAngle);
    const end = polarToCartesian(cx, cy, radius, startAngle);
    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

    return [
        `M ${cx} ${cy}`,
        `L ${start.x} ${start.y}`,
        `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
        "Z",
    ].join(" ");
};

const describeFullCircle = (cx, cy, radius) =>
    [
        `M ${cx} ${cy - radius}`,
        `A ${radius} ${radius} 0 1 1 ${cx} ${cy + radius}`,
        `A ${radius} ${radius} 0 1 1 ${cx} ${cy - radius}`,
        "Z",
    ].join(" ");

export default function TechnicianDashboard() {
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const { user } = useAuth();
    const [tasks, setTasks] = useState([]);
    const [hoveredStatus, setHoveredStatus] = useState(null);
    const [hoveredDayKey, setHoveredDayKey] = useState(null);
    const channelRef = useRef(null);
    const isMountedRef = useRef(true);
    const userIdRef = useRef(user?.id);

    const loadTasks = async () => {
        if (!userIdRef.current) return;

        try {
            const { data, error } = await supabase
                .from("requests")
                .select("*")
                .eq("technician_id", userIdRef.current)
                .order("created_at", { ascending: false });

            if (error) throw error;
            if (isMountedRef.current) {
                setTasks(data ?? []);
            }
        } catch (error) {
            console.error("Error loading technician dashboard data:", error);
            if (isMountedRef.current) {
                setTasks([]);
            }
        }
    };

    useEffect(() => {
        isMountedRef.current = true;
        userIdRef.current = user?.id;
        return () => {
            isMountedRef.current = false;
        };
    }, [user?.id]);

    // ✅ Setup channel once on mount - NO dependencies to prevent re-creation
    useEffect(() => {
        if (!user?.id) return;

        const timerId = setTimeout(() => {
            loadTasks();
        }, 0);

        // ✅ Create channel only once per user.id
        if (!channelRef.current) {
            channelRef.current = supabase
                .channel(`technician-dashboard-${user.id}`)
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "requests" },
                    () => {
                        loadTasks();
                    },
                )
                .subscribe();
        }

        return () => {
            clearTimeout(timerId);
            // ✅ Proper cleanup: unsubscribe AND remove channel
            if (channelRef.current) {
                channelRef.current.unsubscribe();
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [user?.id]); // ✅ Only recreate if user.id changes

    const statusCounts = useMemo(() => {
        const counts = {
            pending: 0,
            in_progress: 0,
            completed: 0,
        };

        for (const row of tasks) {
            const key = normalizeStatusKey(row.status);
            if (counts[key] !== undefined) {
                counts[key] += 1;
            }
        }

        return counts;
    }, [tasks]);

    const jobStatusCards = [
        {
            title: "Pending",
            value: statusCounts.pending,
            icon: Clock3,
            tone: "amber",
            statusKey: "pending",
        },
        {
            title: "In Progress",
            value: statusCounts.in_progress,
            icon: Wrench,
            tone: "sky",
            statusKey: "in_progress",
        },
        {
            title: "Completed",
            value: statusCounts.completed,
            icon: CircleCheckBig,
            tone: "emerald",
            statusKey: "completed",
        },
    ];

    const totalTasks = tasks.length;
    const completionRate = totalTasks
        ? Math.round((statusCounts.completed / totalTasks) * 100)
        : 0;

    const donutSegments = useMemo(() => {
        const keys = ["pending", "in_progress", "completed"];
        const total = totalTasks || 1;
        let offset = 0;

        return keys.map((key) => {
            const value = statusCounts[key];
            const ratio = value / total;
            const segment = {
                key,
                value,
                ratio,
                offset,
                color: STATUS_META[key].color,
                label: STATUS_META[key].label,
            };
            offset += ratio;
            return segment;
        });
    }, [statusCounts, totalTasks]);

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

    const weeklyTotal = last7Days.reduce((sum, item) => sum + item.count, 0);
    const weeklyMax = Math.max(...last7Days.map((item) => item.count), 1);

    const hoveredSegment = donutSegments.find(
        (item) => item.key === hoveredStatus,
    );
    const hoveredDay = last7Days.find((item) => item.key === hoveredDayKey);
    const radius = 74;
    const center = 90;

    return (
        <div className="min-h-screen bg-sky-50">
            <div className="flex min-h-screen">
                <Sidebar
                    collapsed={sidebarCollapsed}
                    onToggle={toggleSidebar}
                />

                <main className="min-w-0 flex-1 p-4 pb-24 md:p-8 md:pb-8">
                    <div>
                        <h1 className="text-3xl font-semibold text-slate-900">
                            Dashboard Teknisi
                        </h1>
                        <p className="mt-1 text-slate-600">
                            Ringkasan pekerjaan Anda dan absensi hari ini.
                        </p>
                    </div>

                    <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {jobStatusCards.map((item) => (
                            <Link
                                key={item.title}
                                to={`/technician/requests?status=${item.statusKey}`}
                                className="no-underline"
                                style={{ textDecoration: "none" }}
                            >
                                <Card
                                    title={item.title}
                                    value={item.value}
                                    icon={item.icon}
                                    tone={item.tone}
                                />
                            </Link>
                        ))}
                    </section>

                    <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm md:px-10 md:py-8">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
                                <CalendarDays size={18} />
                                Absensi Hari Ini
                            </h2>
                        </div>
                        <AttendanceDashboardSimple
                            technicianId={user?.id}
                            onDataChange={() => {}}
                        />
                    </section>

                    <section className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <div className="rounded-2xl bg-white p-5 shadow-sm">
                            <div className="flex items-center justify-between">
                                <h2 className="text-2xl font-semibold text-slate-900">
                                    Distribusi Status
                                </h2>
                                <ChartPie
                                    size={18}
                                    className="text-slate-400"
                                />
                            </div>

                            <div className="mt-4 flex flex-col items-center">
                                <svg
                                    width="210"
                                    height="210"
                                    viewBox="0 0 180 180"
                                >
                                    <circle
                                        cx={center}
                                        cy={center}
                                        r={radius}
                                        fill="#e2e8f0"
                                    />
                                    {donutSegments.map((segment) => {
                                        if (!segment.value) return null;
                                        if (segment.ratio >= 0.999) {
                                            return (
                                                <path
                                                    key={segment.key}
                                                    d={describeFullCircle(
                                                        center,
                                                        center,
                                                        radius,
                                                    )}
                                                    fill={segment.color}
                                                    onMouseEnter={() =>
                                                        setHoveredStatus(
                                                            segment.key,
                                                        )
                                                    }
                                                    onMouseLeave={() =>
                                                        setHoveredStatus(null)
                                                    }
                                                />
                                            );
                                        }

                                        const startAngle = segment.offset * 360;
                                        const endAngle =
                                            (segment.offset + segment.ratio) *
                                            360;
                                        return (
                                            <path
                                                key={segment.key}
                                                d={describePieSlice(
                                                    center,
                                                    center,
                                                    radius,
                                                    startAngle,
                                                    endAngle,
                                                )}
                                                fill={segment.color}
                                                onMouseEnter={() =>
                                                    setHoveredStatus(
                                                        segment.key,
                                                    )
                                                }
                                                onMouseLeave={() =>
                                                    setHoveredStatus(null)
                                                }
                                            />
                                        );
                                    })}
                                    <circle
                                        cx={center}
                                        cy={center}
                                        r="45"
                                        fill="white"
                                    />
                                    <text
                                        x={center}
                                        y={center - 2}
                                        textAnchor="middle"
                                        className="fill-slate-900 text-xl font-semibold"
                                    >
                                        {totalTasks}
                                    </text>
                                    <text
                                        x={center}
                                        y={center + 18}
                                        textAnchor="middle"
                                        className="fill-slate-400 text-[11px]"
                                    >
                                        Total Job
                                    </text>
                                </svg>

                                <p className="mt-2 text-sm text-slate-600">
                                    {hoveredSegment
                                        ? `${hoveredSegment.label}: ${hoveredSegment.value} (${Math.round(
                                              hoveredSegment.ratio * 100,
                                          )}%)`
                                        : `Total pekerjaan Anda: ${totalTasks}`}
                                </p>

                                <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm text-slate-600">
                                    {donutSegments.map((segment) => (
                                        <div
                                            key={segment.key}
                                            className="inline-flex items-center gap-2"
                                        >
                                            <span
                                                className="h-3 w-3 rounded-full"
                                                style={{
                                                    backgroundColor:
                                                        segment.color,
                                                }}
                                            />
                                            <span>{segment.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl bg-white p-5 shadow-sm">
                            <div className="flex items-center justify-between">
                                <h2 className="text-2xl font-semibold text-slate-900">
                                    Aktivitas Harian (7 Hari Terakhir)
                                </h2>
                                <BarChart3
                                    size={18}
                                    className="text-slate-400"
                                />
                            </div>

                            <div className="mt-8">
                                <div className="flex h-64 items-end gap-3">
                                    {last7Days.map((item) => {
                                        const barHeight = Math.max(
                                            (item.count / weeklyMax) * 200,
                                            item.count ? 14 : 2,
                                        );
                                        const percent = weeklyTotal
                                            ? Math.round(
                                                  (item.count / weeklyTotal) *
                                                      100,
                                              )
                                            : 0;
                                        return (
                                            <div
                                                key={item.key}
                                                className="group flex flex-1 flex-col items-center"
                                                onMouseEnter={() =>
                                                    setHoveredDayKey(item.key)
                                                }
                                                onMouseLeave={() =>
                                                    setHoveredDayKey(null)
                                                }
                                            >
                                                <div className="mb-2 h-6 text-[11px] text-slate-600">
                                                    {hoveredDayKey === item.key
                                                        ? `${item.count} (${percent}%)`
                                                        : ""}
                                                </div>
                                                <div
                                                    className={`w-full max-w-10 rounded-t-lg transition ${
                                                        item.count
                                                            ? "bg-sky-400 group-hover:bg-sky-500"
                                                            : "bg-slate-200 group-hover:bg-slate-300"
                                                    }`}
                                                    style={{
                                                        height: `${barHeight}px`,
                                                    }}
                                                />
                                                <span className="mt-2 text-sm text-slate-500">
                                                    {item.label}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <p className="mt-5 text-sm text-slate-400">
                                    {hoveredDay
                                        ? `${hoveredDay.label}: ${hoveredDay.count} pekerjaan`
                                        : "Arahkan kursor ke batang untuk melihat detail."}
                                </p>
                            </div>
                        </div>
                    </section>

                    <section className="mt-6 rounded-2xl bg-sky-500 p-6 text-white shadow-sm">
                        <p className="text-sm font-semibold uppercase tracking-wide text-sky-100">
                            Ringkasan Penyelesaian
                        </p>
                        <p className="mt-2 text-5xl font-bold">
                            {completionRate}%
                        </p>
                        <p className="mt-2 text-lg text-sky-100">
                            Persentase pekerjaan Anda yang sudah selesai.
                        </p>
                    </section>
                </main>
            </div>

            <MobileBottomNav />
        </div>
    );
}
