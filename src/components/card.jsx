export default function Card({
    title,
    value,
    icon: Icon,
    tone = "sky",
    className = "",
}) {
    const toneClass = {
        amber: "bg-amber-100 text-amber-500",
        sky: "bg-blue-100 text-blue-500",
        emerald: "bg-emerald-100 text-emerald-500",
        slate: "bg-slate-200 text-slate-500",
    };

    return (
        <article className={`rounded-2xl bg-white p-6 shadow-sm ${className}`}>
            <div className="flex items-center gap-4">
                <span
                    className={`inline-flex rounded-2xl p-3 ${
                        toneClass[tone] ?? toneClass.slate
                    }`}
                >
                    {Icon ? <Icon size={26} strokeWidth={2.2} /> : null}
                </span>

                <div className="leading-tight">
                    <p className="text-lg font-normal text-slate-600">{title}</p>
                    <p className="mt-1 text-3xl font-semibold text-slate-900">
                        {value}
                    </p>
                </div>
            </div>
        </article>
    );
}
