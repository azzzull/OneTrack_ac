import { useEffect, useMemo, useState } from "react";
import { Search, Users, X } from "lucide-react";

const inputClass =
    "mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-300 focus:bg-white";

const getTechnicianName = (tech) => {
    const composed =
        `${tech?.first_name ?? ""} ${tech?.last_name ?? ""}`.trim();
    return (
        composed ||
        String(tech?.name ?? "").trim() ||
        String(tech?.full_name ?? "").trim() ||
        String(tech?.email ?? "").trim() ||
        "-"
    );
};

const getTechnicianKey = (tech) => String(tech?.id ?? "");

export default function JobTechnicianManagerModal({
    isOpen,
    title = "Kelola Teknisi",
    technicians = [],
    selectedTechnicianIds = [],
    creatorTechnicianId = null,
    creatorLabel = "Pembuat",
    onClose,
    onSave,
    saving = false,
}) {
    const [search, setSearch] = useState("");
    const [draftIds, setDraftIds] = useState([]);

    useEffect(() => {
        if (!isOpen) return;
        setSearch("");
        setDraftIds([...new Set((selectedTechnicianIds ?? []).filter(Boolean))]);
    }, [isOpen, selectedTechnicianIds]);

    const filteredTechnicians = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        if (!keyword) return technicians;
        return technicians.filter((tech) => {
            const haystack =
                `${getTechnicianName(tech)} ${tech?.email ?? ""} ${tech?.technician_type ?? ""}`.toLowerCase();
            return haystack.includes(keyword);
        });
    }, [search, technicians]);

    if (!isOpen) return null;

    const toggleTechnician = (technicianId) => {
        if (!technicianId) return;
        setDraftIds((prev) =>
            prev.includes(technicianId)
                ? prev.filter((id) => id !== technicianId)
                : [...prev, technicianId],
        );
    };

    const handleSave = async () => {
        await onSave?.([...draftIds]);
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 p-4">
            <div className="flex min-h-full items-start justify-center py-6 md:items-center md:py-0">
                <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl">
                    <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                        <div>
                            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                <Users size={14} />
                                Teknisi Terlibat
                            </p>
                            <h2 className="mt-1 text-lg font-semibold text-slate-900">
                                {title}
                            </h2>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <div className="grid max-h-[80vh] grid-cols-1 overflow-auto md:grid-cols-[0.95fr_1.05fr]">
                        <div className="border-b border-slate-200 p-5 md:border-b-0 md:border-r">
                            <p className="text-sm font-semibold text-slate-800">
                                Ringkasan
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                                Pilih teknisi yang ikut mengerjakan job ini.
                                {creatorTechnicianId ? (
                                    <>
                                        {" "}
                                        Pembuat akan selalu dipertahankan.
                                    </>
                                ) : null}
                            </p>

                            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="text-sm font-medium text-slate-700">
                                    Dipilih
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {draftIds.length > 0 ? (
                                        draftIds.map((id) => {
                                            const tech = technicians.find(
                                                (item) => String(item.id) === String(id),
                                            );
                                            return (
                                                <span
                                                    key={id}
                                                    className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700"
                                                >
                                                    {getTechnicianName(tech)}
                                                </span>
                                            );
                                        })
                                    ) : (
                                        <span className="text-xs text-slate-500">
                                            Belum ada teknisi tambahan.
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="p-5">
                            <label className="block">
                                <span className="text-sm font-medium text-slate-700">
                                    Cari teknisi
                                </span>
                                <div className="relative mt-1">
                                    <Search
                                        size={14}
                                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                                    />
                                    <input
                                        value={search}
                                        onChange={(event) =>
                                            setSearch(event.target.value)
                                        }
                                        placeholder="Cari nama atau email"
                                        className={`${inputClass} pl-9`}
                                    />
                                </div>
                            </label>

                            <div className="mt-4">
                                {filteredTechnicians.length > 0 ? (
                                    <div className="space-y-2">
                                        {filteredTechnicians.map((tech) => {
                                            const techId = getTechnicianKey(tech);
                                            const checked =
                                                draftIds.includes(techId);
                                            const isCreator =
                                                creatorTechnicianId &&
                                                String(creatorTechnicianId) ===
                                                    String(techId);

                                            return (
                                                <label
                                                    key={techId}
                                                    className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isCreator || checked}
                                                        onChange={() =>
                                                            !isCreator &&
                                                            toggleTechnician(techId)
                                                        }
                                                        disabled={isCreator}
                                                        className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-500 focus:ring-sky-400 disabled:opacity-70"
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="font-medium text-slate-800">
                                                                {getTechnicianName(
                                                                    tech,
                                                                )}
                                                            </span>
                                                            {isCreator && (
                                                                <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                                                    {creatorLabel}
                                                                </span>
                                                            )}
                                                            {tech?.technician_type && (
                                                                <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate-600">
                                                                    {tech.technician_type}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="mt-1 truncate text-xs text-slate-500">
                                                            {tech.email ?? "-"}
                                                        </p>
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                                        Tidak ada teknisi yang cocok dengan
                                        pencarian.
                                    </div>
                                )}
                            </div>

                            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                    Batal
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                    {saving ? "Menyimpan..." : "Simpan"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
