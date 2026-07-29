import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    AlertCircle,
    ClipboardList,
    FileText,
    Save,
    Send,
    WalletCards,
} from "lucide-react";
import { useBusinessTripDraft } from "./BusinessTripDraftContext";
import {
    ActionFooter,
    Button,
    BusinessTripNumberField,
    DetailRow,
    EmptyState,
    PhotoPreviewGrid,
    PhotoUpload,
    SectionCard,
    StatusBadge,
} from "./BusinessTripShared";
import { businessTripUi } from "./businessTripUi";
import {
    BUSINESS_TRIP_STATUS,
    isRealizationAvailable,
} from "./businessTripConstants";
import BusinessTripLayout from "./BusinessTripLayout";
import {
    getAgendaObjective,
    getAgendaTitle,
    normalizeAgenda,
} from "./businessTripAgendaModel";
import {
    deleteBusinessTripAgendaPhoto,
    saveBusinessTripRealizationDraft,
    submitBusinessTripRealization,
    uploadBusinessTripAgendaPhoto,
} from "../../services/businessTripService";
import {
    formatAccommodationAmount,
    parseAccommodationAmount,
} from "./businessTripAccommodationModel";

const formatDate = (draft) =>
    draft.dateMode === "range"
        ? `${draft.startDate || "-"} sampai ${draft.endDate || "-"}`
        : draft.tripDate || "-";

const initiatorLabels = {
    self: "Saya",
    management: "Management",
    other: "Pihak Lain",
};

const hasText = (value) => String(value ?? "").trim().length > 0;

