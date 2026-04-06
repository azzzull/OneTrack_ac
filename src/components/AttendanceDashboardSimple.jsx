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
                await loadTodayData();
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
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
                {/* Realtime Clock */}
                <div className="mb-6 text-center">
                    <div className="text-5xl font-bold text-slate-900 font-mono tracking-tight">
                        {formattedTime}
                    </div>
                    <p className="mt-3 text-sm text-slate-600">
                        {formattedDate}
                    </p>
                </div>

                {/* Time Boxes */}
                <div className="mb-6 grid grid-cols-2 gap-4">
                    {/* Check-in Box */}
                    <div className="rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 p-4 border-2 border-blue-200">
                        <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
                            Jam Masuk
                        </p>
                        <p className="mt-3 text-2xl font-bold text-blue-900">
                            {todayAttendance?.check_in_time
                                ? formatTimeShort(todayAttendance.check_in_time)
                                : "--:--"}
                        </p>
                        {todayAttendance?.check_in_district && (
                            <p className="mt-2 text-xs text-blue-700 truncate line-clamp-1">
                                📍 {todayAttendance.check_in_district}
                            </p>
                        )}
                    </div>

                    {/* Check-out Box */}
                    <div className="rounded-xl bg-gradient-to-br from-amber-50 to-amber-100 p-4 border-2 border-amber-200">
                        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                            Jam Pulang
                        </p>
                        <p className="mt-3 text-2xl font-bold text-amber-900">
                            {todayAttendance?.check_out_time
                                ? formatTimeShort(
                                      todayAttendance.check_out_time,
                                  )
                                : "--:--"}
                        </p>
                        {todayAttendance?.check_out_district && (
                            <p className="mt-2 text-xs text-amber-700 truncate line-clamp-1">
                                📍 {todayAttendance.check_out_district}
                            </p>
                        )}
                    </div>
                </div>

                {/* Action Buttons or Status */}
                {!isComplete && (
                    <div className="space-y-2">
                        {canCheckIn && (
                            <button
                                onClick={() => handleOpenModal("check-in")}
                                disabled={loadingAttendance || loading}
                                className="w-full rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-70 flex items-center justify-center gap-2"
                            >
                                <Clock size={18} />
                                Absen Masuk
                            </button>
                        )}
                        {canCheckOut && (
                            <button
                                onClick={() => handleOpenModal("check-out")}
                                disabled={loadingAttendance || loading}
                                className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-70 flex items-center justify-center gap-2"
                            >
                                <Clock size={18} />
                                Absen Pulang
                            </button>
                        )}
                    </div>
                )}

                {isComplete && (
                    <div className="rounded-xl bg-green-50 p-4 flex items-center gap-3 border-2 border-green-200">
                        <CheckCircle2
                            size={20}
                            className="text-green-600 flex-shrink-0"
                        />
                        <p className="text-sm text-green-700 font-medium">
                            Anda sudah lengkap absen hari ini
                        </p>
                    </div>
                )}
            </div>

            {/* Check-in Modal */}
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
