import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
    BarChart3,
    ChartPie,
    ChevronRight,
    CircleCheckBig,
    ClipboardList,
    WalletCards,
} from "lucide-react";
import { buildStatusSegments } from "../../utils/dashboardStatus";

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

const getGreetingLabel = () => {
    const hour = new Date().getHours();
    if (hour < 11) return "Selamat pagi";
    if (hour < 15) return "Selamat siang";
    if (hour < 18) return "Selamat sore";
    return "Selamat malam";
};

const getUserName = (user, profile) =>
    profile?.first_name ||
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
    user?.user_metadata?.full_name?.trim() ||
    user?.email?.split("@")[0] ||
    "User";

function DashboardGreeting({ user, profile, attentionCount = 0 }) {
    const dateLabel = new Date().toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    });

    return (
        <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm md:p-6">
            <p className="text-sm font-medium text-sky-600">{dateLabel}</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 md:text-3xl">
                {getGreetingLabel()}, {getUserName(user, profile)}
            </h1>
            <p className="mt-2 text-sm text-slate-600 md:text-base">
                {attentionCount > 0
                    ? `${attentionCount} pekerjaan membutuhkan perhatian hari ini.`
                    : "Semua pekerjaan berjalan dengan baik hari ini."}
            </p>
        </section>
    );
}

function SectionTitle({ icon: Icon, title, description }) {
    return (
        <div className="mb-4 flex items-start justify-between gap-3">
            <div>
                <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
                    {Icon ? (
                        <Icon size={18} className="text-slate-400" />
                    ) : null}
                    {title}
                </h2>
                {description ? (
                    <p className="mt-1 text-sm text-slate-500">{description}</p>
                ) : null}
            </div>
        </div>
    );
}

function KPISummary({ items }) {
    return (
        <section>
            <div className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:overflow-visible md:px-0">
                <div className="grid auto-cols-[minmax(190px,1fr)] grid-flow-col gap-3 md:grid-flow-row md:grid-cols-4 md:gap-4">
                    {items.map(
                        ({ label, value, meta, icon: Icon, tone = "sky" }) => (
                            <article
                                key={label}
                                className="rounded-2xl bg-white p-4 shadow-sm md:p-5"
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-medium text-slate-500">
                                        {label}
                                    </p>
                                    <span
                                        className={`rounded-xl p-2 ${
                                            tone === "amber"
                                                ? "bg-amber-100 text-amber-600"
                                                : tone === "emerald"
                                                ? "bg-emerald-100 text-emerald-600"
                                                : tone === "slate"
                                                ? "bg-slate-100 text-slate-500"
                                                : "bg-sky-100 text-sky-600"
                                        }`}
                                    >
                                        {Icon ? <Icon size={18} /> : null}
                                    </span>
                                </div>
                                <p className="mt-4 text-3xl font-semibold text-slate-900">
                                    {value}
                                </p>
                                {meta ? (
                                    <p className="mt-1 text-xs font-medium text-slate-400">
                                        {meta}
                                    </p>
                                ) : null}
                            </article>
                        ),
                    )}
                </div>
            </div>
        </section>
    );
}

function QuickActions({ actions }) {
    return (
        <section className="rounded-2xl bg-white p-5 shadow-sm">
            <SectionTitle
                title="Quick Actions"
                description="Akses cepat untuk pekerjaan yang paling sering dibuka."
            />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {actions.map(({ label, to, icon: Icon }) => (
                    <Link
                        key={label}
                        to={to}
                        className="group flex min-h-24 flex-col justify-between rounded-xl border border-slate-200 p-4 text-slate-700 no-underline transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                        style={{ textDecoration: "none" }}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <span className="rounded-lg bg-slate-100 p-2 text-slate-500 group-hover:bg-white group-hover:text-sky-600">
                                {Icon ? <Icon size={18} /> : null}
                            </span>
                            <ChevronRight
                                size={16}
                                className="text-slate-300"
                            />
                        </div>
                        <p className="mt-4 text-sm font-semibold leading-tight">
                            {label}
                        </p>
                    </Link>
                ))}
            </div>
        </section>
    );
}

function CompletionSummaryCard({ completed, total }) {
    const rate = total ? Math.round((completed / total) * 100) : 0;

    return (
        <section className="rounded-2xl bg-white p-5 shadow-sm md:p-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-sm font-semibold uppercase tracking-wide text-sky-600">
                        Penyelesaian Pekerjaan
                    </p>
                    <p className="mt-3 text-5xl font-semibold text-slate-900">
                        {rate}%
                    </p>
                    <p className="mt-2 text-sm text-slate-500">
                        {completed} dari {total} pekerjaan selesai.
                    </p>
                </div>
                <span className="rounded-2xl bg-sky-100 p-3 text-sky-600">
                    <CircleCheckBig size={24} />
                </span>
            </div>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                    className="h-full rounded-full bg-sky-500 transition-all"
                    style={{ width: `${rate}%` }}
                />
            </div>
        </section>
    );
}

