import { X } from "lucide-react";

export default function ImagePreviewModal({
    title,
    src,
    alt,
    onClose,
}) {
    if (!src) return null;

    return (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/70 p-4">
            <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                    <h3 className="text-sm font-semibold text-slate-900">
                        {title}
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                        aria-label="Tutup preview"
                    >
                        <X size={18} />
                    </button>
                </div>
                <div className="bg-black">
                    <img
                        src={src}
                        alt={alt}
                        className="max-h-[80vh] w-full object-contain"
                    />
                </div>
            </div>
        </div>
    );
}
