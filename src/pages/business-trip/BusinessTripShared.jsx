import { createElement, useState } from "react";
import {
    AlertCircle,
    CheckCircle2,
    Circle,
    Clock3,
    FileImage,
    Upload,
    X,
} from "lucide-react";
import { businessTripUi } from "./businessTripUi";
import {
    BUSINESS_TRIP_STATUS,
    BUSINESS_TRIP_STATUS_FLOW,
    BUSINESS_TRIP_STATUS_LABELS,
    getStatusTone,
} from "./businessTripConstants";

const toneClass = {
    slate: "border-slate-200 bg-slate-100 text-slate-700",
    sky: "border-sky-200 bg-sky-100 text-sky-700",
    amber: "border-amber-200 bg-amber-100 text-amber-800",
    green: "border-emerald-200 bg-emerald-100 text-emerald-700",
    red: "border-red-200 bg-red-100 text-red-700",
};

const buttonToneClass = {
    primary:
        "bg-sky-500 text-white shadow-sm shadow-sky-900/10 hover:bg-sky-600 active:bg-sky-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none",
    secondary:
        "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400",
    danger:
        "bg-red-500 text-white hover:bg-red-600 active:bg-red-700 disabled:bg-slate-300 disabled:text-slate-500",
    success:
        "bg-emerald-500 text-white hover:bg-emerald-600 active:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500",
};

export function Button({
    children,
    className = "",
    icon: Icon,
    tone = "primary",
    type = "button",
    ...props
}) {
    return (
        <button
            type={type}
            className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-semibold leading-tight transition focus:outline-none focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed ${buttonToneClass[tone]} ${className}`}
            {...props}
        >
            {Icon ? createElement(Icon, { size: 16 }) : null}
            {children}
        </button>
    );
}

export function ActionFooter({ children, columns = 2 }) {
    return (
        <div className={businessTripUi.footer}>
            <div
                className={
                    columns === 1
                        ? "grid grid-cols-1 gap-2.5"
                        : "grid grid-cols-2 gap-2.5"
                }
            >
                {children}
            </div>
        </div>
    );
}

export function SectionCard({
    children,
    className = "",
    icon: Icon,
    title,
    trailing,
}) {
    return (
        <section className={`${businessTripUi.section} ${className}`}>
            {(title || Icon || trailing) && (
                <div className="mb-3.5 flex items-start justify-between gap-2.5">
                    <div className="flex min-w-0 items-start gap-2.5">
                        {Icon && (
                            <span className={businessTripUi.iconBox}>
                                {createElement(Icon, { size: 17 })}
                            </span>
                        )}
                        <div className="min-w-0">
                            {title && (
                                <h3 className={businessTripUi.title}>{title}</h3>
                            )}
                        </div>
                    </div>
                    {trailing}
                </div>
            )}
            {children}
        </section>
    );
}

export function FormField({
    children,
    error,
    icon: Icon,
    label,
}) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start gap-2.5">
                {Icon && (
                    <span className={businessTripUi.iconBox}>
                        {createElement(Icon, { size: 16 })}
                    </span>
                )}
                <div className="min-w-0 flex-1">
                    {label && (
                        <label className="text-[13px] font-semibold text-slate-800">
                            {label}
                        </label>
                    )}
                    {children}
                    {error && (
                        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-red-600">
                            <AlertCircle size={14} />
                            {error}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

export function EmptyState({ children, icon: Icon = Circle, title }) {
    return (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center">
            {createElement(Icon, {
                size: 26,
                className: "mx-auto text-slate-400",
            })}
            <p className="mt-2 text-[13px] font-semibold text-slate-700">{title}</p>
            {children && (
                <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">
                    {children}
                </p>
            )}
        </div>
    );
}

export function StatusBadge({ status }) {
    const tone = getStatusTone(status);
    return (
        <span
            className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold shadow-sm backdrop-blur-sm ${
                toneClass[tone] ?? toneClass.slate
            }`}
        >
            {BUSINESS_TRIP_STATUS_LABELS[status] ?? status}
        </span>
    );
}

export function BusinessTripNumberField({ value }) {
    return (
        <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-600">
                Business Trip No
            </p>
            <p className="mt-0.5 break-all text-base font-bold tracking-wide text-slate-900">
                {value}
            </p>
        </div>
    );
}

