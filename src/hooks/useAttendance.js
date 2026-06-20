import { useState, useCallback } from "react";
import supabase from "../supabaseClient";
import { getCurrentLocationWithRetry } from "../utils/geoLocation";
import { reverseGeocode } from "../utils/nominatim";
import { formatDateUniversal } from "../utils/dateFormatter";
import { calculateAttendanceOvertime } from "../utils/overtime";

const getLocalDateKey = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const isTodayOpenAttendance = (record) => {
    if (!record?.check_in_time || record.check_out_time) return false;
    return record.attendance_date === getLocalDateKey();
};

const getActiveOpenAttendance = async (technicianId, attendanceId = null) => {
    let query = supabase
        .from("attendance")
        .select("*")
        .eq("technician_id", technicianId)
        .is("check_out_time", null);

    if (attendanceId) {
        query = query.eq("id", attendanceId).limit(1);
    } else {
        query = query
            .eq("attendance_date", getLocalDateKey())
            .order("check_in_time", { ascending: false })
            .limit(10);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = Array.isArray(data) ? data : data ? [data] : [];
    const active = attendanceId
        ? rows.find((row) => !row.check_out_time)
        : rows.find((row) => isTodayOpenAttendance(row));

    return {
        active: active || null,
        staleOpenRecords: rows.filter((row) =>
            attendanceId ? Boolean(row.check_out_time) : !isTodayOpenAttendance(row),
        ),
    };
};

/**
 * Hook for attendance check-in/check-out operations
 */
export const useAttendance = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    /**
     * Record check-in to database
     * @param {string} technicianId - Technician ID
     * @param {object} locationData - Optional pre-captured location data (from modal)
     */
    const recordCheckIn = useCallback(
        async (technicianId, locationData = null) => {
            setLoading(true);
            setError(null);

            try {
                let location, addressData;

                if (locationData) {
                    // Use pre-captured location data from modal
                    location = {
                        latitude: locationData.latitude,
                        longitude: locationData.longitude,
                        accuracy: locationData.accuracy_meters,
                    };
                    addressData = {
                        street: locationData.street_address,
                        district: locationData.district,
                        subDistrict: locationData.sub_district,
                        postalCode: locationData.postal_code,
                    };
                } else {
                    // Capture location here if not passed (backwards compatibility)
                    location = await getCurrentLocationWithRetry(3, 1000);
                    addressData = await reverseGeocode(
                        location.latitude,
                        location.longitude,
                    );
                }

                // Insert attendance record with check-in data
                const today = getLocalDateKey();
                const checkInTime = new Date().toISOString();

                const { data, error: insertError } = await supabase
                    .from("attendance")
                    .insert([
                        {
                            technician_id: technicianId,
                            attendance_date: today,
                            check_in_time: checkInTime,
                            check_in_latitude: location.latitude,
                            check_in_longitude: location.longitude,
                            check_in_street_address: addressData.street || null,
                            check_in_district: addressData.district || null,
                            check_in_sub_district:
                                addressData.subDistrict || null,
                            check_in_postal_code:
                                addressData.postalCode || null,
                            check_in_accuracy_meters: location.accuracy || null,
                        },
                    ])
                    .select()
                    .single();

                if (insertError) {
                    if (insertError.code === "23505") {
                        // Unique constraint violation - already checked in today
                        throw new Error(
                            'Anda sudah melakukan check-in hari ini. Gunakan tombol "Absen Pulang" untuk keluar.',
                        );
                    }
                    throw insertError;
                }

                setLoading(false);
                return {
                    success: true,
                    data,
                    message: `Absen masuk berhasil pada pukul ${new Date(
                        checkInTime,
                    ).toLocaleTimeString("id-ID", {
                        hour: "2-digit",
                        minute: "2-digit",
                    })}`,
                };
            } catch (err) {
                const errorMessage = err.message || "Gagal melakukan check-in";
                setError(errorMessage);
                setLoading(false);
                return {
                    success: false,
                    error: errorMessage,
                };
            }
        },
        [],
    );

    /**
     * Record check-out to database (update existing today's record)
     * @param {string} technicianId - Technician ID
     * @param {object} locationData - Optional pre-captured location data (from modal)
     * @param {string} attendanceId - Optional active attendance row ID shown in UI
     */
    const recordCheckOut = useCallback(
        async (technicianId, locationData = null, attendanceId = null) => {
            setLoading(true);
            setError(null);

            try {
                let location, addressData;

                if (locationData) {
                    // Use pre-captured location data from modal
                    location = {
                        latitude: locationData.latitude,
                        longitude: locationData.longitude,
                        accuracy: locationData.accuracy_meters,
                    };
                    addressData = {
                        street: locationData.street_address,
                        district: locationData.district,
                        subDistrict: locationData.sub_district,
                        postalCode: locationData.postal_code,
                    };
                } else {
                    // Capture location here if not passed (backwards compatibility)
                    location = await getCurrentLocationWithRetry(3, 1000);
                    addressData = await reverseGeocode(
                        location.latitude,
                        location.longitude,
                    );
                }

                const checkOutTime = new Date().toISOString();

                const {
                    active: existingRecord,
                    staleOpenRecords,
                } = await getActiveOpenAttendance(technicianId, attendanceId);

                if (!existingRecord) {
                    const staleMessage =
                        staleOpenRecords.length > 0
                            ? "Ada data absensi lama yang belum checkout. Data lama itu tidak dipakai untuk checkout hari ini; minta admin menutup atau memperbaikinya."
                            : "Tidak ada sesi check-in aktif untuk hari ini.";
                    throw new Error(
                        staleMessage,
                    );
                }

                // Calculate working hours in minutes
                const checkInTime = new Date(existingRecord.check_in_time);
                const checkOutDateTime = new Date(checkOutTime);
                const workingMinutes = Math.floor(
                    (checkOutDateTime - checkInTime) / (1000 * 60),
                );
                const overtime = calculateAttendanceOvertime({
                    checkInTime: existingRecord.check_in_time,
                    checkOutTime,
                });

                // Update record with check-out data
                const { data, error: updateError } = await supabase
                    .from("attendance")
                    .update({
                        check_out_time: checkOutTime,
                        check_out_latitude: location.latitude,
                        check_out_longitude: location.longitude,
                        check_out_street_address: addressData.street || null,
                        check_out_district: addressData.district || null,
                        check_out_sub_district: addressData.subDistrict || null,
                        check_out_postal_code: addressData.postalCode || null,
                        check_out_accuracy_meters: location.accuracy || null,
                        working_hours_minutes: workingMinutes,
                        overtime_eligible: overtime.eligible,
                        overtime_submission_status: overtime.eligible
                            ? "eligible"
                            : "not_eligible",
                        overtime_eligible_duration_minutes: overtime.eligible
                            ? overtime.durationMinutes
                            : null,
                        overtime_not_submitted_reason: null,
                    })
                    .eq("id", existingRecord.id)
                    .select()
                    .single();

                if (updateError) {
                    throw updateError;
                }

                setLoading(false);
                return {
                    success: true,
                    data,
                    message: `Absen pulang berhasil pada pukul ${new Date(
                        checkOutTime,
                    ).toLocaleTimeString("id-ID", {
                        hour: "2-digit",
                        minute: "2-digit",
                    })}. Jam kerja: ${formatWorkingHours(workingMinutes)}`,
                };
            } catch (err) {
                const errorMessage = err.message || "Gagal melakukan check-out";
                setError(errorMessage);
                setLoading(false);
                return {
                    success: false,
                    error: errorMessage,
                };
            }
        },
        [],
    );

    /**
     * Get today's attendance record
     */
    const getTodayAttendance = useCallback(async (technicianId) => {
        setLoading(true);
        setError(null);

        try {
            const today = getLocalDateKey();
            const { active: openRecord } =
                await getActiveOpenAttendance(technicianId);

            if (openRecord) {
                setLoading(false);
                return { status: "checked_in_only", data: openRecord };
            }

            const { data, error: selectError } = await supabase
                .from("attendance")
                .select("*")
                .eq("technician_id", technicianId)
                .eq("attendance_date", today)
                .order("check_in_time", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (selectError) {
                throw selectError;
            }

            setLoading(false);

            if (!data) {
                return { status: "not_checked_in", data: null };
            }

            if (data.check_out_time) {
                return { status: "checked_in_and_out", data };
            }

            return { status: "checked_in_only", data };
        } catch (err) {
            const errorMessage = err.message || "Gagal mengambil data absensi";
            setError(errorMessage);
            setLoading(false);
            return { status: "error", error: errorMessage };
        }
    }, []);

    /**
     * Get attendance history
     */
    const getAttendanceHistory = useCallback(
        async (technicianId, dateFrom, dateTo) => {
            setLoading(true);
            setError(null);

            try {
                let query = supabase
                    .from("attendance")
                    .select("*")
                    .eq("technician_id", technicianId)
                    .order("attendance_date", { ascending: false });

                if (dateFrom && dateTo) {
                    query = query
                        .gte("attendance_date", dateFrom)
                        .lte("attendance_date", dateTo);
                }

                const { data, error: selectError } = await query;

                if (selectError) {
                    throw selectError;
                }

                setLoading(false);
                return { success: true, data: data || [] };
            } catch (err) {
                const errorMessage = err.message || "Gagal mengambil history";
                setError(errorMessage);
                setLoading(false);
                return { success: false, error: errorMessage };
            }
        },
        [],
    );

    /**
     * Get admin attendance log (all technicians)
     */
    const getAdminAttendanceLog = useCallback(
        async (technicianIdFilter, dateFrom, dateTo, statusFilter) => {
            setLoading(true);
            setError(null);

            try {
                const { data, error: selectError } = await supabase.rpc(
                    "get_admin_attendance_log",
                    {
                        p_technician_id: technicianIdFilter || null,
                        p_date_from: dateFrom || null,
                        p_date_to: dateTo || null,
                        p_status: statusFilter || null,
                    },
                );

                if (selectError) {
                    throw selectError;
                }

                setLoading(false);
                return { success: true, data: data || [] };
            } catch (err) {
                const errorMessage =
                    err.message || "Gagal mengambil log absensi";
                setError(errorMessage);
                setLoading(false);
                return { success: false, error: errorMessage };
            }
        },
        [],
    );

    return {
        loading,
        error,
        recordCheckIn,
        recordCheckOut,
        getTodayAttendance,
        getAttendanceHistory,
        getAdminAttendanceLog,
    };
};

/**
 * Helper function to format working hours
 */
export const formatWorkingHours = (minutes) => {
    if (!minutes) return "0 jam 0 menit";

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours} jam`);
    if (mins > 0) parts.push(`${mins} menit`);

    return parts.join(" ") || "0 menit";
};

/**
 * Helper function to format time display
 */
export const formatTimeShort = (timestamp) => {
    if (!timestamp) return "-";
    return new Date(timestamp).toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
    });
};

/**
 * Helper function to format date display (dd-mm-yyyy)
 * Handles YYYY-MM-DD format from database
 */
export const formatDateShort = (dateString) => {
    return formatDateUniversal(dateString);
};
