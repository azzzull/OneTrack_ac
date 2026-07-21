import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, FileText, Send } from "lucide-react";
import { useBusinessTripDraft } from "./BusinessTripDraftContext";
import {
    ActionFooter,
    Button,
    BusinessTripNumberField,
    DetailRow,
    EmptyState,
    PhotoPreviewGrid,
    SectionCard,
    StatusBadge,
} from "./BusinessTripShared";
import { businessTripUi } from "./businessTripUi";
import {
    BUSINESS_TRIP_STATUS,
    canTransitionBusinessTripStatus,
} from "./businessTripConstants";
import BusinessTripLayout from "./BusinessTripLayout";
import { getAgendaObjective, getAgendaTitle } from "./businessTripAgendaModel";

const formatDate = (draft) =>
    draft.dateMode === "range"
        ? `${draft.startDate || "-"} sampai ${draft.endDate || "-"}`
        : draft.tripDate || "-";

export default function BusinessTripRealizationReviewPage() {
    const navigate = useNavigate();
    const { draft, selectedProject, setDraft } = useBusinessTripDraft();
    const agendas = useMemo(
        () =>
            draft.agendas.filter((agenda) =>
                getAgendaTitle(agenda).trim(),
            ),
        [draft.agendas],
    );
    const locked = [
        BUSINESS_TRIP_STATUS.REALIZATION_SUBMITTED,
        BUSINESS_TRIP_STATUS.COMPLETED,
    ].includes(draft.status);

    const submitRealization = () => {
        setDraft((current) =>
            canTransitionBusinessTripStatus(
                current.status,
                BUSINESS_TRIP_STATUS.REALIZATION_SUBMITTED,
            )
                ? {
                      ...current,
                      status: BUSINESS_TRIP_STATUS.REALIZATION_SUBMITTED,
                  }
                : current,
        );
    };

    return (
        <BusinessTripLayout
            title="Review Laporan Realisasi"
            description="Ringkasan laporan realisasi per agenda sebelum atau sesudah dikirim untuk verifikasi."
            activeIcon={FileText}
        >
            <div className={businessTripUi.pageGap}>
                <SectionCard
                    title="Informasi Business Trip"
                    description="Business Trip No tetap sama sejak draft pengajuan."
                    trailing={<StatusBadge status={draft.status} />}
                >
                    <BusinessTripNumberField value={draft.businessTripNo} />
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <DetailRow label="Tanggal" value={formatDate(draft)} />
                        <DetailRow label="Judul" value={draft.title} />
                        <DetailRow
                            label="Project"
                            value={
                                selectedProject
                                    ? `${selectedProject.project_name} - ${selectedProject.customer_name}`
                                    : "Belum dipilih"
                            }
                        />
                        <DetailRow
                            label="Pemohon"
                            value={draft.requesterName || draft.initiatorName}
                        />
                    </div>
                </SectionCard>

                <SectionCard
                    icon={ClipboardList}
                    title="Hasil Realisasi per Agenda"
                    description="Hasil, jumlah foto, dan thumbnail bukti kunjungan."
                >

                    {agendas.length === 0 ? (
                        <EmptyState
                            icon={ClipboardList}
                            title="Laporan realisasi belum tersedia"
                        >
                            Laporan dapat direview setelah agenda dibuat dan
                            hasil realisasi diisi.
                        </EmptyState>
                    ) : (
                        <div className="space-y-3">
                            {agendas.map((agenda, index) => (
                            <article
                                key={agenda.id}
                                className="rounded-xl border border-slate-200 bg-slate-50 p-3.5"
                            >
                                <p className="text-xs font-semibold uppercase text-slate-500">
                                    Agenda {index + 1}
                                </p>
                                <p className="mt-1 text-sm font-semibold text-slate-950">
                                    {getAgendaTitle(agenda)}
                                </p>
                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                    Tujuan: {getAgendaObjective(agenda) || "-"}
                                </p>
                                <p className="mt-2 text-sm leading-6 text-slate-700">
                                    Hasil:{" "}
                                    {agenda.realization?.result ||
                                        "Belum ada hasil realisasi."}
                                </p>
                                <p className="mt-2 text-xs font-semibold uppercase text-slate-500">
                                    Jumlah Foto:{" "}
                                    {(agenda.realization?.photos ?? []).length}
                                </p>
                                <PhotoPreviewGrid
                                    photos={agenda.realization?.photos ?? []}
                                    readOnly
                                />
                            </article>
                            ))}
                        </div>
                    )}
                </SectionCard>

                <ActionFooter>
                    <Button
                        tone="secondary"
                        onClick={() => navigate("/business-trip/realization")}
                        disabled={locked}
                    >
                        Kembali Edit
                    </Button>
                    <Button
                        icon={Send}
                        onClick={submitRealization}
                        disabled={locked}
                    >
                        Kirim Laporan Realisasi
                    </Button>
                </ActionFooter>
            </div>
        </BusinessTripLayout>
    );
}
