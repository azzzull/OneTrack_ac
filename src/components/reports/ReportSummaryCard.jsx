import { createElement } from "react";

export default function ReportSummaryCard({
    compact = false,
    icon: Icon,
    label,
    title,
    value,
}) {
    const heading = label ?? title;

    return (
        <div
            className={`rounded-2xl bg-white shadow-sm ${
                compact ? "h-25 p-3" : "p-4"
            }`}
        >
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p
                        className={`${
                            compact
                                ? "line-clamp-2 min-h-8 text-xs"
                                : "text-sm"
                        } text-slate-500`}
                    >
                        {heading}
                    </p>
                    <p
                        className={`mt-1 wrap-break-word font-semibold text-slate-900 ${
                            compact ? "text-lg" : "text-2xl"
                        }`}
                    >
                        {value}
                    </p>
                </div>
                <span
                    className={`shrink-0 rounded-2xl bg-sky-50 text-sky-500 ${
                        compact ? "p-2" : "p-3"
                    }`}
                >
                    {createElement(Icon, { size: compact ? 18 : 22 })}
                </span>
            </div>
        </div>
    );
}