export function StatusTimeline({ status }) {
    const visibleFlow =
        status === BUSINESS_TRIP_STATUS.REJECTED
            ? [
                  BUSINESS_TRIP_STATUS.DRAFT,
                  BUSINESS_TRIP_STATUS.SUBMITTED,
                  BUSINESS_TRIP_STATUS.PENDING_APPROVAL,
                  BUSINESS_TRIP_STATUS.REJECTED,
              ]
            : BUSINESS_TRIP_STATUS_FLOW;
    const activeIndex = visibleFlow.indexOf(status);

    return (
        <div className="space-y-2.5">
            {visibleFlow.map((item, index) => {
                const isRejected = item === BUSINESS_TRIP_STATUS.REJECTED;
                const isActive = item === status;
                const isDone = activeIndex >= 0 && index < activeIndex;
                const markerClass = isRejected
                    ? "bg-red-500 text-white"
                    : isDone
                      ? "bg-emerald-500 text-white"
                      : isActive
                        ? "bg-sky-500 text-white"
                        : "bg-slate-100 text-slate-400";

                return (
                    <div
                        key={item}
                        className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-sky-100 hover:bg-sky-50/30"
                    >
                        <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${markerClass}`}
                        >
                            {isRejected ? (
                                <X size={16} />
                            ) : isDone ? (
                                <CheckCircle2 size={16} />
                            ) : isActive ? (
                                <Clock3 size={16} />
                            ) : (
                                <Circle size={14} />
                            )}
                        </span>
                        <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-slate-900">
                                {BUSINESS_TRIP_STATUS_LABELS[item] ?? item}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                                {isDone
                                    ? "Selesai"
                                    : isActive
                                      ? isRejected
                                          ? "Ditolak"
                                          : "Status aktif"
                                      : "Berikutnya"}
                            </p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export function PhotoPreviewGrid({ photos = [], onRemove, readOnly = false }) {
    const [selectedPhoto, setSelectedPhoto] = useState(null);

    if (photos.length === 0) {
        return (
            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2.5 text-[13px] text-slate-500">
                Belum ada foto bukti kunjungan
            </p>
        );
    }

    return (
        <>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {photos.map((photo) => (
                    <div
                        key={photo.id}
                        className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-sm"
                    >
                        {photo.previewUrl ? (
                            <button
                                type="button"
                                onClick={() => setSelectedPhoto(photo)}
                                className="block w-full focus:outline-none focus:ring-4 focus:ring-sky-100"
                                aria-label={`Preview foto ${photo.name}`}
                            >
                                <img
                                    src={photo.previewUrl}
                                    alt={photo.name}
                                    className="h-16 w-full object-cover"
                                    loading="lazy"
                                />
                            </button>
                        ) : (
                            <div className="flex h-16 flex-col items-center justify-center px-1 text-center text-slate-400">
                                <FileImage size={20} />
                                <span className="mt-1 text-[10px] font-semibold leading-tight">
                                    Preview gagal
                                </span>
                            </div>
                        )}
                        {!readOnly && onRemove && (
                            <button
                                type="button"
                                onClick={() => onRemove(photo.id)}
                                className="absolute right-1 top-1 rounded-full bg-white/95 p-1.5 text-red-600 shadow-sm transition hover:bg-red-50 focus:outline-none focus:ring-4 focus:ring-red-100"
                                aria-label={`Hapus foto ${photo.name}`}
                                title="Hapus foto"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {selectedPhoto && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4">
                    <div className="relative max-h-full w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl">
                        <button
                            type="button"
                            onClick={() => setSelectedPhoto(null)}
                            className="absolute right-3 top-3 rounded-full bg-white/95 p-2 text-slate-700 shadow-sm transition hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-sky-100"
                            aria-label="Tutup preview foto"
                        >
                            <X size={18} />
                        </button>
                        <img
                            src={selectedPhoto.previewUrl}
                            alt={selectedPhoto.name}
                            className="max-h-[78vh] w-full object-contain bg-slate-950"
                        />
                        <div className="border-t border-slate-200 px-4 py-3">
                            <p className="truncate text-sm font-semibold text-slate-900">
                                {selectedPhoto.name}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export function PhotoUpload({ inputId, onAddPhotos, disabled = false }) {
    return (
        <div>
            <label
                htmlFor={inputId}
                className={`mt-2 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center transition ${
                    disabled
                        ? "cursor-not-allowed opacity-60"
                        : "hover:border-sky-300 hover:bg-sky-50/60 active:bg-sky-100/50"
                }`}
            >
                <span className="rounded-lg bg-white p-2.5 text-sky-500 shadow-sm">
                    <Upload size={18} />
                </span>
                <span className="mt-2 text-[13px] font-semibold text-slate-700">
                    Tambah Foto
                </span>
            </label>
            <input
                id={inputId}
                type="file"
                accept="image/*"
                multiple
                disabled={disabled}
                onChange={onAddPhotos}
                className="hidden"
            />
        </div>
    );
}

export function DetailRow({ label, value }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-semibold uppercase text-slate-500">
                {label}
            </p>
            <p className="mt-1 break-words text-[13px] font-semibold text-slate-900">
                {value || "-"}
            </p>
        </div>
    );
}
