import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    AlertCircle,
    CalendarDays,
    ClipboardList,
    FileCheck2,
    FolderKanban,
    Send,
    UserRound,
} from "lucide-react";
import { useBusinessTripDraft } from "./BusinessTripDraftContext";
import {
    BusinessTripNumberField,
    ActionFooter,
    Button,
    DetailRow,
    EmptyState,
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
import {
    formatAccommodationAmount,
    hasAccommodationRequest,
} from "./businessTripAccommodationModel";

const initiatorLabels = {
    self: "Saya",
    management: "Management",
    other: "Pihak Lain",
};

const displayValue = (value, fallback = "-") => value || fallback;
const hasText = (value) => String(value ?? "").trim().length > 0;

const formatDate = (draft) => {
    if (draft.dateMode === "range") {
        if (!draft.startDate && !draft.endDate) return "-";
        return `${displayValue(draft.startDate)} sampai ${displayValue(
            draft.endDate,
        )}`;
    }
    return displayValue(draft.tripDate);
};

export default function BusinessTripReviewPage() {
    const navigate = useNavigate();
    const { draft, selectedProject, setDraft } = useBusinessTripDraft();
    const [toast, setToast] = useState("");
    const [confirmOpen, setConfirmOpen] = useState(false);

    const agendas = useMemo(
        () =>
            draft.agendas.filter((agenda) =>
                getAgendaTitle(agenda).trim(),
            ),
        [draft.agendas],
    );
    const hasReviewData = Boolean(hasText(draft.title) && agendas.length > 0);

    const reviewItems = [
        {
            label: "Tanggal Business Trip",
            value: formatDate(draft),
            icon: CalendarDays,
        },
        {
            label: "Judul Business Trip",
            value: displayValue(draft.title),
            icon: ClipboardList,
        },
        {
            label: "Project",
            value: selectedProject
                ? `${selectedProject.project_name} - ${selectedProject.customer_name}`
                : "Belum dipilih",
            icon: FolderKanban,
        },
        {
            label: "Inisiator",
            value: initiatorLabels[draft.initiator] ?? "-",
            icon: UserRound,
        },
        {
            label: "Nama Inisiator",
            value: displayValue(draft.initiatorName),
            icon: UserRound,
        },
    ];

    const showToast = (message) => {
        setToast(message);
        window.setTimeout(() => setToast(""), 2800);
    };

    const submitBusinessTrip = () => {
        if (!hasReviewData) return;

        const nextStatus = BUSINESS_TRIP_STATUS.SUBMITTED;
        if (!canTransitionBusinessTripStatus(draft.status, nextStatus)) return;

        setDraft((current) => ({
            ...current,
            status: nextStatus,
        }));

        window.setTimeout(() => {
            setDraft((current) =>
                canTransitionBusinessTripStatus(
                    current.status,
                    BUSINESS_TRIP_STATUS.PENDING_APPROVAL,
                )
                    ? {
                          ...current,
                          status: BUSINESS_TRIP_STATUS.PENDING_APPROVAL,
                      }
                    : current,
            );
        }, 600);

        showToast("Business Trip diajukan dan masuk simulasi approval.");
        setConfirmOpen(false);
    };

    const requestSubmitBusinessTrip = () => {
        if (!hasReviewData) return;
        setConfirmOpen(true);
    };

    return (
        <BusinessTripLayout
            title="Review Pengajuan"
            description="Periksa kembali rencana Business Trip sebelum menekan tombol final Ajukan. Data masih berupa state lokal."
            activeIcon={FileCheck2}
        >
            <div className={businessTripUi.pageGap}>
                {!hasReviewData && (
                    <section className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                        <div className="flex gap-3">
                            <span className="rounded-lg bg-white p-2.5 text-amber-600 shadow-sm">
                                <AlertCircle size={19} />
                            </span>
                            <div>
                                <h3 className="text-sm font-semibold text-amber-900">
                                    Data review belum lengkap
                                </h3>
                                <p className="mt-1 text-xs leading-5 text-amber-700">
                                    Isi halaman pengajuan terlebih dahulu agar ringkasan
                                    review menampilkan data yang siap diajukan.
                                </p>
                            </div>
                        </div>
                    </section>
                )}

                <SectionCard
                    icon={FileCheck2}
                    title="Informasi Business Trip"
                    description="Ringkasan utama pengajuan sebelum final submit."
                    trailing={<StatusBadge status={draft.status} />}
                >
                    <BusinessTripNumberField value={draft.businessTripNo} />
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {reviewItems.map((item) => (
                            <DetailRow
                                key={item.label}
                                label={item.label}
                                value={item.value}
                            />
                        ))}
                    </div>
                </SectionCard>

                <SectionCard
                    icon={ClipboardList}
                    title="Rencana Agenda"
                    description="Agenda yang direncanakan untuk perjalanan ini."
                >

                    {agendas.length === 0 ? (
                        <EmptyState
                            icon={ClipboardList}
                            title="Belum ada agenda perjalanan"
                        />
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
                                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
                                        {getAgendaObjective(agenda) ||
                                            "Belum ada tujuan agenda."}
                                    </p>
                                </article>
                            ))}
                        </div>
                    )}
                </SectionCard>

                <SectionCard
                    icon={FileCheck2}
                    title="Pengajuan Akomodasi"
                >
                    {hasAccommodationRequest(draft.accommodationRequest) ? (
                        <DetailRow
                            label="Requested Amount"
                            value={formatAccommodationAmount(
                                draft.accommodationRequest.requestedAmount,
                            )}
                        />
                    ) : (
                        <p className="rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500">
                            Tidak mengajukan dana akomodasi
                        </p>
                    )}
                </SectionCard>

                <ActionFooter>
                        <Button
                            tone="secondary"
                            onClick={() => navigate("/business-trip")}
                        >
                            Kembali Edit
                        </Button>
                        <Button
                            icon={Send}
                            onClick={requestSubmitBusinessTrip}
                            disabled={!hasReviewData}
                        >
                            Ajukan Business Trip
                        </Button>
                </ActionFooter>
            </div>

            {toast && (
                <div className="fixed inset-x-4 top-5 z-80 mx-auto max-w-md rounded-2xl bg-slate-950 px-4 py-3 text-center text-sm font-semibold text-white shadow-xl md:top-6">
                    {toast}
                </div>
            )}

            {confirmOpen && (
                <div className="fixed inset-0 z-90 flex items-end bg-slate-950/40 p-4 md:items-center md:justify-center">
                    <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
                        <h3 className="text-base font-semibold text-slate-950">
                            Ajukan Business Trip?
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                            Pengajuan akan masuk ke simulasi approval. Data
                            masih tersimpan di state lokal dan belum dikirim ke
                            backend.
                        </p>
                        <div className="mt-5 grid grid-cols-2 gap-3">
                            <Button
                                tone="secondary"
                                onClick={() => setConfirmOpen(false)}
                            >
                                Batal
                            </Button>
                            <Button icon={Send} onClick={submitBusinessTrip}>
                                Ajukan
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </BusinessTripLayout>
    );
}
