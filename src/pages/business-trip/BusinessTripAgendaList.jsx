import {
    ChevronDown,
    ChevronUp,
    ClipboardList,
    Plus,
    Trash2,
} from "lucide-react";
import { businessTripUi } from "./businessTripUi";
import { Button, EmptyState } from "./BusinessTripShared";
import { getAgendaObjective, getAgendaTitle } from "./businessTripAgendaModel";

const agendaInputClass = businessTripUi.input;
const agendaTextareaClass = `${businessTripUi.textarea} min-h-20`;

export default function BusinessTripAgendaList({
    agendas,
    error,
    onAdd,
    onRemove,
    onToggle,
    onUpdate,
}) {
    return (
        <div className="mt-2.5 space-y-2.5">
            {agendas.length === 0 ? (
                <EmptyState
                    icon={ClipboardList}
                    title="Belum ada agenda perjalanan"
                >
                    Tambahkan rencana meeting, survey, training, atau aktivitas
                    utama dalam business trip ini.
                </EmptyState>
            ) : (
                agendas.map((agenda, index) => (
                    <PlanningAgendaCard
                        key={agenda.id}
                        agenda={agenda}
                        index={index}
                        onRemove={onRemove}
                        onToggle={onToggle}
                        onUpdate={onUpdate}
                    />
                ))
            )}

            {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
                    {error}
                </p>
            )}

            <Button
                tone="secondary"
                icon={Plus}
                onClick={onAdd}
                className="w-full border-sky-200 bg-sky-50 text-sky-600 hover:bg-sky-100"
            >
                Tambah Agenda
            </Button>
        </div>
    );
}

function PlanningAgendaCard({ agenda, index, onRemove, onToggle, onUpdate }) {
    const title = getAgendaTitle(agenda);
    const objective = getAgendaObjective(agenda);

    return (
        <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-sky-100">
            <div className="flex items-start gap-2 border-b border-slate-100 bg-slate-50/80 p-2.5">
                <button
                    type="button"
                    onClick={() => onToggle(agenda.id)}
                    className="flex min-w-0 flex-1 items-start gap-2.5 rounded-lg text-left focus:outline-none focus:ring-4 focus:ring-sky-100"
                    aria-expanded={agenda.expanded}
                >
                    <span className="mt-0.5 rounded-lg bg-sky-50 p-2 text-sky-500">
                        <ClipboardList size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-semibold uppercase text-slate-500">
                            Agenda {index + 1}
                        </span>
                        <span className="mt-0.5 block truncate text-[13px] font-semibold text-slate-900">
                            {title.trim() || "Agenda belum diberi nama"}
                        </span>
                        {!agenda.expanded && (
                            <span className="mt-1 block truncate text-xs text-slate-500">
                                {objective ||
                                    "Klik untuk melihat atau mengedit rencana agenda."}
                            </span>
                        )}
                    </span>
                    <span className="mt-2 text-slate-400">
                        {agenda.expanded ? (
                            <ChevronUp size={17} />
                        ) : (
                            <ChevronDown size={17} />
                        )}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => onRemove(agenda.id)}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-4 focus:ring-red-100"
                    aria-label={`Hapus agenda ${index + 1}`}
                    title="Hapus agenda"
                >
                    <Trash2 size={16} />
                </button>
            </div>

            {agenda.expanded && (
                <div className="space-y-2.5 p-3">
                    <label className="block">
                        <span className="text-[13px] font-semibold text-slate-700">
                            Nama Agenda
                        </span>
                        <input
                            type="text"
                            value={title}
                            placeholder="Contoh: Meeting kickoff dengan customer"
                            onChange={(event) =>
                                onUpdate(agenda.id, { title: event.target.value })
                            }
                            className={agendaInputClass}
                        />
                    </label>

                    <label className="block">
                        <span className="text-[13px] font-semibold text-slate-700">
                            Deskripsi / Tujuan Agenda
                        </span>
                        <textarea
                            value={objective}
                            placeholder="Jelaskan tujuan agenda, pihak yang ditemui, atau aktivitas yang akan dilakukan."
                            onChange={(event) =>
                                onUpdate(agenda.id, {
                                    objective: event.target.value,
                                })
                            }
                            className={agendaTextareaClass}
                        />
                    </label>
                </div>
            )}
        </article>
    );
}
