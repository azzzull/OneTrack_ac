import React, { useState } from "react";
import { Clock, CheckCircle2 } from "lucide-react";
import { useRealtimeClock } from "../hooks/useRealtimeClock";
import { useAttendance, formatTimeShort } from "../hooks/useAttendance";
import AttendanceCheckInModal from "./AttendanceCheckInModal";

const AttendanceDashboardSimple = ({ technicianId, onDataChange }) => {
    const { formattedTime, formattedDate } = useRealtimeClock();
    const { getTodayAttendance, recordCheckIn, recordCheckOut, loading } =
        useAttendance();
    const [todayAttendance, setTodayAttendance] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [modalType, setModalType] = useState("check-in");
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
                result = await recordCheckOut(technicianId, locationData);
            }

            if (result.success) {
                setModalOpen(false);
                const reloadResult = await getTodayAttendance(technicianId);
                setTodayAttendance(reloadResult.data);
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

                {!isComplete && (
                    <div className="space-y-2">
                        {canCheckIn && (
                            <button
                                onClick={() => handleOpenModal("check-in")}
                                disabled={loadingAttendance || loading}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-70"
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
        </>
    );
};

export default AttendanceDashboardSimple;
