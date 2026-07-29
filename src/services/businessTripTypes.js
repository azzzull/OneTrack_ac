export const BUSINESS_TRIP_DB_STATUS = {
    DRAFT: "draft",
    SUBMITTED: "submitted",
    PENDING_APPROVAL: "pending_approval",
    REJECTED: "rejected",
    APPROVED: "approved",
    ADVANCE_DISBURSED: "advance_disbursed",
    IN_PROGRESS: "in_progress",
    REALIZATION_DRAFT: "realization_draft",
    REALIZATION_SUBMITTED: "realization_submitted",
    REALIZATION_REVISION_REQUIRED: "realization_revision_required",
    REALIZATION_VERIFIED: "realization_verified",
    PENDING_REFUND: "pending_refund",
    PENDING_ADDITIONAL_PAYMENT: "pending_additional_payment",
    COMPLETED: "completed",
    CANCELLED: "cancelled",
};

export const BUSINESS_TRIP_DB_STATUS_LABELS = {
    [BUSINESS_TRIP_DB_STATUS.DRAFT]: "Draft",
    [BUSINESS_TRIP_DB_STATUS.SUBMITTED]: "Diajukan",
    [BUSINESS_TRIP_DB_STATUS.PENDING_APPROVAL]: "Menunggu Approval",
    [BUSINESS_TRIP_DB_STATUS.REJECTED]: "Ditolak",
    [BUSINESS_TRIP_DB_STATUS.APPROVED]: "Disetujui",
    [BUSINESS_TRIP_DB_STATUS.ADVANCE_DISBURSED]: "Uang Muka Dicairkan",
    [BUSINESS_TRIP_DB_STATUS.IN_PROGRESS]: "Perjalanan Berlangsung",
    [BUSINESS_TRIP_DB_STATUS.REALIZATION_DRAFT]: "Draft Laporan Realisasi",
    [BUSINESS_TRIP_DB_STATUS.REALIZATION_SUBMITTED]:
        "Menunggu Verifikasi Realisasi",
    [BUSINESS_TRIP_DB_STATUS.REALIZATION_REVISION_REQUIRED]:
        "Perbaikan Realisasi",
    [BUSINESS_TRIP_DB_STATUS.REALIZATION_VERIFIED]: "Realisasi Terverifikasi",
    [BUSINESS_TRIP_DB_STATUS.PENDING_REFUND]: "Menunggu Pengembalian",
    [BUSINESS_TRIP_DB_STATUS.PENDING_ADDITIONAL_PAYMENT]:
        "Menunggu Pembayaran Kekurangan",
    [BUSINESS_TRIP_DB_STATUS.COMPLETED]: "Selesai",
    [BUSINESS_TRIP_DB_STATUS.CANCELLED]: "Dibatalkan",
};

export const BUSINESS_TRIP_DB_TRANSITIONS = {
    [BUSINESS_TRIP_DB_STATUS.DRAFT]: [BUSINESS_TRIP_DB_STATUS.SUBMITTED],
    [BUSINESS_TRIP_DB_STATUS.SUBMITTED]: [
        BUSINESS_TRIP_DB_STATUS.PENDING_APPROVAL,
    ],
    [BUSINESS_TRIP_DB_STATUS.PENDING_APPROVAL]: [
        BUSINESS_TRIP_DB_STATUS.APPROVED,
        BUSINESS_TRIP_DB_STATUS.REJECTED,
    ],
    [BUSINESS_TRIP_DB_STATUS.REJECTED]: [
        BUSINESS_TRIP_DB_STATUS.PENDING_APPROVAL,
    ],
    [BUSINESS_TRIP_DB_STATUS.APPROVED]: [
        BUSINESS_TRIP_DB_STATUS.IN_PROGRESS,
    ],
    [BUSINESS_TRIP_DB_STATUS.ADVANCE_DISBURSED]: [
        BUSINESS_TRIP_DB_STATUS.IN_PROGRESS,
    ],
    [BUSINESS_TRIP_DB_STATUS.IN_PROGRESS]: [
        BUSINESS_TRIP_DB_STATUS.REALIZATION_DRAFT,
        BUSINESS_TRIP_DB_STATUS.REALIZATION_SUBMITTED,
    ],
    [BUSINESS_TRIP_DB_STATUS.REALIZATION_DRAFT]: [
        BUSINESS_TRIP_DB_STATUS.REALIZATION_SUBMITTED,
    ],
    [BUSINESS_TRIP_DB_STATUS.REALIZATION_SUBMITTED]: [
        BUSINESS_TRIP_DB_STATUS.REALIZATION_REVISION_REQUIRED,
        BUSINESS_TRIP_DB_STATUS.REALIZATION_VERIFIED,
    ],
    [BUSINESS_TRIP_DB_STATUS.REALIZATION_REVISION_REQUIRED]: [
        BUSINESS_TRIP_DB_STATUS.REALIZATION_DRAFT,
        BUSINESS_TRIP_DB_STATUS.REALIZATION_SUBMITTED,
    ],
    [BUSINESS_TRIP_DB_STATUS.REALIZATION_VERIFIED]: [
        BUSINESS_TRIP_DB_STATUS.PENDING_REFUND,
        BUSINESS_TRIP_DB_STATUS.PENDING_ADDITIONAL_PAYMENT,
        BUSINESS_TRIP_DB_STATUS.COMPLETED,
    ],
    [BUSINESS_TRIP_DB_STATUS.PENDING_REFUND]: [BUSINESS_TRIP_DB_STATUS.COMPLETED],
    [BUSINESS_TRIP_DB_STATUS.PENDING_ADDITIONAL_PAYMENT]: [
        BUSINESS_TRIP_DB_STATUS.COMPLETED,
    ],
};

export const isValidBusinessTripTransition = (fromStatus, toStatus) =>
    (BUSINESS_TRIP_DB_TRANSITIONS[fromStatus] ?? []).includes(toStatus);

/**
 * @typedef {Object} BusinessTrip
 * @property {string} id
 * @property {string} business_trip_no
 * @property {string} requester_id
 * @property {"single"|"range"} date_mode
 * @property {string|null} trip_date
 * @property {string|null} trip_start_date
 * @property {string|null} trip_end_date
 * @property {string|null} title
 * @property {string|null} project_id
 * @property {"self"|"management"|"other"} initiator_type
 * @property {string|null} initiator_name
 * @property {string} status
 * @property {number} requested_amount
 */

/**
 * @typedef {Object} BusinessTripAgenda
 * @property {string} id
 * @property {string} business_trip_id
 * @property {number} sequence_no
 * @property {string} title
 * @property {string|null} objective
 */

/**
 * @typedef {Object} BusinessTripAgendaPhoto
 * @property {string} id
 * @property {string} business_trip_id
 * @property {string} agenda_id
 * @property {string} storage_path
 * @property {string|null} file_name
 * @property {string|null} mime_type
 * @property {number|null} file_size
 */
