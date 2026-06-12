import React, { useState } from "react";
import { Clock, CheckCircle2 } from "lucide-react";
import { useRealtimeClock } from "../hooks/useRealtimeClock";
import { useAttendance, formatTimeShort } from "../hooks/useAttendance";
import AttendanceCheckInModal from "./AttendanceCheckInModal";
import OvertimeRequestModal from "./overtime/OvertimeRequestModal";
import { useAuth } from "../context/useAuth";
import {
    createAttendanceOvertimeRequest,
    markAttendanceOvertimeNotSubmitted,
} from "../services/overtimeService";
import {
    formatOvertimeDuration,
    getOvertimeStatusClass,
    getOvertimeStatusLabel,
} from "../utils/overtime";

const AttendanceDashboardSimple = ({ technicianId, onDataChange }) => {
    const { user, profile, role } = useAuth();
    const { formattedTime, formattedDate } = useRealtimeClock();
    const { getTodayAttendance, recordCheckIn, recordCheckOut, loading } =
        useAttendance();
    const [todayAttendance, setTodayAttendance] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [modalType, setModalType] = useState("check-in");
    const [overtimeConfirmOpen, setOvertimeConfirmOpen] = useState(false);
    const [overtimeSubmitOpen, setOvertimeSubmitOpen] = useState(false);
    const [overtimeSaving, setOvertimeSaving] = useState(false);
    const [loadingAttendance, setLoadingAttendance] = useState(true);

    React.useEffect(() => {
        const loadData = async () => {
            setLoadingAttendance(true);
            try {
                const result = await getTodayAttendance(technicianId);
                setTodayAttendance(result.data);
            } catch (error) {
                console.error("Error loading attendance:", error);
            } finally {
                setLoadingAttendance(false);
            }
        };
        loadData();
    }, [technicianId, getTodayAttendance]);

    const handleOpenModal = (type) => {
        setModalType(type);
        setModalOpen(true);
    };

    const handleSubmitAttendance = async (locationData) => {
        try {
            let result;
            if (modalType === "check-in") {
                result = await recordCheckIn(technicianId, locationData);
            } else {
                result = await recordCheckOut(
                    technicianId,
                    locationData,
                    todayAttendance?.id,
                );
            }

            if (result.success) {
                setModalOpen(false);
                const reloadResult = await getTodayAttendance(technicianId);
                const latest = reloadResult.data || result.data;
                setTodayAttendance(latest);
                if (
                    modalType === "check-out" &&
                    latest?.overtime_submission_status === "eligible"
                ) {
                    setOvertimeConfirmOpen(true);
                }
                onDataChange?.();
            } else {
                alert(result.error || "Gagal menyimpan absensi");
            }
        } catch (error) {
            console.error("Error submitting attendance:", error);
            alert("Terjadi kesalahan saat menyimpan absensi");
        }
    };

    const canCheckIn = !todayAttendance?.check_in_time;
    const canCheckOut =
        todayAttendance?.check_in_time && !todayAttendance?.check_out_time;
    const isComplete =
        todayAttendance?.check_in_time && todayAttendance?.check_out_time;

    const handleSubmitOvertime = async ({
        locationData,
        photoFile,
        photoAlreadyWatermarked,
        notes,
    }) => {
        setOvertimeSaving(true);
        try {
            await createAttendanceOvertimeRequest({
                attendance: todayAttendance,
                userId: user?.id,
                profile,
                locationData,
                photoFile,
                photoAlreadyWatermarked,
                notes,
            });
            const reloadResult = await getTodayAttendance(technicianId);
            setTodayAttendance(reloadResult.data || todayAttendance);
            setOvertimeSubmitOpen(false);
            setOvertimeConfirmOpen(false);
            onDataChange?.();
        } finally {
            setOvertimeSaving(false);
        }
    };

    const handleDeclineOvertime = async () => {
        if (!todayAttendance?.id) return;
        setOvertimeSaving(true);
        try {
            await markAttendanceOvertimeNotSubmitted({
                attendanceId: todayAttendance.id,
                reason: "Tidak Lembur",
            });
            setTodayAttendance((prev) => ({
                ...prev,
                overtime_submission_status: "not_submitted",
                overtime_not_submitted_reason: "Tidak Lembur",
            }));
            setOvertimeConfirmOpen(false);
            onDataChange?.();
        } catch (error) {
            alert(error.message || "Gagal menyimpan status lembur.");
        } finally {
            setOvertimeSaving(false);
        }
    };

    return (
        <>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-6 text-center">
                    <div className="font-mono text-5xl font-bold tracking-tight text-slate-900">
                        {formattedTime}
                    </div>
                    <p className="mt-3 text-sm text-slate-600">
                        {formattedDate}
                    </p>
                </div>

                <div className="mb-6 grid grid-cols-2 gap-4">
                    <div className="rounded-xl border-2 border-blue-200 bg-linear-to-br from-blue-50 to-blue-100 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                            Jam Masuk
                        </p>
                        <p className="mt-3 text-2xl font-bold text-blue-900">
                            {todayAttendance?.check_in_time
                                ? formatTimeShort(todayAttendance.check_in_time)
                                : "--:--"}
                        </p>
                        {todayAttendance?.check_in_street_address && (
                            <p className="mt-2 truncate text-xs text-blue-700">
                                {todayAttendance.check_in_street_address}
                            </p>
                        )}
                    </div>

                    <div className="rounded-xl border-2 border-amber-200 bg-linear-to-br from-amber-50 to-amber-100 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                            Jam Pulang
                        </p>
                        <p className="mt-3 text-2xl font-bold text-amber-900">
                            {todayAttendance?.check_out_time
                                ? formatTimeShort(
                                      todayAttendance.check_out_time,
                                  )
                                : "--:--"}
                        </p>
                        {todayAttendance?.check_out_street_address && (
                            <p className="mt-2 truncate text-xs text-amber-700">
                                {todayAttendance.check_out_street_address}
                            </p>
                        )}
                    </div>
                </div>

                {todayAttendance?.check_out_time && (
                    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Status Lembur
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span
                                className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${getOvertimeStatusClass(
                                    todayAttendance.overtime_submission_status,
                                )}`}
                            >
                                {getOvertimeStatusLabel(
                                    todayAttendance.overtime_submission_status,
                                )}
                            </span>
                            {todayAttendance.overtime_eligible_duration_minutes && (
                                <span className="text-xs font-medium text-slate-600">
                                    {formatOvertimeDuration(
                                        todayAttendance.overtime_eligible_duration_minutes,
                                    )}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {!isComplete && (
                    <div className="space-y-2">
                        {canCheckIn && (
                            <button
                                onClick={() => handleOpenModal("check-in")}
                                disabled={loadingAttendance || loading}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-3 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:opacity-70"
                            >
                                <Clock size={18} />
                                Absen Masuk
                            </button>
                        )}
                        {canCheckOut && (
                            <button
                                onClick={() => handleOpenModal("check-out")}
                                disabled={loadingAttendance || loading}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-70"
                            >
                                <Clock size={18} />
                                Absen Pulang
                            </button>
                        )}
                    </div>
                )}

                {isComplete && (
                    <div className="flex items-center gap-3 rounded-xl border-2 border-green-200 bg-green-50 p-4">
                        <CheckCircle2
                            size={20}
                            className="shrink-0 text-green-600"
                        />
                        <p className="text-sm font-medium text-green-700">
                            Anda sudah lengkap absen hari ini
                        </p>
                    </div>
                )}
            </div>

            <AttendanceCheckInModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onSubmit={handleSubmitAttendance}
                type={modalType}
                loading={loading}
            />

            {overtimeConfirmOpen && todayAttendance && (
                <div className="fixed inset-0 z-9999 flex items-center justify-center bg-slate-950/50 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
                        <div className="mb-5">
                            <h2 className="text-lg font-semibold text-slate-900">
                                Potensi Lembur Terdeteksi
                            </h2>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                                Anda checkout pada pukul{" "}
                                <span className="font-semibold">
                                    {formatTimeShort(
                                        todayAttendance.check_out_time,
                                    )}
                                </span>
                                , melewati batas jam kerja normal. Sistem
                                mendeteksi potensi lembur selama{" "}
                                <span className="font-semibold">
                                    {formatOvertimeDuration(
                                        todayAttendance.overtime_eligible_duration_minutes,
                                    )}
                                </span>
                                . Apakah Anda ingin mengajukan lembur?
                            </p>
                        </div>

                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={handleDeclineOvertime}
                                disabled={overtimeSaving}
                                className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            >
                                Tidak
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setOvertimeConfirmOpen(false);
                                    setOvertimeSubmitOpen(true);
                                }}
                                disabled={overtimeSaving}
                                className="flex-1 rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-60"
                            >
                                Ya, Ajukan
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <OvertimeRequestModal
                isOpen={overtimeSubmitOpen}
                mode="attendance"
                attendance={todayAttendance}
                currentUserId={user?.id}
                role={role}
                onClose={() => setOvertimeSubmitOpen(false)}
                onSubmit={handleSubmitOvertime}
                loading={overtimeSaving}
            />
        </>
    );
};

export default AttendanceDashboardSimple;
