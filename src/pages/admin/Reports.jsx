import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, ChartPie, Download } from "lucide-react";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import supabase from "../../supabaseClient";

const STATUS_META = {
    pending: { label: "Pending", color: "#0ea5e9" },
    in_progress: { label: "In Progress", color: "#67e8f9" },
    completed: { label: "Completed", color: "#0369a1" },
};

const toDateKey = (value) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
};

const toCsvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export default function AdminReportsPage() {
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const [requests, setRequests] = useState([]);
    const [hoveredStatus, setHoveredStatus] = useState(null);
    const [hoveredDayKey, setHoveredDayKey] = useState(null);

    const loadRequests = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from("requests")
                .select("*")
                .order("created_at", { ascending: false });
            if (error) throw error;
            setRequests(data ?? []);
        } catch (error) {
            console.error("Error loading report data:", error);
            setRequests([]);
        }
    }, []);

    useEffect(() => {
        const timerId = setTimeout(() => {
            loadRequests();
        }, 0);

        const channel = supabase
            .channel("admin-reports-page")
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

    const statusCounts = useMemo(() => {
        const counts = {
            pending: 0,
            in_progress: 0,
            completed: 0,
        };

        for (const row of requests) {
            const key = String(row.status ?? "pending").toLowerCase();
            if (counts[key] !== undefined) counts[key] += 1;
        }
        return counts;
    }, [requests]);

    const totalRequests = requests.length;
    const completionRate = totalRequests
        ? Math.round((statusCounts.completed / totalRequests) * 100)
        : 0;

    const donutSegments = useMemo(() => {
        const keys = ["pending", "in_progress", "completed"];
        const total = totalRequests || 1;
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
    }, [statusCounts, totalRequests]);

    const last7Days = useMemo(() => {
        const byDate = {};
        for (let i = 6; i >= 0; i -= 1) {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            d.setDate(d.getDate() - i);
            byDate[d.toISOString().slice(0, 10)] = {
                key: d.toISOString().slice(0, 10),
                label: d.toLocaleDateString("id-ID", { weekday: "short" }),
                count: 0,
            };
        }

        for (const row of requests) {
            const key = toDateKey(row.created_at);
            if (byDate[key]) byDate[key].count += 1;
        }

        return Object.values(byDate);
    }, [requests]);

    const weeklyTotal = last7Days.reduce((sum, item) => sum + item.count, 0);
    const weeklyMax = Math.max(...last7Days.map((item) => item.count), 1);

    const hoveredSegment = donutSegments.find(
        (item) => item.key === hoveredStatus,
    );
    const hoveredDay = last7Days.find((item) => item.key === hoveredDayKey);

    const exportCsv = () => {
        const headers = [
            "ID",
            "Title",
            "Status",
            "Customer",
            "Phone",
            "Location",
            "Created At",
        ];
        const lines = [headers.map(toCsvCell).join(",")];

        for (const row of requests) {
            lines.push(
                [
                    row.id,
                    row.title,
                    row.status,
                    row.customer_name,
                    row.customer_phone,
                    row.location,
                    row.created_at,
                ]
                    .map(toCsvCell)
                    .join(","),
            );
        }

        const blob = new Blob([lines.join("\n")], {
            type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "reports-requests.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const radius = 74;
    const center = 90;
    const circumference = 2 * Math.PI * radius;

    return (
        <div className="min-h-screen bg-sky-50">
            <div className="flex min-h-screen">
                <Sidebar
                    collapsed={sidebarCollapsed}
                    onToggle={toggleSidebar}
                />

                <main className="min-w-0 flex-1 p-4 pb-24 md:p-8 md:pb-8">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                            <h1 className="text-3xl font-semibold text-slate-900">
                                Analisis Servis
                            </h1>
                            <p className="mt-1 text-slate-600">
                                Ringkasan performa armada berdasarkan data
                                real-time.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={exportCsv}
                            className="inline-flex items-center gap-2 self-start rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                        >
                            <Download size={16} />
                            Export CSV
                        </button>
                    </div>

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
                                        fill="none"
                                        stroke="#e2e8f0"
                                        strokeWidth="20"
                                    />
                                    {donutSegments.map((segment) => {
                                        if (!segment.value) return null;
                                        const segmentLength =
                                            segment.ratio * circumference;
                                        const dashArray = `${segmentLength} ${circumference - segmentLength}`;
                                        const dashOffset =
                                            -segment.offset * circumference;
                                        return (
                                            <circle
                                                key={segment.key}
                                                cx={center}
                                                cy={center}
                                                r={radius}
                                                fill="none"
                                                stroke={segment.color}
                                                strokeWidth="20"
                                                strokeDasharray={dashArray}
                                                strokeDashoffset={dashOffset}
                                                strokeLinecap="round"
                                                transform={`rotate(-90 ${center} ${center})`}
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
                                </svg>

                                <p className="mt-2 text-sm text-slate-600">
                                    {hoveredSegment
                                        ? `${hoveredSegment.label}: ${hoveredSegment.value} (${Math.round(
                                              hoveredSegment.ratio * 100,
                                          )}%)`
                                        : `Total pekerjaan: ${totalRequests}`}
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
                                                    className="w-full max-w-10 rounded-t-lg bg-sky-400 transition group-hover:bg-sky-500"
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
                                <p className="mt-2 text-sm text-slate-600">
                                    {hoveredDay
                                        ? `${hoveredDay.label}: ${hoveredDay.count} pekerjaan`
                                        : "Arahkan kursor ke batang untuk melihat detail."}
                                </p>
                            </div>
                        </div>
                    </section>

                    <section className="mt-6 rounded-2xl bg-sky-500 p-6 text-white shadow-sm">
                        <p className="text-sm font-semibold uppercase tracking-wide text-sky-100">
                            Laporan Efisiensi
                        </p>
                        <p className="mt-2 text-5xl font-bold">
                            {completionRate}%
                        </p>
                        <p className="mt-2 text-lg text-sky-100">
                            Tingkat penyelesaian pekerjaan di seluruh wilayah
                            layanan.
                        </p>
                    </section>
                </main>
            </div>

            <MobileBottomNav />
        </div>
    );
}
