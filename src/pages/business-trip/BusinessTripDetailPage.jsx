import { useNavigate } from "react-router-dom";
import {
    CalendarDays,
    CheckCircle2,
    ClipboardList,
    FileText,
    Plane,
    RotateCcw,
    Send,
    XCircle,
} from "lucide-react";
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
    StatusTimeline,
} from "./BusinessTripShared";
import { businessTripUi } from "./businessTripUi";
import {
    BUSINESS_TRIP_STATUS,
    canTransitionBusinessTripStatus,
    isRealizationAvailable,
} from "./businessTripConstants";
import BusinessTripLayout from "./BusinessTripLayout";
import { getAgendaTitle } from "./businessTripAgendaModel";

const initiatorLabels = {
    self: "Saya",
    management: "Management",
    other: "Pihak Lain",
};

const formatDate = (draft) => {
    if (draft.dateMode === "range") {
        return `${draft.startDate || "-"} sampai ${draft.endDate || "-"}`;
    }
    return draft.tripDate || "-";
};

export default function BusinessTripDetailPage() {
    const navigate = useNavigate();
    const { draft, selectedProject, setDraft } = useBusinessTripDraft();

    const transitionTo = (nextStatus) => {
        setDraft((current) =>
            canTransitionBusinessTripStatus(current.status, nextStatus)
                ? { ...current, status: nextStatus }
                : current,
        );
    };

    const requestInfo = [
        ["Tanggal", formatDate(draft)],
        ["Judul", draft.title || "-"],
        [
            "Project",
            selectedProject
                ? `${selectedProject.project_name} - ${selectedProject.customer_name}`
                : "Belum dipilih",
        ],
        ["Inisiator", initiatorLabels[draft.initiator] ?? "-"],
        ["Pemohon", draft.requesterName || draft.initiatorName || "-"],
        ["Status Saat Ini", draft.status],
    ];

    return (
        <BusinessTripLayout
            title="Detail Business Trip"
            description="Pantau status perjalanan, timeline approval, dan akses laporan realisasi sesuai status dummy."
            activeIcon={Plane}
        >
            <div className={businessTripUi.pageGap}>
                <SectionCard
                    icon={ClipboardList}
                    title="Informasi Utama"
                    description="Business Trip No menjadi referensi utama untuk komunikasi dan pencarian."
                    trailing={<StatusBadge status={draft.status} />}
                >
                    <BusinessTripNumberField value={draft.businessTripNo} />
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {requestInfo.map(([label, value]) => (
                            <DetailRow key={label} label={label} value={value} />
                        ))}
                    </div>
                </SectionCard>

                <SectionCard
                    icon={CalendarDays}
                    title="Status Timeline"
                    description="Simulasi flow status Business Trip tanpa backend."
                >
                    <StatusTimeline status={draft.status} />
                </SectionCard>

                {draft.status === BUSINESS_TRIP_STATUS.REJECTED && (
                    <section className="rounded-xl border border-red-200 bg-red-50 p-4">
                        <h3 className="text-sm font-semibold text-red-800">
                            Alasan Penolakan
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-red-700">
                            {draft.rejectionReason}
                        </p>
                    </section>
                )}

                {isRealizationAvailable(draft.status) ? (
                    <SectionCard
                        icon={FileText}
                        title="Ringkasan Realisasi"
                        description="Data laporan akan tampil read-only setelah dikirim."
                    >
                        {draft.agendas.length === 0 ? (
                            <EmptyState
                                icon={ClipboardList}
                                title="Belum ada agenda perjalanan"
                            >
                                Ringkasan realisasi akan tampil setelah agenda
                                dibuat dan laporan diisi.
                            </EmptyState>
                        ) : (
                            <div className="space-y-3">
                                {draft.agendas.map((agenda, index) => (
                                <article
                                    key={agenda.id}
                                    className="rounded-xl border border-slate-200 bg-slate-50 p-3.5"
                                >
                                    <p className="text-xs font-semibold uppercase text-slate-500">
                                        Agenda {index + 1}
                                    </p>
                                    <p className="mt-1 text-sm font-semibold text-slate-950">
                                        {getAgendaTitle(agenda) ||
                                            "Agenda belum diberi nama"}
                                    </p>
                                    <p className="mt-2 text-sm leading-6 text-slate-600">
                                        {agenda.realization?.result ||
                                            "Laporan realisasi belum tersedia"}
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
                ) : (
                    <section className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center shadow-sm">
                        <FileText size={28} className="mx-auto text-slate-400" />
                        <p className="mt-2 text-sm font-semibold text-slate-700">
                            Laporan realisasi belum tersedia
                        </p>
                        <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">
                            Laporan realisasi belum diisi. Laporan dapat dibuat
                            setelah perjalanan berlangsung.
                        </p>
                    </section>
                )}

                <DetailActions
                    status={draft.status}
                    onEdit={() => navigate("/business-trip")}
                    onSubmit={() => transitionTo(BUSINESS_TRIP_STATUS.SUBMITTED)}
                    onResubmit={() =>
                        transitionTo(BUSINESS_TRIP_STATUS.SUBMITTED)
                    }
                    onPending={() =>
                        transitionTo(BUSINESS_TRIP_STATUS.PENDING_APPROVAL)
                    }
                    onApprove={() => transitionTo(BUSINESS_TRIP_STATUS.APPROVED)}
                    onReject={() => transitionTo(BUSINESS_TRIP_STATUS.REJECTED)}
                    onDisburse={() =>
                        transitionTo(BUSINESS_TRIP_STATUS.ADVANCE_DISBURSED)
                    }
                    onStartTrip={() =>
                        transitionTo(BUSINESS_TRIP_STATUS.IN_PROGRESS)
                    }
                    onRealization={() => navigate("/business-trip/realization")}
                    onComplete={() =>
                        transitionTo(BUSINESS_TRIP_STATUS.COMPLETED)
                    }
                />
            </div>
        </BusinessTripLayout>
    );
}

function DetailActions({
    status,
    onApprove,
    onComplete,
    onDisburse,
    onEdit,
    onPending,
    onRealization,
    onReject,
    onResubmit,
    onStartTrip,
    onSubmit,
}) {
    if (
        status === BUSINESS_TRIP_STATUS.SUBMITTED ||
        status === BUSINESS_TRIP_STATUS.PENDING_APPROVAL
    ) {
        return (
            <ActionPanel>
                <p className="col-span-2 text-center text-sm font-semibold text-slate-600">
                    Pengajuan sedang menunggu proses approval dummy.
                </p>
                {status === BUSINESS_TRIP_STATUS.SUBMITTED && (
                    <ActionButton onClick={onPending} icon={Send}>
                        Masuk Approval
                    </ActionButton>
                )}
                {status === BUSINESS_TRIP_STATUS.PENDING_APPROVAL && (
                    <>
                        <ActionButton onClick={onReject} icon={XCircle} tone="red">
                            Tolak
                        </ActionButton>
                        <ActionButton onClick={onApprove} icon={CheckCircle2}>
                            Setujui
                        </ActionButton>
                    </>
                )}
            </ActionPanel>
        );
    }

    if (status === BUSINESS_TRIP_STATUS.REJECTED) {
        return (
            <ActionPanel>
                <ActionButton onClick={onEdit} icon={RotateCcw} tone="neutral">
                    Edit
                </ActionButton>
                <ActionButton onClick={onResubmit} icon={Send}>
                    Ajukan Ulang
                </ActionButton>
            </ActionPanel>
        );
    }

    if (status === BUSINESS_TRIP_STATUS.APPROVED) {
        return (
            <ActionPanel>
                <p className="col-span-2 text-center text-sm font-semibold text-emerald-700">
                    Disetujui, menunggu pencairan uang muka.
                </p>
                <ActionButton onClick={onDisburse} icon={CheckCircle2}>
                    Cairkan Uang Muka
                </ActionButton>
            </ActionPanel>
        );
    }

    if (status === BUSINESS_TRIP_STATUS.ADVANCE_DISBURSED) {
        return (
            <ActionPanel>
                <p className="col-span-2 text-center text-sm font-semibold text-sky-600">
                    Uang muka dicairkan, perjalanan siap dilaksanakan.
                </p>
                <ActionButton onClick={onStartTrip} icon={Plane}>
                    Mulai Perjalanan
                </ActionButton>
            </ActionPanel>
        );
    }

    if (status === BUSINESS_TRIP_STATUS.IN_PROGRESS) {
        return (
            <ActionPanel>
                <ActionButton onClick={onRealization} icon={FileText}>
                    Isi Laporan Realisasi
                </ActionButton>
            </ActionPanel>
        );
    }

    if (status === BUSINESS_TRIP_STATUS.REALIZATION_SUBMITTED) {
        return (
            <ActionPanel>
                <p className="col-span-2 text-center text-sm font-semibold text-amber-700">
                    Laporan realisasi telah dikirim dan sedang menunggu
                    verifikasi.
                </p>
                <ActionButton onClick={onComplete} icon={CheckCircle2}>
                    Tandai Selesai
                </ActionButton>
            </ActionPanel>
        );
    }

    if (status === BUSINESS_TRIP_STATUS.COMPLETED) {
        return (
            <ActionPanel>
                <p className="col-span-2 text-center text-sm font-semibold text-emerald-700">
                    Business Trip selesai. Seluruh data tampil read-only.
                </p>
            </ActionPanel>
        );
    }

    return (
        <ActionPanel>
            <ActionButton onClick={onEdit} icon={RotateCcw} tone="neutral">
                Edit Pengajuan
            </ActionButton>
            <ActionButton onClick={onSubmit} icon={Send}>
                Ajukan
            </ActionButton>
        </ActionPanel>
    );
}

function ActionPanel({ children }) {
    return (
        <ActionFooter>
            {children}
        </ActionFooter>
    );
}

function ActionButton({ children, icon: Icon, onClick, tone = "primary" }) {
    return (
        <Button
            icon={Icon}
            onClick={onClick}
            tone={tone === "red" ? "danger" : tone === "neutral" ? "secondary" : "primary"}
        >
            {children}
        </Button>
    );
}
