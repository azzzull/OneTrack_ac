import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    AlertCircle,
    BadgeCheck,
    CalendarDays,
    ClipboardList,
    FolderKanban,
    Save,
    Send,
    UserRound,
} from "lucide-react";
import { useAuth } from "../../context/useAuth";
import BusinessTripAccommodationSection from "./BusinessTripAccommodationSection";
import BusinessTripAgendaList from "./BusinessTripAgendaList";
import { validateAccommodationRequest } from "./businessTripAccommodationModel";
import {
    createAgendaItem,
    getAgendaObjective,
    getAgendaTitle,
    normalizeAgenda,
} from "./businessTripAgendaModel";
import {
    BUSINESS_TRIP_STATUS,
    canTransitionBusinessTripStatus,
} from "./businessTripConstants";
import { useBusinessTripDraft } from "./BusinessTripDraftContext";
import BusinessTripLayout from "./BusinessTripLayout";
import {
    ActionFooter,
    Button,
    FormField,
    SectionCard,
} from "./BusinessTripShared";
import { businessTripUi } from "./businessTripUi";

const initiatorOptions = [
    { value: "self", label: "Saya" },
    { value: "management", label: "Management" },
    { value: "other", label: "Pihak Lain" },
];

const getCurrentUserName = (profile, user) =>
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
    user?.user_metadata?.full_name?.trim() ||
    user?.email ||
    "User Dummy";

const inputClass = (hasError = false) =>
    `${businessTripUi.input} ${hasError ? businessTripUi.inputError : ""}`;

const hasText = (value) => String(value ?? "").trim().length > 0;

const todayInputValue = () => {
    const date = new Date();
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 10);
};

const findDefaultOpportunityProject = (projects = []) =>
    projects.find((project) => {
        const projectName = String(project.project_name ?? "").trim().toUpperCase();
        return project.status !== "inactive" && projectName === "OPPORTUNITY";
    }) ?? null;