export default function BusinessTripRealizationPage() {
    const { tripId } = useParams();
    const navigate = useNavigate();
    const {
        businessTrips,
        getProjectById,
        loadBusinessTripById,
        loading,
        updateTrip,
    } = useBusinessTripDraft();
    const contextTrip = businessTrips.find((item) => item.id === tripId);
    const [detailTrip, setDetailTrip] = useState(null);
    const [touched, setTouched] = useState({});
    const [toast, setToast] = useState("");
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [saving, setSaving] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [uploadingAgendaId, setUploadingAgendaId] = useState("");
    const loadedTripIdRef = useRef("");
    const trip = detailTrip?.id === tripId ? detailTrip : contextTrip;

    useEffect(() => {
        if (!tripId || loadedTripIdRef.current === tripId) return;
        loadedTripIdRef.current = tripId;
        loadBusinessTripById(tripId)
            .then((loadedTrip) => {
                setDetailTrip(loadedTrip);
            })
            .catch((error) => {
                console.error("[BusinessTrip] realization load failed", error);
                setLoadError("Gagal memuat laporan realisasi.");
                loadedTripIdRef.current = "";
            });
    }, [loadBusinessTripById, tripId]);

    if (!trip && loading) {
        return (
            <BusinessTripLayout title="Laporan Realisasi" activeIcon={FileText}>
                <SectionCard title="Memuat laporan realisasi">
                    <div className="h-28 animate-pulse rounded-xl bg-slate-100" />
                </SectionCard>
            </BusinessTripLayout>
        );
    }

    if (!trip) {
        return (
            <BusinessTripLayout title="Laporan Realisasi" activeIcon={FileText}>
                <SectionCard title="Laporan tidak tersedia">
                    <p className="text-sm leading-6 text-slate-500">
                        {loadError || "Data Business Trip tidak ditemukan."}
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

    const selectedProject = getProjectById(trip.projectId);
    const readOnly = [
        BUSINESS_TRIP_STATUS.REALIZATION_SUBMITTED,
        BUSINESS_TRIP_STATUS.PENDING_REFUND,
        BUSINESS_TRIP_STATUS.PENDING_ADDITIONAL_PAYMENT,
        BUSINESS_TRIP_STATUS.COMPLETED,
    ].includes(trip.status);
    const canOpenRealization = isRealizationAvailable(trip.status);
    const editable = [
        BUSINESS_TRIP_STATUS.IN_PROGRESS,
        BUSINESS_TRIP_STATUS.REALIZATION_DRAFT,
        BUSINESS_TRIP_STATUS.REALIZATION_REVISION_REQUIRED,
    ].includes(trip.status);

    const agendas = trip.agendas
        .map(normalizeAgenda)
        .filter((agenda) => getAgendaTitle(agenda).trim());

    const agendaValidation = agendas.reduce((acc, agenda) => {
        acc[agenda.id] = {
            amount: Number(agenda.realization?.realizedAmount ?? 0) < 0,
            result: !hasText(agenda.realization?.result),
            photos: (agenda.realization?.photos ?? []).length === 0,
        };
        return acc;
    }, {});

    const showToast = (message) => {
        setToast(message);
        window.setTimeout(() => setToast(""), 2600);
    };

    const getRealizationSnapshot = () => ({
        ...trip,
        agendas,
    });

    const applyTripUpdate = (updater) => {
        setDetailTrip((current) => {
            if (!current || current.id !== trip.id) return current;
            return typeof updater === "function"
                ? updater(current)
                : { ...current, ...updater };
        });
        updateTrip(trip.id, updater);
    };

    const updateRealization = (agendaId, patch) => {
        applyTripUpdate((current) => ({
            ...current,
            agendas: current.agendas.map((agenda) => {
                const normalizedAgenda = normalizeAgenda(agenda);
                return normalizedAgenda.id === agendaId
                    ? {
                          ...normalizedAgenda,
                          realization: {
                              ...(normalizedAgenda.realization ?? {}),
                              ...patch,
                          },
                      }
                    : normalizedAgenda;
            }),
        }));
    };

    const addPhotos = async (agendaId, event) => {
        const files = Array.from(event.target.files ?? []);
        if (files.length === 0) return;
        const agenda = agendas.find((item) => item.id === agendaId);
        const currentPhotos = agenda?.realization?.photos ?? [];
        setUploadingAgendaId(agendaId);
        try {
            const uploadedPhotos = [];
            for (const file of files) {
                const photo = await uploadBusinessTripAgendaPhoto({
                    agendaId,
                    businessTripId: trip.id,
                    existingCount: currentPhotos.length + uploadedPhotos.length,
                    file,
                });
                uploadedPhotos.push(photo);
            }
            updateRealization(agendaId, {
                photos: [...currentPhotos, ...uploadedPhotos],
            });
            setTouched((current) => ({
                ...current,
                [agendaId]: {
                    ...current[agendaId],
                    photos: false,
                },
            }));
            showToast(`${uploadedPhotos.length} foto bukti kunjungan diunggah.`);
        } catch (uploadError) {
            console.error("[BusinessTrip] upload photo failed", uploadError);
            showToast(uploadError.message || "Gagal mengunggah foto.");
        } finally {
            setUploadingAgendaId("");
        }
        event.target.value = "";
    };

    const removePhoto = async (agendaId, photoId) => {
        const agenda = agendas.find((item) => item.id === agendaId);
        const photo = agenda?.realization?.photos?.find(
            (item) => item.id === photoId,
        );
        try {
            await deleteBusinessTripAgendaPhoto(photo);
            updateRealization(agendaId, {
                photos: (agenda?.realization?.photos ?? []).filter(
                    (item) => item.id !== photoId,
                ),
            });
            showToast("Foto bukti kunjungan dihapus.");
        } catch (deleteError) {
            console.error("[BusinessTrip] delete photo failed", deleteError);
            showToast(deleteError.message || "Gagal menghapus foto.");
        }
    };

    const saveDraft = async () => {
        setSaving(true);
        try {
            const savedTrip = await saveBusinessTripRealizationDraft({
                trip: getRealizationSnapshot(),
            });
            setDetailTrip(savedTrip);
            updateTrip(trip.id, savedTrip);
            showToast("Draft laporan realisasi berhasil disimpan");
            window.setTimeout(() => navigate("/business-trip"), 550);
        } catch (saveError) {
            console.error("[BusinessTrip] save realization draft failed", saveError);
            showToast(saveError.message || "Gagal menyimpan draft realisasi.");
        } finally {
            setSaving(false);
        }
    };

    const validate = () => {
        const nextTouched = {};
        let valid = true;

        agendas.forEach((agenda) => {
            const invalid = agendaValidation[agenda.id];
            nextTouched[agenda.id] = {
                amount: invalid.amount,
                result: invalid.result,
                photos: invalid.photos,
            };
            if (invalid.result || invalid.photos || invalid.amount) valid = false;
        });

        setTouched(nextTouched);
        return valid;
    };

    const requestSubmit = () => {
        if (!validate()) return;
        setConfirmOpen(true);
    };

    const submitRealization = async () => {
        setSubmitting(true);
        try {
            await saveBusinessTripRealizationDraft({
                trip: getRealizationSnapshot(),
            });
            const submittedTrip = await submitBusinessTripRealization(trip.id);
            setDetailTrip(submittedTrip);
            updateTrip(trip.id, submittedTrip);
            setConfirmOpen(false);
            showToast("Laporan realisasi berhasil dikirim dan menunggu verifikasi");
            window.setTimeout(() => navigate("/business-trip"), 650);
        } catch (submitError) {
            console.error("[BusinessTrip] submit realization failed", submitError);
            showToast(submitError.message || "Gagal mengirim laporan realisasi.");
            setConfirmOpen(false);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <BusinessTripLayout
            title="Laporan Realisasi"
            description="Isi hasil aktual dan foto bukti kunjungan dari agenda pengajuan."
            activeIcon={FileText}
        >
            <div className={businessTripUi.pageGap}>
                {!canOpenRealization && (
                    <section className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                        <div className="flex gap-3">
                            <AlertCircle
                                size={20}
                                className="mt-0.5 text-amber-600"
                            />
                            <p className="text-sm leading-6 text-amber-800">
                                Laporan realisasi dapat dibuat setelah status
                                Perjalanan Berlangsung.
                            </p>
                        </div>
                    </section>
                )}

                <SectionCard
                    title="Informasi Business Trip"
                    description="Ringkasan read-only dari pengajuan awal."
                    trailing={<StatusBadge status={trip.status} />}
                >
                    <BusinessTripNumberField value={trip.businessTripNo} />
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <DetailRow label="Tanggal Business Trip" value={formatDate(trip)} />
                        <DetailRow label="Judul" value={trip.title} />
                        <DetailRow
                            label="Project"
                            value={
                                selectedProject
                                    ? `${selectedProject.project_name} - ${selectedProject.customer_name}`
                                    : "Belum dipilih"
                            }
                        />
                        <DetailRow
                            label="Inisiator"
                            value={initiatorLabels[trip.initiator] ?? "-"}
                        />
                        <DetailRow label="Pemohon" value={trip.requesterName} />
                        <DetailRow label="Status" value={trip.status} />
                    </div>
                </SectionCard>

                <SectionCard
                    icon={ClipboardList}
                    title="Realisasi per Agenda"
                    description="Agenda berasal dari pengajuan awal. User tidak perlu membuat ulang agenda."
                >
                    {trip.realizationRevisionNote && (
                        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800">
                            <span className="font-semibold">Catatan revisi: </span>
                            {trip.realizationRevisionNote}
                        </div>
                    )}
                    {agendas.length === 0 ? (
                        <EmptyState
                            icon={ClipboardList}
                            title="Belum ada agenda perjalanan"
                        >
                            Tambahkan agenda pada pengajuan sebelum mengisi
                            laporan realisasi.
                        </EmptyState>
                    ) : (
                        <div className="space-y-4">
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
                                        {getAgendaObjective(agenda) ||
                                            "Belum ada tujuan agenda."}
                                    </p>

                                    <label className="mt-4 block">
                                        <span className="text-sm font-semibold text-slate-700">
                                            Hasil Business Trip
                                        </span>
                                        <textarea
                                            value={agenda.realization?.result ?? ""}
                                            readOnly={readOnly || !editable}
                                            placeholder="Tuliskan hasil, kesimpulan, keputusan, atau tindak lanjut dari agenda ini"
                                            maxLength={1200}
                                            onBlur={() =>
                                                setTouched((current) => ({
                                                    ...current,
                                                    [agenda.id]: {
                                                        ...current[agenda.id],
                                                        result: true,
                                                    },
                                                }))
                                            }
                                            onChange={(event) =>
                                                updateRealization(agenda.id, {
                                                    result: event.target.value,
                                                })
                                            }
                                            className={businessTripUi.textarea}
                                        />
                                        <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                                            <span className="text-slate-400">
                                                {(agenda.realization?.result ?? "").length}
                                                /1200
                                            </span>
                                            {touched[agenda.id]?.result &&
                                                agendaValidation[agenda.id]?.result && (
                                                <span className="font-semibold text-red-600">
                                                    Hasil business trip wajib diisi
                                                </span>
                                            )}
                                        </div>
                                    </label>

                                    <label className="mt-4 block">
                                        <span className="text-sm font-semibold text-slate-700">
                                            Realisasi Biaya
                                        </span>
                                        <input
                                            value={formatAccommodationAmount(
                                                agenda.realization?.realizedAmount ?? 0,
                                            )}
                                            readOnly={readOnly || !editable}
                                            inputMode="numeric"
                                            onBlur={() =>
                                                setTouched((current) => ({
                                                    ...current,
                                                    [agenda.id]: {
                                                        ...current[agenda.id],
                                                        amount: true,
                                                    },
                                                }))
                                            }
                                            onChange={(event) =>
                                                updateRealization(agenda.id, {
                                                    realizedAmount: parseAccommodationAmount(
                                                        event.target.value,
                                                    ),
                                                })
                                            }
                                            className={businessTripUi.input}
                                        />
                                        {touched[agenda.id]?.amount &&
                                            agendaValidation[agenda.id]?.amount && (
                                            <p className="mt-2 text-xs font-semibold text-red-600">
                                                Realisasi biaya tidak boleh negatif
                                            </p>
                                        )}
                                    </label>

                                    <div className="mt-4">
                                        <p className="text-sm font-semibold text-slate-700">
                                            Upload Foto Bukti Kunjungan
                                        </p>
                                        <p className="mt-1 text-xs leading-5 text-slate-500">
                                            Tambahkan satu atau beberapa foto sebagai
                                            bukti pelaksanaan agenda.
                                        </p>
                                        {!readOnly && editable && (
                                            <PhotoUpload
                                                inputId={`realization-photo-${agenda.id}`}
                                                disabled={uploadingAgendaId === agenda.id}
                                                onAddPhotos={(event) =>
                                                    addPhotos(agenda.id, event)
                                                }
                                            />
                                        )}
                                        {uploadingAgendaId === agenda.id && (
                                            <p className="mt-2 text-xs font-semibold text-sky-600">
                                                Mengunggah foto...
                                            </p>
                                        )}
                                        <PhotoPreviewGrid
                                            photos={agenda.realization?.photos ?? []}
                                            readOnly={readOnly || !editable}
                                            onRemove={(photoId) =>
                                                removePhoto(agenda.id, photoId)
                                            }
                                        />
                                        {touched[agenda.id]?.photos &&
                                            agendaValidation[agenda.id]?.photos && (
                                            <p className="mt-2 text-xs font-semibold text-red-600">
                                                Minimal satu foto bukti kunjungan
                                                wajib ditambahkan
                                            </p>
                                        )}
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </SectionCard>

                {[
                    BUSINESS_TRIP_STATUS.PENDING_REFUND,
                    BUSINESS_TRIP_STATUS.PENDING_ADDITIONAL_PAYMENT,
                    BUSINESS_TRIP_STATUS.COMPLETED,
                ].includes(trip.status) && (
                    <SectionCard icon={WalletCards} title="Settlement Business Trip">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <DetailRow
                                label="Requested Amount"
                                value={formatAccommodationAmount(
                                    trip.accommodationRequest?.requestedAmount ?? 0,
                                )}
                            />
                            <DetailRow
                                label="Disbursed Amount"
                                value={formatAccommodationAmount(
                                    trip.disbursedAmount ??
                                        trip.advanceDisbursement?.amount ??
                                        0,
                                )}
                            />
                            <DetailRow
                                label="Total Realisasi"
                                value={formatAccommodationAmount(
                                    trip.totalRealizationAmount ?? 0,
                                )}
                            />
                            <DetailRow
                                label={
                                    Number(trip.settlementDifference ?? 0) > 0
                                        ? "Sisa Pengembalian"
                                        : Number(trip.settlementDifference ?? 0) < 0
                                          ? "Kekurangan Dibayar"
                                          : "Selisih"
                                }
                                value={formatAccommodationAmount(
                                    Math.abs(trip.settlementDifference ?? 0),
                                )}
                            />
                            <DetailRow
                                label="Status Settlement"
                                value={trip.settlementStatus || "-"}
                            />
                            <DetailRow
                                label="Tanggal Settlement"
                                value={
                                    trip.settlementCompletedAt
                                        ? new Intl.DateTimeFormat("id-ID", {
                                              day: "2-digit",
                                              month: "short",
                                              year: "numeric",
                                          }).format(
                                              new Date(
                                                  trip.settlementCompletedAt,
                                              ),
                                          )
                                        : "-"
                                }
                            />
                        </div>
                        {trip.settlements?.length > 0 ? (
                            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-800">
                                {trip.settlements.map((settlement) => (
                                    <p key={settlement.id}>
                                        <span className="font-semibold">
                                            {settlement.type === "refund"
                                                ? "Pengembalian"
                                                : "Pembayaran"}
                                        </span>{" "}
                                        {formatAccommodationAmount(
                                            settlement.amount,
                                        )}{" "}
                                        via {settlement.paymentMethodLabel}
                                        {settlement.referenceNumber
                                            ? ` - Ref ${settlement.referenceNumber}`
                                            : ""}
                                    </p>
                                ))}
                            </div>
                        ) : Number(trip.settlementDifference ?? 0) === 0 ? (
                            <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                                Tidak ada selisih settlement.
                            </p>
                        ) : null}
                    </SectionCard>
                )}

                {!readOnly && (
                    <ActionFooter>
                        <Button
                            tone="secondary"
                            icon={Save}
                            onClick={saveDraft}
                            disabled={!editable || saving || submitting || Boolean(uploadingAgendaId)}
                        >
                            {saving ? "Menyimpan..." : "Simpan Draft Realisasi"}
                        </Button>
                        <Button
                            icon={Send}
                            onClick={requestSubmit}
                            disabled={!editable || saving || submitting || Boolean(uploadingAgendaId)}
                        >
                            Kirim Laporan Realisasi
                        </Button>
                    </ActionFooter>
                )}
            </div>

            {confirmOpen && (
                <div className="fixed inset-0 z-90 flex items-end bg-slate-950/40 p-4 md:items-center md:justify-center">
                    <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
                        <h3 className="text-base font-semibold text-slate-950">
                            Kirim Laporan Realisasi?
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                            Setelah dikirim, laporan tampil read-only dan masuk
                            status menunggu verifikasi.
                        </p>
                        <div className="mt-5 grid grid-cols-2 gap-3">
                            <Button
                                tone="secondary"
                                onClick={() => setConfirmOpen(false)}
                            >
                                Batal
                            </Button>
                            <Button
                                icon={Send}
                                onClick={submitRealization}
                                disabled={submitting}
                            >
                                {submitting ? "Mengirim..." : "Kirim"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {toast && (
                <div className="fixed inset-x-4 top-5 z-80 mx-auto max-w-md rounded-xl bg-slate-950 px-4 py-3 text-center text-sm font-semibold text-white shadow-xl md:top-6">
                    {toast}
                </div>
            )}
        </BusinessTripLayout>
    );
}
