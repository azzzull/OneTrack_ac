export const OVERTIME_NORMAL_WORK_MINUTES = 8 * 60;
export const OVERTIME_BREAK_MINUTES = 60;
export const OVERTIME_NORMAL_ATTENDANCE_MINUTES =
    OVERTIME_NORMAL_WORK_MINUTES + OVERTIME_BREAK_MINUTES;
export const OVERTIME_MIN_EXTRA_MINUTES = 2 * 60;

export const OVERTIME_STATUS_LABELS = {
    not_eligible: "Tidak Lembur",
    eligible: "Bisa Ajukan Lembur",
    not_submitted: "Tidak Mengajukan",
    pending: "Menunggu Approval",
    approved: "Disetujui",
    rejected: "Ditolak",
};

export const getOvertimeStatusLabel = (status) =>
    OVERTIME_STATUS_LABELS[status] || OVERTIME_STATUS_LABELS.not_eligible;

export const getOvertimeStatusClass = (status) => {
    const classes = {
        not_eligible: "bg-slate-100 text-slate-600 border-slate-200",
        eligible: "bg-amber-100 text-amber-700 border-amber-200",
        not_submitted: "bg-zinc-100 text-zinc-700 border-zinc-200",
        pending: "bg-blue-100 text-blue-700 border-blue-200",
        approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
        rejected: "bg-red-100 text-red-700 border-red-200",
    };
    return classes[status] || classes.not_eligible;
};

export const formatOvertimeDuration = (minutes) => {
    const value = Number(minutes) || 0;
    const hours = Math.floor(value / 60);
    const mins = value % 60;
    const parts = [];
    if (hours) parts.push(`${hours} jam`);
    if (mins) parts.push(`${mins} menit`);
    return parts.join(" ") || "0 menit";
};

export const getNormalCheckoutAt = (checkInTimestamp) => {
    const checkIn = new Date(checkInTimestamp);
    if (Number.isNaN(checkIn.getTime())) return null;
    return new Date(
        checkIn.getTime() + OVERTIME_NORMAL_ATTENDANCE_MINUTES * 60000,
    );
};

export const calculateAttendanceOvertime = ({
    checkInTime,
    checkOutTime,
}) => {
    const normalCheckout = getNormalCheckoutAt(checkInTime);
    const checkOut = new Date(checkOutTime);
    if (!normalCheckout || Number.isNaN(checkOut.getTime())) {
        return {
            eligible: false,
            durationMinutes: 0,
            normalCheckoutAt: null,
        };
    }

    const eligibleAt = new Date(
        normalCheckout.getTime() + OVERTIME_MIN_EXTRA_MINUTES * 60000,
    );
    const durationMinutes = Math.max(
        0,
        Math.floor((checkOut - normalCheckout) / 60000),
    );

    return {
        eligible: checkOut >= eligibleAt,
        durationMinutes,
        normalCheckoutAt: normalCheckout.toISOString(),
    };
};

export const toDateInputValue = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

export const toDateTimeLocalValue = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export const buildManualDateTime = (date, time, addDay = false) => {
    const value = new Date(`${date}T${time || "00:00"}:00`);
    if (addDay) value.setDate(value.getDate() + 1);
    return value;
};

export const calculateManualDuration = (startAt, endAt) => {
    const start = new Date(startAt);
    let end = new Date(endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    if (end <= start) {
        end = new Date(end);
        end.setDate(end.getDate() + 1);
    }
    return Math.max(0, Math.round((end - start) / 60000));
};