export default function BusinessTripRequestPage() {
    const { tripId } = useParams();
    const navigate = useNavigate();
    const { user, profile } = useAuth();
    const {
        businessTrips,
        loadBusinessTripById,
        loading,
        projects,
        refreshProjects,
        saveTripDraft,
        submitTripRequest,
        updateTrip,
    } = useBusinessTripDraft();
    const trip = businessTrips.find((item) => item.id === tripId);
    const [touched, setTouched] = useState({});
    const [toast, setToast] = useState("");
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [loadError, setLoadError] = useState("");

    const currentUserName = useMemo(
        () => getCurrentUserName(profile, user),
        [profile, user],
    );

    useEffect(() => {
        if (!tripId) return;
        if (trip) return;
        loadBusinessTripById(tripId).catch((fetchError) => {
            setLoadError(fetchError.message ?? "Detail Business Trip gagal dimuat.");
        });
    }, [loadBusinessTripById, trip, tripId]);

    useEffect(() => {
        if (projects.length > 0) return;
        refreshProjects().catch(() => {});
    }, [projects.length, refreshProjects]);

    useEffect(() => {
        if (!trip || trip.initiator !== "self" || trip.initiatorName) return;
        updateTrip(trip.id, {
            initiatorName: currentUserName,
            requesterName: trip.requesterName || currentUserName,
        });
    }, [currentUserName, trip, updateTrip]);

    useEffect(() => {
        if (!trip) return;
        const defaultProject = !trip.projectId
            ? findDefaultOpportunityProject(projects)
            : null;
        const nextTripDate =
            trip.dateMode === "single" && !trip.tripDate ? todayInputValue() : "";
        if (!defaultProject && !nextTripDate) return;

        updateTrip(trip.id, {
            ...(defaultProject ? { projectId: defaultProject.id } : {}),
            ...(nextTripDate ? { tripDate: nextTripDate } : {}),
        });
    }, [projects, trip, updateTrip]);

    if (!trip && loading) {
        return (
            <BusinessTripLayout
                title="Form Pengajuan"
                activeIcon={CalendarDays}
            >
                <SectionCard title="Memuat pengajuan">
                    <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
                </SectionCard>
            </BusinessTripLayout>
        );
    }

    if (!trip) {
        return (
            <BusinessTripLayout
                title="Form Pengajuan"
                activeIcon={CalendarDays}
            >
                <SectionCard title="Pengajuan tidak ditemukan">
                    <p className="text-sm leading-6 text-slate-500">
                        {loadError || "Data Business Trip tidak tersedia."}
                    </p>
                    <Button
                        tone="secondary"
                        onClick={() => navigate("/business-trip")}
                        className="mt-3"
                    >
                        Kembali
                    </Button>
                </SectionCard>
            </BusinessTripLayout>
        );
    }

    const filledAgendas = trip.agendas.filter((agenda) =>
        getAgendaTitle(agenda).trim(),
    );
    const hasDate =
        trip.dateMode === "single"
            ? Boolean(trip.tripDate)
            : Boolean(trip.startDate && trip.endDate);
    const hasTitle = hasText(trip.title);
    const hasProject = Boolean(trip.projectId);
    const hasInitiatorName =
        trip.initiator === "self" || hasText(trip.initiatorName);
    const hasAgenda = filledAgendas.length > 0;
    const hasValidAgendaDetail =
        hasAgenda &&
        trip.agendas.every(
            (agenda) =>
                hasText(getAgendaTitle(agenda)) &&
                hasText(getAgendaObjective(agenda)),
        );
    const accommodationError = validateAccommodationRequest(
        trip.accommodationRequest,
    );
    const canSubmit =
        hasDate &&
        hasTitle &&
        hasProject &&
        hasInitiatorName &&
        hasAgenda &&
        hasValidAgendaDetail &&
        !accommodationError;

    const showToast = (message) => {
        setToast(message);
        window.setTimeout(() => setToast(""), 2600);
    };

    const updateCurrentTrip = (patch) => {
        updateTrip(trip.id, (current) => ({ ...current, ...patch }));
    };

    const updateAccommodation = (accommodationRequest) => {
        setTouched((current) => ({ ...current, accommodation: true }));
        updateCurrentTrip({ accommodationRequest });
    };

    const changeInitiator = (value) => {
        updateCurrentTrip({
            initiator: value,
            initiatorName: value === "self" ? currentUserName : trip.initiatorName,
        });
    };

    const addAgenda = () => {
        setTouched((current) => ({ ...current, agendas: true }));
        updateCurrentTrip({
            agendas: [
                ...trip.agendas.map((agenda) => ({
                    ...normalizeAgenda(agenda),
                    expanded: false,
                })),
                createAgendaItem(),
            ],
        });
        showToast("Agenda baru ditambahkan.");
    };

    const updateAgenda = (agendaId, patch) => {
        setTouched((current) => ({ ...current, agendas: true }));
        updateCurrentTrip({
            agendas: trip.agendas.map((agenda) =>
                agenda.id === agendaId
                    ? { ...normalizeAgenda(agenda), ...patch }
                    : normalizeAgenda(agenda),
            ),
        });
    };

    const toggleAgenda = (agendaId) => {
        updateCurrentTrip({
            agendas: trip.agendas.map((agenda) =>
                agenda.id === agendaId
                    ? {
                          ...normalizeAgenda(agenda),
                          expanded: !agenda.expanded,
                      }
                    : normalizeAgenda(agenda),
            ),
        });
    };

    const removeAgenda = (agendaId) => {
        setTouched((current) => ({ ...current, agendas: true }));
        updateCurrentTrip({
            agendas: trip.agendas.filter((agenda) => agenda.id !== agendaId),
        });
        showToast("Agenda dihapus dari pengajuan.");
    };

    const saveDraft = async () => {
        setSaving(true);
        try {
            const draftTrip = {
                ...trip,
                initiatorName:
                    trip.initiator === "self"
                        ? trip.initiatorName || currentUserName
                        : trip.initiatorName,
                status:
                    trip.status === BUSINESS_TRIP_STATUS.REJECTED
                        ? BUSINESS_TRIP_STATUS.REJECTED
                        : BUSINESS_TRIP_STATUS.DRAFT,
            };
            await saveTripDraft(draftTrip);
            showToast("Draft pengajuan berhasil disimpan");
            window.setTimeout(() => navigate("/business-trip"), 500);
        } catch (saveError) {
            console.error("[BusinessTrip] save draft failed", saveError);
            showToast("Draft gagal disimpan. Periksa data lalu coba lagi.");
        } finally {
            setSaving(false);
        }
    };

    const requestSubmit = () => {
        setTouched({
            date: true,
            title: true,
            project: true,
            initiatorName: true,
            agendas: true,
            accommodation: true,
        });
        if (!canSubmit) return;
        setConfirmOpen(true);
    };

    const submitTrip = async () => {
        const nextStatus = BUSINESS_TRIP_STATUS.SUBMITTED;
        if (!canTransitionBusinessTripStatus(trip.status, nextStatus)) {
            setConfirmOpen(false);
            return;
        }

        setSubmitting(true);
        try {
            const submittedTrip = {
                ...trip,
                initiatorName:
                    trip.initiator === "self"
                        ? trip.initiatorName || currentUserName
                        : trip.initiatorName,
                agendas: trip.agendas.map((agenda) => ({
                    ...normalizeAgenda(agenda),
                    expanded: false,
                })),
            };
            await submitTripRequest(submittedTrip);
            setConfirmOpen(false);
            showToast("Pengajuan Business Trip berhasil dikirim");
            window.setTimeout(
                () =>
                    navigate(
                        `/business-trip?status=${encodeURIComponent(
                            BUSINESS_TRIP_STATUS.PENDING_APPROVAL,
                        )}`,
                    ),
                650,
            );
        } catch (submitError) {
            console.error("[BusinessTrip] submit failed", submitError);
            setConfirmOpen(false);
            showToast("Submit Trip gagal. Lengkapi data lalu coba lagi.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <BusinessTripLayout
            title="Form Pengajuan"
            description="Buat, edit draft, atau perbaiki pengajuan Business Trip dari satu form sederhana."
            activeIcon={CalendarDays}
        >
            <div className={businessTripUi.pageGap}>
                <SectionCard
                    icon={ClipboardList}
                    title="Pengajuan Business Trip"
                    description="Hasil dan foto tidak diisi di tahap pengajuan. Keduanya tersedia pada Laporan Realisasi."
                >
                    <div className="space-y-3">
                        <FormField
                            icon={BadgeCheck}
                            label="Business Trip No"
                            helper="Nomor otomatis dibuat sekali dan tidak berubah saat edit atau resubmit."
                        >
                            <input
                                value={trip.businessTripNo}
                                readOnly
                                className={`${inputClass(false)} font-bold tracking-wide text-slate-900`}
                            />
                        </FormField>

                        <FormField
                            icon={CalendarDays}
                            label="Tanggal Business Trip"
                            helper="Pilih single date atau range sesuai durasi perjalanan."
                            error={
                                touched.date && !hasDate
                                    ? "Tanggal Business Trip wajib diisi."
                                    : ""
                            }
                        >
                            <div className="mt-2.5 grid grid-cols-2 gap-1.5 rounded-lg bg-slate-100 p-1">
                                {[
                                    ["single", "Single Date"],
                                    ["range", "Date Range"],
                                ].map(([value, label]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() =>
                                            updateCurrentTrip({ dateMode: value })
                                        }
                                        className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${
                                            trip.dateMode === value
                                                ? "bg-white text-sky-600 shadow-sm"
                                                : "text-slate-500 hover:text-slate-700"
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>

                            {trip.dateMode === "single" ? (
                                <input
                                    type="date"
                                    value={trip.tripDate}
                                    onBlur={() =>
                                        setTouched((current) => ({
                                            ...current,
                                            date: true,
                                        }))
                                    }
                                    onChange={(event) =>
                                        updateCurrentTrip({
                                            tripDate: event.target.value,
                                        })
                                    }
                                    className={inputClass(touched.date && !hasDate)}
                                />
                            ) : (
                                <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                                    <label>
                                        <span className="text-xs font-semibold text-slate-500">
                                            Tanggal mulai
                                        </span>
                                        <input
                                            type="date"
                                            value={trip.startDate}
                                            onChange={(event) =>
                                                updateCurrentTrip({
                                                    startDate: event.target.value,
                                                })
                                            }
                                            className={inputClass(
                                                touched.date && !hasDate,
                                            )}
                                        />
                                    </label>
                                    <label>
                                        <span className="text-xs font-semibold text-slate-500">
                                            Tanggal selesai
                                        </span>
                                        <input
                                            type="date"
                                            min={trip.startDate || undefined}
                                            value={trip.endDate}
                                            onChange={(event) =>
                                                updateCurrentTrip({
                                                    endDate: event.target.value,
                                                })
                                            }
                                            className={inputClass(
                                                touched.date && !hasDate,
                                            )}
                                        />
                                    </label>
                                </div>
                            )}
                        </FormField>

                        <FormField
                            icon={ClipboardList}
                            label="Judul Business Trip"
                            error={
                                touched.title && !hasTitle
                                    ? "Judul Business Trip wajib diisi."
                                    : ""
                            }
                        >
                            <input
                                value={trip.title}
                                placeholder="Contoh: Kunjungan site customer Bandung"
                                onBlur={() =>
                                    setTouched((current) => ({
                                        ...current,
                                        title: true,
                                    }))
                                }
                                onChange={(event) =>
                                    updateCurrentTrip({ title: event.target.value })
                                }
                                className={inputClass(touched.title && !hasTitle)}
                            />
                        </FormField>

                        <FormField
                            icon={FolderKanban}
                            label="Project"
                            helper="Menggunakan source master project existing pada prototype."
                            error={
                                touched.project && !hasProject
                                    ? "Project wajib dipilih."
                                    : ""
                            }
                        >
                            <select
                                value={trip.projectId}
                                onChange={(event) =>
                                    updateCurrentTrip({
                                        projectId: event.target.value,
                                    })
                                }
                                className={inputClass(touched.project && !hasProject)}
                            >
                                <option value="">Pilih project</option>
                                {projects
                                    .filter((project) => project.status !== "inactive")
                                    .map((project) => (
                                        <option
                                            key={project.id}
                                            value={project.id}
                                        >
                                            {project.project_name}
                                        </option>
                                    ))}
                            </select>
                        </FormField>

                        <FormField
                            icon={UserRound}
                            label="Inisiator"
                            helper={
                                trip.initiator === "self"
                                    ? "Nama inisiator mengikuti user saat ini."
                                    : "Isi nama inisiator sesuai pihak yang meminta perjalanan."
                            }
                            error={
                                touched.initiatorName && !hasInitiatorName
                                    ? "Nama inisiator wajib diisi."
                                    : ""
                            }
                        >
                            <div className="mt-2.5 grid grid-cols-3 gap-1.5 rounded-lg bg-slate-100 p-1">
                                {initiatorOptions.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() =>
                                            changeInitiator(option.value)
                                        }
                                        className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition sm:text-[13px] ${
                                            trip.initiator === option.value
                                                ? "bg-white text-sky-600 shadow-sm"
                                                : "text-slate-500 hover:text-slate-700"
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                            <label className="mt-3 block">
                                <span className="text-[13px] font-semibold text-slate-700">
                                    Nama Inisiator
                                </span>
                                <input
                                    value={trip.initiatorName}
                                    readOnly={trip.initiator === "self"}
                                    placeholder="Masukkan nama inisiator"
                                    onChange={(event) =>
                                        updateCurrentTrip({
                                            initiatorName: event.target.value,
                                        })
                                    }
                                    className={inputClass(
                                        touched.initiatorName && !hasInitiatorName,
                                    )}
                                />
                            </label>
                        </FormField>

                        <FormField
                            icon={ClipboardList}
                            label="Rencana Agenda"
                            helper="Minimal satu agenda lengkap dibutuhkan saat pengajuan dikirim."
                            error={
                                touched.agendas && !hasAgenda
                                    ? "Minimal satu agenda wajib ditambahkan"
                                    : touched.agendas && !hasValidAgendaDetail
                                      ? "Nama dan deskripsi setiap agenda wajib diisi."
                                      : ""
                            }
                        >
                            <BusinessTripAgendaList
                                agendas={trip.agendas}
                                onAdd={addAgenda}
                                onRemove={removeAgenda}
                                onToggle={toggleAgenda}
                                onUpdate={updateAgenda}
                            />
                        </FormField>

                    </div>
                </SectionCard>

                <BusinessTripAccommodationSection
                    value={trip.accommodationRequest}
                    onChange={updateAccommodation}
                    error={accommodationError}
                    showError={touched.accommodation}
                />

                <ActionFooter>
                    <Button
                        tone="secondary"
                        icon={Save}
                        onClick={saveDraft}
                        disabled={saving || submitting}
                    >
                        Simpan Draft
                    </Button>
                    <Button
                        icon={!canSubmit ? AlertCircle : Send}
                        onClick={requestSubmit}
                        disabled={!canSubmit || saving || submitting}
                    >
                        Submit Trip
                    </Button>
                </ActionFooter>
            </div>

            {confirmOpen && (
                <div className="fixed inset-0 z-90 flex items-end bg-slate-950/40 p-4 md:items-center md:justify-center">
                    <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
                        <h3 className="text-base font-semibold text-slate-950">
                            Ajukan Business Trip?
                        </h3>
                        <p className="mt-2 text-[13px] leading-5 text-slate-500">
                            Pengajuan akan dikirim dan masuk status menunggu approval
                            pada list Business Trip.
                        </p>
                        <div className="mt-4 grid grid-cols-2 gap-2.5">
                            <Button
                                tone="secondary"
                                onClick={() => setConfirmOpen(false)}
                            >
                                Batal
                            </Button>
                            <Button
                                icon={Send}
                                onClick={submitTrip}
                                disabled={submitting}
                            >
                                {submitting ? "Mengirim..." : "Ajukan"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {toast && (
                <div className="fixed inset-x-4 top-5 z-80 mx-auto max-w-md rounded-xl bg-slate-950 px-4 py-2.5 text-center text-[13px] font-semibold text-white shadow-xl md:top-6">
                    {toast}
                </div>
            )}
        </BusinessTripLayout>
    );
}
