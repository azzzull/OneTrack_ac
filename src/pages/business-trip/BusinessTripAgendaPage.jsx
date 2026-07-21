import { ClipboardList, MapPinned } from "lucide-react";
import { useBusinessTripDraft } from "./BusinessTripDraftContext";
import {
    BusinessTripNumberField,
    EmptyState,
    SectionCard,
} from "./BusinessTripShared";
import { businessTripUi } from "./businessTripUi";
import BusinessTripLayout from "./BusinessTripLayout";
import { getAgendaObjective, getAgendaTitle } from "./businessTripAgendaModel";

export default function BusinessTripAgendaPage() {
    const { draft } = useBusinessTripDraft();
    const agendas = draft.agendas.filter((agenda) =>
        getAgendaTitle(agenda).trim(),
    );

    return (
        <BusinessTripLayout
            title="Agenda Business Trip"
            description="Daftar rencana agenda perjalanan dari form pengajuan. Belum memuat hasil atau foto realisasi."
            activeIcon={ClipboardList}
        >
            <div className={businessTripUi.pageGap}>
                <BusinessTripNumberField value={draft.businessTripNo} />

                <SectionCard icon={MapPinned} title="Rencana Agenda">
                    {agendas.length === 0 ? (
                        <EmptyState
                            icon={ClipboardList}
                            title="Belum ada agenda perjalanan"
                        />
                    ) : (
                        <div className="space-y-3">
                            {agendas.map((agenda, index) => (
                                <div
                                    key={agenda.id}
                                    className="rounded-xl border border-slate-200 bg-slate-50 p-3.5"
                                >
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                        Agenda {index + 1}
                                    </p>
                                    <p className="mt-1 text-sm font-semibold text-slate-900">
                                        {getAgendaTitle(agenda)}
                                    </p>
                                    <p className="mt-2 text-sm leading-6 text-slate-600">
                                        {getAgendaObjective(agenda) ||
                                            "Belum ada tujuan agenda."}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </SectionCard>
            </div>
        </BusinessTripLayout>
    );
}