function StatusDistributionCard({
    segments,
    total,
    hoveredStatus,
    onHoverStatus,
}) {
    const radius = 74;
    const center = 90;
    const totalForRatio = total || 1;
    const chartSegments = segments.reduce(
        (result, segment) => {
            const ratio = segment.value / totalForRatio;
            return {
                offset: result.offset + ratio,
                items: [
                    ...result.items,
                    {
                        ...segment,
                        ratio,
                        offset: result.offset,
                    },
                ],
            };
        },
        { offset: 0, items: [] },
    ).items;
    const hoveredSegment = chartSegments.find(
        (item) => item.key === hoveredStatus,
    );

    return (
        <section className="rounded-2xl bg-white p-5 shadow-sm">
            <SectionTitle
                icon={ChartPie}
                title="Distribusi Status Pekerjaan"
                description={`Total ${total} pekerjaan`}
            />
            <div className="flex flex-col items-center">
                <svg width="210" height="210" viewBox="0 0 180 180">
                    <circle cx={center} cy={center} r={radius} fill="#e2e8f0" />
                    {chartSegments.map((segment) => {
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
                                        onHoverStatus(segment.key)
                                    }
                                    onMouseLeave={() => onHoverStatus(null)}
                                />
                            );
                        }

                        const startAngle = segment.offset * 360;
                        const endAngle = (segment.offset + segment.ratio) * 360;
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
                                onMouseEnter={() => onHoverStatus(segment.key)}
                                onMouseLeave={() => onHoverStatus(null)}
                            />
                        );
                    })}
                    <circle cx={center} cy={center} r="45" fill="white" />
                    <text
                        x={center}
                        y={center - 2}
                        textAnchor="middle"
                        className="fill-slate-900 text-xl font-semibold"
                    >
                        {total}
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
                        ? `${hoveredSegment.label}: ${
                              hoveredSegment.value
                          } (${Math.round(hoveredSegment.ratio * 100)}%)`
                        : `Total pekerjaan: ${total}`}
                </p>

                <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm text-slate-600">
                    {chartSegments.map((segment) => (
                        <div
                            key={segment.key}
                            className="inline-flex items-center gap-2"
                        >
                            <span
                                className="h-3 w-3 rounded-full"
                                style={{ backgroundColor: segment.color }}
                            />
                            <span>{segment.label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

function ActivityChartCard({ days, hoveredDayKey, onHoverDay }) {
    const weeklyTotal = days.reduce((sum, item) => sum + item.count, 0);
    const weeklyMax = Math.max(...days.map((item) => item.count), 1);
    const hoveredDay = days.find((item) => item.key === hoveredDayKey);

    return (
        <section className="rounded-2xl bg-white p-5 shadow-sm">
            <SectionTitle
                icon={BarChart3}
                title="Aktivitas 7 Hari Terakhir"
                description="Berdasarkan pekerjaan yang dibuat atau diperbarui."
            />
            <div className="mt-6">
                <div className="flex h-64 items-end gap-3">
                    {days.map((item) => {
                        const barHeight = Math.max(
                            (item.count / weeklyMax) * 200,
                            item.count ? 14 : 2,
                        );
                        const percent = weeklyTotal
                            ? Math.round((item.count / weeklyTotal) * 100)
                            : 0;

                        return (
                            <div
                                key={item.key}
                                className="group flex flex-1 flex-col items-center"
                                onMouseEnter={() => onHoverDay(item.key)}
                                onMouseLeave={() => onHoverDay(null)}
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
                                    style={{ height: `${barHeight}px` }}
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
        </section>
    );
}

function AccommodationSummaryCard({ items }) {
    if (!items?.length) return null;

    return (
        <section className="rounded-2xl bg-white p-5 shadow-sm">
            <SectionTitle
                icon={WalletCards}
                title="Ringkasan Akomodasi"
                description="Status pengajuan akomodasi yang relevan."
            />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {items.map((item) => (
                    <div
                        key={item.label}
                        className="rounded-xl border border-slate-200 p-4"
                    >
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            {item.label}
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">
                            {item.value}
                        </p>
                    </div>
                ))}
            </div>
        </section>
    );
}

function RecentActivityCard({ items }) {
    return (
        <section className="rounded-2xl bg-white p-5 shadow-sm">
            <SectionTitle
                icon={ClipboardList}
                title="Recent Activity"
                description="Aktivitas terbaru dari pekerjaan dan akomodasi."
            />
            {items.length ? (
                <div className="space-y-3">
                    {items.slice(0, 10).map((item) => (
                        <div
                            key={`${item.type}-${item.id}-${item.time}`}
                            className="flex items-start gap-3 rounded-xl border border-slate-100 p-3"
                        >
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky-500" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-slate-700">
                                    {item.text}
                                </p>
                                <p className="mt-1 text-xs text-slate-400">
                                    {item.timeLabel}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">
                    Belum ada aktivitas terbaru.
                </div>
            )}
        </section>
    );
}

export default function OperationalDashboard({
    user,
    profile,
    attentionCount,
    attendance,
    kpis,
    quickActions,
    completedCount,
    totalCount,
    statusSegments,
    activityDays,
    accommodationItems,
    recentActivities,
    hoveredStatus,
    onHoverStatus,
    hoveredDayKey,
    onHoverDay,
}) {
    const visibleStatusSegments = useMemo(
        () =>
            statusSegments?.length ? statusSegments : buildStatusSegments({}),
        [statusSegments],
    );

    return (
        <div className="space-y-6">
            <DashboardGreeting
                user={user}
                profile={profile}
                attentionCount={attentionCount}
            />

            {attendance ? (
                <section>
                    <SectionTitle title="Absensi Hari Ini" />
                    {attendance}
                </section>
            ) : null}

            <KPISummary items={kpis} />
            <QuickActions actions={quickActions} />
            <CompletionSummaryCard
                completed={completedCount}
                total={totalCount}
            />

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <StatusDistributionCard
                    segments={visibleStatusSegments}
                    total={totalCount}
                    hoveredStatus={hoveredStatus}
                    onHoverStatus={onHoverStatus}
                />
                <ActivityChartCard
                    days={activityDays}
                    hoveredDayKey={hoveredDayKey}
                    onHoverDay={onHoverDay}
                />
            </div>

            <AccommodationSummaryCard items={accommodationItems} />
            <RecentActivityCard items={recentActivities} />
        </div>
    );
}
