import supabase from "../supabaseClient";
import { compressJobPhotoFile } from "./jobPhotoService";
import { BUSINESS_TRIP_DB_STATUS } from "./businessTripTypes";
import {
    NOTIFICATION_EVENT_TYPES,
    notifyEvent,
} from "./notificationEvents";

export const BUSINESS_TRIP_PHOTO_BUCKET = "business-trip-evidence";
export const BUSINESS_TRIP_MAX_PHOTOS_PER_AGENDA = 10;
export const BUSINESS_TRIP_MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const BUSINESS_TRIP_ALLOWED_PHOTO_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
];

export const DB_TO_UI_STATUS = {
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

export const UI_TO_DB_STATUS = Object.entries(DB_TO_UI_STATUS).reduce(
    (acc, [dbStatus, uiStatus]) => {
        acc[uiStatus] = dbStatus;
        return acc;
    },
    {},
);

export const STATUS_GROUP_TO_DB_STATUSES = {
    Draft: [BUSINESS_TRIP_DB_STATUS.DRAFT],
    "Menunggu Approval": [
        BUSINESS_TRIP_DB_STATUS.SUBMITTED,
        BUSINESS_TRIP_DB_STATUS.PENDING_APPROVAL,
    ],
    Ditolak: [BUSINESS_TRIP_DB_STATUS.REJECTED],
    "needs-realization": [
        BUSINESS_TRIP_DB_STATUS.APPROVED,
        BUSINESS_TRIP_DB_STATUS.ADVANCE_DISBURSED,
        BUSINESS_TRIP_DB_STATUS.IN_PROGRESS,
        BUSINESS_TRIP_DB_STATUS.REALIZATION_DRAFT,
        BUSINESS_TRIP_DB_STATUS.REALIZATION_REVISION_REQUIRED,
    ],
    "Menunggu Verifikasi Realisasi": [
        BUSINESS_TRIP_DB_STATUS.REALIZATION_SUBMITTED,
    ],
    Settlement: [
        BUSINESS_TRIP_DB_STATUS.PENDING_REFUND,
        BUSINESS_TRIP_DB_STATUS.PENDING_ADDITIONAL_PAYMENT,
    ],
    Selesai: [BUSINESS_TRIP_DB_STATUS.COMPLETED],
};

export const REALIZATION_VERIFICATION_STATUS_FILTERS = {
    PENDING: BUSINESS_TRIP_DB_STATUS.REALIZATION_SUBMITTED,
    REVISION: BUSINESS_TRIP_DB_STATUS.REALIZATION_REVISION_REQUIRED,
    PENDING_REFUND: BUSINESS_TRIP_DB_STATUS.PENDING_REFUND,
    PENDING_ADDITIONAL_PAYMENT:
        BUSINESS_TRIP_DB_STATUS.PENDING_ADDITIONAL_PAYMENT,
    COMPLETED: BUSINESS_TRIP_DB_STATUS.COMPLETED,
};

export const APPROVAL_STATUS_FILTERS = {
    PENDING: "pending_approval",
    APPROVED: BUSINESS_TRIP_DB_STATUS.APPROVED,
    REJECTED: BUSINESS_TRIP_DB_STATUS.REJECTED,
};

export const BUSINESS_TRIP_PAYMENT_METHODS = [
    { value: "transfer", label: "Transfer" },
    { value: "cash", label: "Tunai" },
    { value: "other", label: "Lainnya" },
];

export const BUSINESS_TRIP_PAYMENT_METHOD_LABELS =
    BUSINESS_TRIP_PAYMENT_METHODS.reduce((acc, item) => {
        acc[item.value] = item.label;
        return acc;
    }, {});

const toDateOnly = (value) => (value ? String(value).slice(0, 10) : "");

const addOneDay = (dateKey) => {
    const date = new Date(`${dateKey}T00:00:00`);
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
};

const getProjectLabel = (project) =>
    [project?.project_name, project?.customer_name || project?.customer?.name]
        .filter(Boolean)
        .join(" - ");

const getProfileDisplayName = (profile) =>
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
    profile?.name ||
    profile?.email ||
    "";

const getBusinessTripPhotoUrl = () => "";

const getBusinessTripSignedPhotoUrl = async (storagePath) => {
    if (!storagePath) return "";
    const { data, error } = await supabase.storage
        .from(BUSINESS_TRIP_PHOTO_BUCKET)
        .createSignedUrl(storagePath, 60 * 60);
    if (error) return "";
    return data?.signedUrl ?? "";
};

const loadProfileMap = async (ids) => {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return {};

    const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, name, email, role")
        .in("id", uniqueIds);

    if (error) throw error;

    return (data ?? []).reduce((acc, profile) => {
        acc[profile.id] = {
            ...profile,
            displayName: getProfileDisplayName(profile),
        };
        return acc;
    }, {});
};

const notifyBusinessTripEvent = async (type, trip, extra = {}) => {
    if (!trip?.id) return;
    try {
        await notifyEvent(type, {
            amount:
                extra.amount ??
                trip.advanceDisbursement?.amount ??
                trip.accommodationRequest?.requestedAmount ??
                0,
            business_trip_id: trip.id,
            business_trip_no: trip.businessTripNo,
            requester_id: trip.requesterId,
            requester_name: trip.requesterName,
            settlement_difference: trip.settlementDifference,
            ...extra,
        });
    } catch (error) {
        console.warn("[BusinessTrip] notification skipped:", error);
    }
};

export const loadBusinessTripProjects = async () => {
    const { data, error } = await supabase
        .from("master_projects")
        .select("id, project_name, customer_id")
        .order("project_name", { ascending: true });

    if (error) throw error;

    const customerIds = [...new Set((data ?? []).map((item) => item.customer_id).filter(Boolean))];
    let customerMap = {};
    if (customerIds.length > 0) {
        const { data: customers, error: customerError } = await supabase
            .from("master_customers")
            .select("id, name")
            .in("id", customerIds);
        if (!customerError) {
            customerMap = (customers ?? []).reduce((acc, customer) => {
                acc[customer.id] = customer;
                return acc;
            }, {});
        }
    }

    return (data ?? []).map((project) => ({
        ...project,
        status: "active",
        customer_name: customerMap[project.customer_id]?.name ?? "",
    }));
};

const mapAgendaPhotoFromDb = (photo) => ({
    id: photo.id,
    name: photo.original_file_name ?? photo.file_name ?? "Foto bukti kunjungan",
    size: Number(photo.file_size ?? 0),
    mimeType: photo.mime_type ?? "",
    storagePath: photo.storage_path,
    previewUrl: getBusinessTripPhotoUrl(photo.storage_path),
    uploadedBy: photo.uploaded_by,
    createdAt: photo.created_at,
});

const mapSettlementFromDb = (settlement) => ({
    id: settlement.id,
    type: settlement.type,
    amount: Number(settlement.amount ?? 0),
    paymentMethod: settlement.payment_method,
    paymentMethodLabel:
        BUSINESS_TRIP_PAYMENT_METHOD_LABELS[settlement.payment_method] ??
        settlement.payment_method,
    accountLabel: settlement.account_label ?? "",
    referenceNumber: settlement.reference_number ?? "",
    transactionDate: settlement.transaction_date,
    notes: settlement.notes ?? "",
    processedBy: settlement.processed_by,
    createdAt: settlement.created_at,
});

const mapAgendaFromDb = (agenda) => {
    const realization = agenda.business_trip_agenda_realizations?.[0] ?? null;
    const photos = [...(agenda.business_trip_agenda_photos ?? [])].sort(
        (a, b) => new Date(a.created_at ?? 0) - new Date(b.created_at ?? 0),
    );

    return {
        id: agenda.id,
        title: agenda.title ?? "",
        objective: agenda.objective ?? "",
        expanded: false,
        realization: {
            id: realization?.id ?? "",
            result: realization?.result ?? "",
            realizedAmount: Number(realization?.realized_amount ?? 0),
            status: realization?.status ?? "draft",
            submittedAt: realization?.submitted_at ?? null,
            verifiedAt: realization?.verified_at ?? null,
            photos: photos.map(mapAgendaPhotoFromDb),
        },
    };
};

const hydrateBusinessTripPhotoUrls = async (trip) => {
    const agendas = await Promise.all(
        trip.agendas.map(async (agenda) => {
            const photos = await Promise.all(
                (agenda.realization?.photos ?? []).map(async (photo) => ({
                    ...photo,
                    previewUrl: await getBusinessTripSignedPhotoUrl(
                        photo.storagePath,
                    ),
                })),
            );

            return {
                ...agenda,
                realization: {
                    ...agenda.realization,
                    photos,
                },
            };
        }),
    );

    return { ...trip, agendas };
};

export const mapBusinessTripFromDb = (row, projectMap = {}) => {
    const project = projectMap[row.project_id] ?? row.project ?? null;
    const sortedAgendas = [...(row.business_trip_agendas ?? [])].sort(
        (a, b) => Number(a.sequence_no ?? 0) - Number(b.sequence_no ?? 0),
    );

    return {
        id: row.id,
        businessTripNo: row.business_trip_no,
        createdAt: row.created_at,
        dateMode: row.date_mode,
        tripDate: toDateOnly(row.trip_date),
        startDate: toDateOnly(row.trip_start_date),
        endDate: toDateOnly(row.trip_end_date),
        title: row.title ?? "",
        projectId: row.project_id ?? "",
        projectLabel: getProjectLabel(project),
        initiator: row.initiator_type ?? "self",
        initiatorName: row.initiator_name ?? "",
        requesterId: row.requester_id ?? "",
        requesterName:
            row.requester?.displayName ??
            row.requester?.name ??
            row.requester_name ??
            row.initiator_name ??
            "",
        status: DB_TO_UI_STATUS[row.status] ?? row.status,
        dbStatus: row.status,
        rejectionReason: row.rejection_reason ?? "",
        submittedAt: row.submitted_at,
        approvedAt: row.approved_at,
        approvedBy: row.approved_by,
        approvedByName: row.approver?.displayName ?? "",
        rejectedAt: row.rejected_at,
        rejectedBy: row.rejected_by,
        rejectedByName: row.rejector?.displayName ?? "",
        realizationRevisionNote: row.realization_revision_note ?? "",
        realizationReviewedAt: row.realization_reviewed_at ?? null,
        realizationReviewedBy: row.realization_reviewed_by ?? null,
        realizationSubmittedAt: row.realization_submitted_at ?? null,
        realizationVerifiedAt: row.realization_verified_at ?? null,
        realizationVerifiedBy: row.realization_verified_by ?? null,
        totalRealizationAmount: Number(row.total_realization_amount ?? 0),
        settlementDifference: Number(row.settlement_difference ?? 0),
        settlementStatus: row.settlement_status ?? "none",
        settlementCompletedAt: row.settlement_completed_at ?? null,
        completedAt: row.completed_at ?? null,
        agendas: sortedAgendas.map(mapAgendaFromDb),
        settlements: (row.business_trip_settlements ?? []).map(mapSettlementFromDb),
        accommodationRequest: {
            requestedAmount: Number(row.requested_amount ?? 0),
        },
    };
};

const decorateBusinessTripRows = async (rows, projects) => {
    const profileMap = await loadProfileMap([
        ...rows.map((row) => row.requester_id),
        ...rows.map((row) => row.approved_by),
        ...rows.map((row) => row.rejected_by),
    ]);
    const projectMap = buildProjectMap(projects);

    const trips = rows.map((row) =>
        mapBusinessTripFromDb(
            {
                ...row,
                approver: profileMap[row.approved_by] ?? null,
                rejector: profileMap[row.rejected_by] ?? null,
                requester: profileMap[row.requester_id] ?? null,
            },
            projectMap,
        ),
    );
    return Promise.all(trips.map(hydrateBusinessTripPhotoUrls));
};

const decorateBusinessTripRowsWithMoney = async (rows, projects) => {
    const trips = await decorateBusinessTripRows(rows, projects);
    return attachAccommodationAndDisbursement(trips);
};

const loadAccommodationMapByTripIds = async (tripIds) => {
    const ids = [...new Set(tripIds.filter(Boolean))];
    if (ids.length === 0) return {};

    const { data, error } = await supabase
        .from("accommodation_requests")
        .select("*")
        .in("business_trip_id", ids);

    if (error) throw error;

    return (data ?? []).reduce((acc, item) => {
        acc[item.business_trip_id] = item;
        return acc;
    }, {});
};

const loadAdvanceDisbursementMapByTripIds = async (tripIds) => {
    const ids = [...new Set(tripIds.filter(Boolean))];
    if (ids.length === 0) return {};

    const { data, error } = await supabase
        .from("business_trip_advance_disbursements")
        .select("*")
        .in("business_trip_id", ids);

    if (error) throw error;

    const actorMap = await loadProfileMap((data ?? []).map((item) => item.disbursed_by));

    return (data ?? []).reduce((acc, item) => {
        acc[item.business_trip_id] = {
            id: item.id,
            accommodationRequestId: item.accommodation_request_id,
            amount: Number(item.amount ?? 0),
            paymentMethod: item.payment_method,
            paymentMethodLabel:
                BUSINESS_TRIP_PAYMENT_METHOD_LABELS[item.payment_method] ??
                item.payment_method,
            referenceNumber: item.reference_number ?? "",
            notes: item.notes ?? "",
            disbursedAt: item.disbursed_at,
            disbursedBy: item.disbursed_by,
            disbursedByName: actorMap[item.disbursed_by]?.displayName ?? "",
        };
        return acc;
    }, {});
};

const loadSettlementMapByTripIds = async (tripIds) => {
    const ids = [...new Set(tripIds.filter(Boolean))];
    if (ids.length === 0) return {};

    const { data, error } = await supabase
        .from("business_trip_settlements")
        .select("*")
        .in("business_trip_id", ids);

    if (error) throw error;

    return (data ?? []).reduce((acc, item) => {
        acc[item.business_trip_id] = [
            ...(acc[item.business_trip_id] ?? []),
            mapSettlementFromDb(item),
        ];
        return acc;
    }, {});
};

const attachAccommodationAndDisbursement = async (trips) => {
    const tripIds = trips.map((trip) => trip.id);
    const [accommodationMap, disbursementMap, settlementMap] = await Promise.all([
        loadAccommodationMapByTripIds(tripIds),
        loadAdvanceDisbursementMapByTripIds(tripIds),
        loadSettlementMapByTripIds(tripIds),
    ]);

    return trips.map((trip) => ({
        ...trip,
        accommodation: accommodationMap[trip.id] ?? null,
        advanceDisbursement: disbursementMap[trip.id] ?? null,
        settlements: settlementMap[trip.id] ?? trip.settlements ?? [],
    }));
};

const buildProjectMap = (projects) =>
    projects.reduce((acc, project) => {
        acc[project.id] = project;
        return acc;
    }, {});

const applyClientSearch = (rows, projects, search) => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return rows;
    const projectMap = buildProjectMap(projects);
    return rows.filter((row) => {
        const project = projectMap[row.project_id];
        return [
            row.business_trip_no,
            row.title,
            project?.project_name,
            project?.customer_name,
        ]
            .join(" ")
            .toLowerCase()
            .includes(keyword);
    });
};

const getTripDateLabelFromRow = (row) => {
    if (row.date_mode === "range") {
        return [toDateOnly(row.trip_start_date), toDateOnly(row.trip_end_date)]
            .filter(Boolean)
            .join(" - ");
    }
    return toDateOnly(row.trip_date);
};

const mapBusinessTripReportRow = (row, projectMap = {}, profileMap = {}) => {
    const project = projectMap[row.project_id] ?? null;
    const requester = profileMap[row.requester_id] ?? null;
    const disbursedAmount = Number(row.business_trip_advance_disbursements?.[0]?.amount ?? 0);
    const settlements = row.business_trip_settlements ?? [];
    return {
        id: row.id,
        businessTripNo: row.business_trip_no,
        requesterName: requester?.displayName ?? "",
        projectLabel: getProjectLabel(project) || "-",
        title: row.title ?? "",
        createdAt: row.created_at,
        tripDateLabel: getTripDateLabelFromRow(row),
        initiatorName: row.initiator_name ?? "",
        status: DB_TO_UI_STATUS[row.status] ?? row.status,
        dbStatus: row.status,
        requestedAmount: Number(row.requested_amount ?? 0),
        disbursedAmount,
        totalRealizationAmount: Number(row.total_realization_amount ?? 0),
        settlementDifference: Number(row.settlement_difference ?? 0),
        settlementStatus: row.settlement_status ?? "none",
        completedAt: row.completed_at,
        agendaCount: row.business_trip_agendas?.length ?? 0,
        photoCount: (row.business_trip_agenda_photos ?? []).length,
        refundAmount: settlements
            .filter((item) => item.type === "refund")
            .reduce((sum, item) => sum + Number(item.amount ?? 0), 0),
        additionalPaymentAmount: settlements
            .filter((item) => item.type === "additional_payment")
            .reduce((sum, item) => sum + Number(item.amount ?? 0), 0),
    };
};

const applyBusinessTripReportFilters = (rows, projects, profiles, filters) => {
    const keyword = String(filters.search ?? "").trim().toLowerCase();
    const requesterKeyword = String(filters.requester ?? "").trim().toLowerCase();
    const projectMap = buildProjectMap(projects);

    return rows.filter((row) => {
        const project = projectMap[row.project_id];
        const requester = profiles[row.requester_id];
        const requesterName = requester?.displayName ?? "";
        const searchableText = [
            row.business_trip_no,
            row.title,
            requesterName,
            project?.project_name,
            project?.customer_name,
        ]
            .join(" ")
            .toLowerCase();

        return (
            (!keyword || searchableText.includes(keyword)) &&
            (!requesterKeyword ||
                requesterName.toLowerCase().includes(requesterKeyword))
        );
    });
};

const getApprovalDbStatuses = (statusFilter) => {
    if (!statusFilter || statusFilter === APPROVAL_STATUS_FILTERS.PENDING) {
        return [
            BUSINESS_TRIP_DB_STATUS.SUBMITTED,
            BUSINESS_TRIP_DB_STATUS.PENDING_APPROVAL,
        ];
    }
    return [statusFilter];
};

const getRealizationVerificationDbStatuses = (statusFilter) => {
    if (
        !statusFilter ||
        statusFilter === REALIZATION_VERIFICATION_STATUS_FILTERS.PENDING
    ) {
        return [BUSINESS_TRIP_DB_STATUS.REALIZATION_SUBMITTED];
    }
    return [statusFilter];
};

const applyApprovalClientFilters = (rows, projects, profiles, filters) => {
    const keyword = String(filters.search ?? "").trim().toLowerCase();
    const requesterKeyword = String(filters.requester ?? "").trim().toLowerCase();
    const projectMap = buildProjectMap(projects);

    return rows.filter((row) => {
        const project = projectMap[row.project_id];
        const requester = profiles[row.requester_id];
        const requesterName = requester?.displayName ?? "";
        const searchableText = [
            row.business_trip_no,
            row.title,
            requesterName,
            project?.project_name,
            project?.customer_name,
        ]
            .join(" ")
            .toLowerCase();

        return (
            (!keyword || searchableText.includes(keyword)) &&
            (!requesterKeyword ||
                requesterName.toLowerCase().includes(requesterKeyword))
        );
    });
};

export const getBusinessTripsForApproval = async ({
    endDate,
    page = 1,
    pageSize = 20,
    projectId = "",
    requester = "",
    search = "",
    sortMode = "oldest",
    startDate,
    statusFilter = APPROVAL_STATUS_FILTERS.PENDING,
} = {}) => {
    const projects = await loadBusinessTripProjects();
    let query = supabase
        .from("business_trips")
        .select("*, business_trip_agendas(id, sequence_no, title, objective)", {
            count: "exact",
        });

    if (startDate) query = query.gte("created_at", `${startDate}T00:00:00`);
    if (endDate) query = query.lt("created_at", `${addOneDay(endDate)}T00:00:00`);
    if (projectId) query = query.eq("project_id", projectId);

    const statuses = getApprovalDbStatuses(statusFilter);
    if (statuses.length === 1) query = query.eq("status", statuses[0]);
    if (statuses.length > 1) query = query.in("status", statuses);

    if (sortMode === "newest") {
        query = query.order("submitted_at", { ascending: false, nullsFirst: false });
        query = query.order("created_at", { ascending: false });
    } else if (sortMode === "trip-nearest") {
        query = query.order("trip_date", { ascending: true, nullsFirst: false });
        query = query.order("trip_start_date", { ascending: true, nullsFirst: false });
    } else {
        query = query.order("submitted_at", { ascending: true, nullsFirst: false });
        query = query.order("created_at", { ascending: true });
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await query.range(from, to);
    if (error) throw error;

    const rows = data ?? [];
    const profileMap = await loadProfileMap(rows.map((row) => row.requester_id));
    const filteredRows = applyApprovalClientFilters(rows, projects, profileMap, {
        requester,
        search,
    });
    const decorated = await decorateBusinessTripRowsWithMoney(filteredRows, projects);

    return {
        items: decorated,
        projects,
        total:
            search.trim() || requester.trim()
                ? filteredRows.length
                : count ?? filteredRows.length,
    };
};

export const getBusinessTripApprovalCounts = async ({
    endDate,
    startDate,
} = {}) => {
    const { data, error } = await supabase.rpc(
        "get_business_trip_approval_counts",
        {
            p_end_date_exclusive: endDate ? `${addOneDay(endDate)}T00:00:00` : null,
            p_start_date: startDate ? `${startDate}T00:00:00` : null,
        },
    );
    if (error) throw error;

    return (data ?? []).reduce(
        (acc, item) => ({
            ...acc,
            [item.status]: Number(item.total ?? 0),
        }),
        {
            [APPROVAL_STATUS_FILTERS.PENDING]: 0,
            [APPROVAL_STATUS_FILTERS.APPROVED]: 0,
            [APPROVAL_STATUS_FILTERS.REJECTED]: 0,
        },
    );
};

export const getBusinessTripsReadyForDisbursement = async ({
    endDate,
    page = 1,
    pageSize = 20,
    projectId = "",
    search = "",
    sortMode = "oldest",
    startDate,
} = {}) => {
    const projects = await loadBusinessTripProjects();
    let query = supabase
        .from("business_trips")
        .select("*, business_trip_agendas(id, sequence_no, title, objective)", {
            count: "exact",
        })
        .eq("status", BUSINESS_TRIP_DB_STATUS.APPROVED)
        .gt("requested_amount", 0);

    if (startDate) query = query.gte("approved_at", `${startDate}T00:00:00`);
    if (endDate) query = query.lt("approved_at", `${addOneDay(endDate)}T00:00:00`);
    if (projectId) query = query.eq("project_id", projectId);

    if (sortMode === "newest") {
        query = query.order("approved_at", { ascending: false, nullsFirst: false });
    } else if (sortMode === "trip-nearest") {
        query = query.order("trip_date", { ascending: true, nullsFirst: false });
        query = query.order("trip_start_date", { ascending: true, nullsFirst: false });
    } else {
        query = query.order("approved_at", { ascending: true, nullsFirst: false });
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await query.range(from, to);
    if (error) throw error;

    const rows = applyClientSearch(data ?? [], projects, search);
    const decorated = await decorateBusinessTripRowsWithMoney(rows, projects);

    return {
        items: decorated,
        projects,
        total: search.trim() ? rows.length : count ?? rows.length,
    };
};

export const getBusinessTripDisbursementDetail = async (tripId) => {
    const result = await getBusinessTripApprovalDetail(tripId);
    return result;
};

export const getBusinessTripsForRealizationVerification = async ({
    endDate,
    page = 1,
    pageSize = 20,
    projectId = "",
    requester = "",
    search = "",
    sortMode = "oldest",
    startDate,
    statusFilter = REALIZATION_VERIFICATION_STATUS_FILTERS.PENDING,
} = {}) => {
    const projects = await loadBusinessTripProjects();
    let query = supabase
        .from("business_trips")
        .select("*, business_trip_agendas(id, sequence_no, title, objective)", {
            count: "exact",
        });

    if (startDate) {
        query = query.gte("realization_submitted_at", `${startDate}T00:00:00`);
    }
    if (endDate) {
        query = query.lt(
            "realization_submitted_at",
            `${addOneDay(endDate)}T00:00:00`,
        );
    }
    if (projectId) query = query.eq("project_id", projectId);

    const statuses = getRealizationVerificationDbStatuses(statusFilter);
    if (statuses.length === 1) query = query.eq("status", statuses[0]);
    if (statuses.length > 1) query = query.in("status", statuses);

    if (sortMode === "newest") {
        query = query.order("realization_submitted_at", {
            ascending: false,
            nullsFirst: false,
        });
    } else {
        query = query.order("realization_submitted_at", {
            ascending: true,
            nullsFirst: false,
        });
    }
    query = query.order("business_trip_no", { ascending: true });

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await query.range(from, to);
    if (error) throw error;

    const rows = data ?? [];
    const profileMap = await loadProfileMap(rows.map((row) => row.requester_id));
    const filteredRows = applyApprovalClientFilters(rows, projects, profileMap, {
        requester,
        search,
    });
    const decorated = await decorateBusinessTripRowsWithMoney(filteredRows, projects);

    return {
        items: decorated,
        projects,
        total:
            search.trim() || requester.trim()
                ? filteredRows.length
                : count ?? filteredRows.length,
    };
};

export const getBusinessTripRealizationVerificationCounts = async ({
    endDate,
    startDate,
} = {}) => {
    const statuses = Object.values(REALIZATION_VERIFICATION_STATUS_FILTERS);
    const entries = await Promise.all(
        statuses.map(async (status) => {
            let query = supabase
                .from("business_trips")
                .select("id", { count: "exact", head: true })
                .eq("status", status);
            if (startDate) {
                query = query.gte("realization_submitted_at", `${startDate}T00:00:00`);
            }
            if (endDate) {
                query = query.lt(
                    "realization_submitted_at",
                    `${addOneDay(endDate)}T00:00:00`,
                );
            }
            const { count, error } = await query;
            if (error) throw error;
            return [status, Number(count ?? 0)];
        }),
    );
    return Object.fromEntries(entries);
};

export const getBusinessTripRealizationVerificationDetail = async (tripId) => {
    const result = await getBusinessTripApprovalDetail(tripId);
    return result;
};

export const getBusinessTripAccommodation = async (tripId) => {
    const accommodationMap = await loadAccommodationMapByTripIds([tripId]);
    return accommodationMap[tripId] ?? null;
};

export const getBusinessTripAdvanceDisbursement = async (tripId) => {
    const disbursementMap = await loadAdvanceDisbursementMapByTripIds([tripId]);
    return disbursementMap[tripId] ?? null;
};

export const getMyBusinessTrips = async ({
    endDate,
    page = 1,
    pageSize = 20,
    search = "",
    sortMode = "newest",
    startDate,
    statusFilter,
} = {}) => {
    const projects = await loadBusinessTripProjects();
    let query = supabase
        .from("business_trips")
        .select("*, business_trip_agendas(id, sequence_no, title, objective)", {
            count: "exact",
        });

    if (startDate) query = query.gte("created_at", `${startDate}T00:00:00`);
    if (endDate) query = query.lt("created_at", `${addOneDay(endDate)}T00:00:00`);

    const statuses = STATUS_GROUP_TO_DB_STATUSES[statusFilter] ?? (
        UI_TO_DB_STATUS[statusFilter] ? [UI_TO_DB_STATUS[statusFilter]] : []
    );
    if (statuses.length === 1) query = query.eq("status", statuses[0]);
    if (statuses.length > 1) query = query.in("status", statuses);

    if (sortMode === "oldest") {
        query = query.order("created_at", { ascending: true });
    } else if (sortMode === "trip-nearest") {
        query = query.order("trip_date", { ascending: true, nullsFirst: false });
    } else {
        query = query.order("created_at", { ascending: false });
    }
    query = query.order("business_trip_no", {
        ascending: sortMode === "oldest",
    });

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await query.range(from, to);
    if (error) throw error;

    const searchedRows = applyClientSearch(data ?? [], projects, search);
    const projectMap = buildProjectMap(projects);

    const mappedItems = searchedRows.map((row) =>
        mapBusinessTripFromDb(row, projectMap),
    );

    return {
        items: await attachAccommodationAndDisbursement(mappedItems),
        projects,
        total: search.trim() ? searchedRows.length : count ?? searchedRows.length,
    };
};

export const getBusinessTripStatusCounts = async ({ endDate, startDate } = {}) => {
    const { data, error } = await supabase.rpc("get_business_trip_status_counts", {
        p_end_date_exclusive: endDate ? `${addOneDay(endDate)}T00:00:00` : null,
        p_start_date: startDate ? `${startDate}T00:00:00` : null,
    });
    if (error) throw error;

    return (data ?? []).reduce((acc, item) => {
        const total = Number(item.total ?? 0);
        const groupEntry = Object.entries(STATUS_GROUP_TO_DB_STATUSES).find(
            ([, statuses]) => statuses.includes(item.status),
        );
        const uiStatus = groupEntry?.[0] ?? DB_TO_UI_STATUS[item.status] ?? item.status;
        acc[uiStatus] = Number(acc[uiStatus] ?? 0) + total;
        return acc;
    }, {});
};

export const getBusinessTripById = async (tripId) => {
    const [projects, result] = await Promise.all([
        loadBusinessTripProjects(),
        supabase
            .from("business_trips")
            .select(
                "*, business_trip_agendas(*, business_trip_agenda_realizations(*), business_trip_agenda_photos(*)), business_trip_status_history(*), business_trip_settlements(*)",
            )
            .eq("id", tripId)
            .single(),
    ]);

    const { data, error } = result;
    if (error) throw error;
    const [trip] = await decorateBusinessTripRowsWithMoney([data], projects);
    const actorMap = await loadProfileMap(
        (data.business_trip_status_history ?? []).map((item) => item.acted_by),
    );
    return {
        projects,
        trip: {
            ...trip,
            statusHistory: (data.business_trip_status_history ?? [])
                .sort((a, b) => new Date(a.acted_at ?? 0) - new Date(b.acted_at ?? 0))
                .map((item) => ({
                    id: item.id,
                    action: item.action,
                    fromStatus: DB_TO_UI_STATUS[item.from_status] ?? item.from_status,
                    toStatus: DB_TO_UI_STATUS[item.to_status] ?? item.to_status,
                    notes: item.notes ?? "",
                    actedAt: item.acted_at,
                    actedByName: actorMap[item.acted_by]?.displayName ?? "",
                })),
        },
    };
};

export const getBusinessTripApprovalDetail = async (tripId) => {
    const [projects, result] = await Promise.all([
        loadBusinessTripProjects(),
        supabase
            .from("business_trips")
            .select(
                "*, business_trip_agendas(*, business_trip_agenda_realizations(*), business_trip_agenda_photos(*)), business_trip_status_history(*), business_trip_settlements(*)",
            )
            .eq("id", tripId)
            .single(),
    ]);

    const { data, error } = result;
    if (error) throw error;

    const [trip] = await decorateBusinessTripRowsWithMoney([data], projects);
    const actorMap = await loadProfileMap(
        (data.business_trip_status_history ?? []).map((item) => item.acted_by),
    );

    return {
        projects,
        trip: {
            ...trip,
            statusHistory: (data.business_trip_status_history ?? [])
                .sort((a, b) => new Date(a.acted_at ?? 0) - new Date(b.acted_at ?? 0))
                .map((item) => ({
                    id: item.id,
                    action: item.action,
                    fromStatus: DB_TO_UI_STATUS[item.from_status] ?? item.from_status,
                    toStatus: DB_TO_UI_STATUS[item.to_status] ?? item.to_status,
                    notes: item.notes ?? "",
                    actedAt: item.acted_at,
                    actedByName: actorMap[item.acted_by]?.displayName ?? "",
                })),
        },
    };
};

export const createBusinessTripDraft = async () => {
    const { data, error } = await supabase.rpc("create_business_trip_draft");
    if (error) throw error;
    return hydrateBusinessTripPhotoUrls(mapBusinessTripFromDb(data));
};

const buildAgendaPayload = (agendas = []) =>
    agendas.map((agenda) => ({
        id: agenda.id,
        title: agenda.title ?? agenda.name ?? "",
        objective: agenda.objective ?? agenda.description ?? "",
    }));

const buildDraftRpcPayload = (trip) => ({
    p_agendas: buildAgendaPayload(trip.agendas),
    p_business_trip_id: trip.id,
    p_date_mode: trip.dateMode,
    p_initiator_name: trip.initiatorName,
    p_initiator_type: trip.initiator,
    p_project_id: trip.projectId || null,
    p_requested_amount: Number(trip.accommodationRequest?.requestedAmount ?? 0),
    p_title: trip.title,
    p_trip_date: trip.dateMode === "single" ? trip.tripDate || null : null,
    p_trip_end_date: trip.dateMode === "range" ? trip.endDate || null : null,
    p_trip_start_date: trip.dateMode === "range" ? trip.startDate || null : null,
});

export const updateBusinessTripDraft = async ({ trip }) => {
    const { data, error } = await supabase.rpc(
        "save_business_trip_draft",
        buildDraftRpcPayload(trip),
    );
    if (error) throw error;
    const result = await getBusinessTripById(data.id);
    return result.trip;
};

export const submitBusinessTrip = async ({ trip }) => {
    const { data, error } = await supabase.rpc(
        "submit_business_trip_request",
        buildDraftRpcPayload(trip),
    );
    if (error) throw error;
    const result = await getBusinessTripById(data.id);
    await notifyBusinessTripEvent(
        NOTIFICATION_EVENT_TYPES.BUSINESS_TRIP_SUBMITTED,
        result.trip,
    );
    return result.trip;
};

const normalizeApprovalError = (error) => {
    const message = String(error?.message ?? "");
    if (message.toLowerCase().includes("sudah diproses")) {
        return new Error("Pengajuan sudah diproses oleh approver lain.");
    }
    if (message.toLowerCase().includes("sendiri")) {
        return new Error("Pemohon tidak dapat memproses pengajuannya sendiri.");
    }
    if (message.toLowerCase().includes("sudah dicairkan")) {
        return new Error("Uang muka sudah dicairkan.");
    }
    if (message.toLowerCase().includes("status business trip sudah berubah")) {
        return new Error("Status Business Trip sudah berubah.");
    }
    if (message.toLowerCase().includes("laporan belum lengkap")) {
        return new Error("Laporan belum lengkap.");
    }
    if (message.toLowerCase().includes("laporan sudah diproses")) {
        return new Error("Laporan sudah diproses oleh verifier lain.");
    }
    if (message.toLowerCase().includes("catatan revisi")) {
        return new Error("Catatan revisi wajib diisi minimal 10 karakter.");
    }
    if (message.toLowerCase().includes("pengembalian sudah dicatat")) {
        return new Error("Pengembalian sudah dicatat.");
    }
    if (message.toLowerCase().includes("kekurangan sudah dibayar")) {
        return new Error("Kekurangan sudah dibayar.");
    }
    if (message.toLowerCase().includes("nominal pengembalian")) {
        return new Error("Nominal pengembalian harus sama dengan sisa settlement.");
    }
    if (message.toLowerCase().includes("nominal pembayaran")) {
        return new Error("Nominal pembayaran harus sama dengan kekurangan settlement.");
    }
    if (message.toLowerCase().includes("nominal")) {
        return new Error("Nominal pencairan tidak valid.");
    }
    if (message.toLowerCase().includes("akses verifikasi")) {
        return new Error("Anda tidak memiliki akses verifikasi realisasi.");
    }
    if (message.toLowerCase().includes("akses settlement")) {
        return new Error("Anda tidak memiliki akses settlement Business Trip.");
    }
    if (message.toLowerCase().includes("uang muka harus dicairkan")) {
        return new Error("Uang muka harus dicairkan sebelum perjalanan dimulai.");
    }
    if (message.toLowerCase().includes("tidak dapat memulai")) {
        return new Error("Gagal memulai perjalanan.");
    }
    return error;
};

export const approveBusinessTrip = async ({ note = "", tripId }) => {
    const { data, error } = await supabase.rpc("approve_business_trip_request", {
        p_business_trip_id: tripId,
        p_note: note || null,
    });
    if (error) throw normalizeApprovalError(error);
    const result = await getBusinessTripApprovalDetail(data.id);
    await notifyBusinessTripEvent(
        NOTIFICATION_EVENT_TYPES.BUSINESS_TRIP_APPROVED,
        result.trip,
    );
    return result.trip;
};

export const createBusinessTripAccommodationIfNeeded = async (tripId) => {
    const { data, error } = await supabase.rpc(
        "ensure_business_trip_accommodation",
        {
            p_business_trip_id: tripId,
        },
    );
    if (error) throw error;
    return data;
};

export const rejectBusinessTrip = async ({ rejectionReason, tripId }) => {
    const { data, error } = await supabase.rpc("reject_business_trip_request", {
        p_business_trip_id: tripId,
        p_rejection_reason: rejectionReason,
    });
    if (error) throw normalizeApprovalError(error);
    const result = await getBusinessTripApprovalDetail(data.id);
    await notifyBusinessTripEvent(
        NOTIFICATION_EVENT_TYPES.BUSINESS_TRIP_REJECTED,
        result.trip,
        { rejection_note: rejectionReason },
    );
    return result.trip;
};

export const disburseBusinessTripAdvance = async ({
    amount,
    notes = "",
    paymentMethod,
    referenceNumber = "",
    tripId,
}) => {
    const { data, error } = await supabase.rpc(
        "disburse_business_trip_advance",
        {
            p_amount: Number(amount),
            p_business_trip_id: tripId,
            p_notes: notes || null,
            p_payment_method: paymentMethod,
            p_reference_number: referenceNumber || null,
        },
    );
    if (error) throw normalizeApprovalError(error);
    const result = await getBusinessTripDisbursementDetail(data.id);
    await notifyBusinessTripEvent(
        NOTIFICATION_EVENT_TYPES.BUSINESS_TRIP_ADVANCE_DISBURSED,
        result.trip,
        { amount: Number(amount) },
    );
    return result.trip;
};

export const startBusinessTrip = async (tripId) => {
    const { data, error } = await supabase.rpc("start_business_trip", {
        p_business_trip_id: tripId,
    });
    if (error) throw normalizeApprovalError(error);
    const result = await getBusinessTripById(data.id);
    await notifyBusinessTripEvent(
        NOTIFICATION_EVENT_TYPES.BUSINESS_TRIP_STARTED,
        result.trip,
    );
    return result.trip;
};

const buildRealizationPayload = (agendas = []) =>
    agendas.map((agenda) => ({
        agenda_id: agenda.id,
        realized_amount: Number(agenda.realization?.realizedAmount ?? 0),
        result: agenda.realization?.result ?? "",
    }));

export const getBusinessTripForRealization = async (tripId) => {
    const result = await getBusinessTripById(tripId);
    return result;
};

export const getBusinessTripRealization = async (tripId) => {
    const result = await getBusinessTripById(tripId);
    return result.trip;
};

export const saveBusinessTripRealizationDraft = async ({ trip }) => {
    const { data, error } = await supabase.rpc(
        "save_business_trip_realization_draft",
        {
            p_business_trip_id: trip.id,
            p_realizations: buildRealizationPayload(trip.agendas),
        },
    );
    if (error) throw normalizeApprovalError(error);
    const result = await getBusinessTripById(data.id);
    await notifyBusinessTripEvent(
        NOTIFICATION_EVENT_TYPES.BUSINESS_TRIP_REALIZATION_SUBMITTED,
        result.trip,
    );
    return result.trip;
};

export const submitBusinessTripRealization = async (tripId) => {
    const { data, error } = await supabase.rpc(
        "submit_business_trip_realization",
        {
            p_business_trip_id: tripId,
        },
    );
    if (error) throw normalizeApprovalError(error);
    const result = await getBusinessTripById(data.id);
    return result.trip;
};

export const calculateBusinessTripSettlement = async (tripId) => {
    const { data, error } = await supabase.rpc(
        "calculate_business_trip_settlement",
        {
            p_business_trip_id: tripId,
        },
    );
    if (error) throw normalizeApprovalError(error);
    const row = Array.isArray(data) ? data[0] : data;
    return {
        businessTripId: row?.business_trip_id ?? tripId,
        requestedAmount: Number(row?.requested_amount ?? 0),
        disbursedAmount: Number(row?.disbursed_amount ?? 0),
        totalRealizationAmount: Number(row?.total_realization_amount ?? 0),
        settlementDifference: Number(row?.settlement_difference ?? 0),
        settlementStatus: row?.settlement_status ?? "none",
    };
};

export const requestBusinessTripRealizationRevision = async ({
    revisionNote,
    tripId,
}) => {
    const { data, error } = await supabase.rpc(
        "request_business_trip_realization_revision",
        {
            p_business_trip_id: tripId,
            p_revision_note: revisionNote,
        },
    );
    if (error) throw normalizeApprovalError(error);
    const result = await getBusinessTripRealizationVerificationDetail(data.id);
    await notifyBusinessTripEvent(
        NOTIFICATION_EVENT_TYPES.BUSINESS_TRIP_REALIZATION_REVISION_REQUIRED,
        result.trip,
        { revision_note: revisionNote },
    );
    return result.trip;
};

export const verifyBusinessTripRealization = async (tripId) => {
    const { data, error } = await supabase.rpc(
        "verify_business_trip_realization",
        {
            p_business_trip_id: tripId,
        },
    );
    if (error) throw normalizeApprovalError(error);
    const result = await getBusinessTripRealizationVerificationDetail(data.id);
    await notifyBusinessTripEvent(
        NOTIFICATION_EVENT_TYPES.BUSINESS_TRIP_REALIZATION_VERIFIED,
        result.trip,
    );
    if (result.trip.status === DB_TO_UI_STATUS[BUSINESS_TRIP_DB_STATUS.COMPLETED]) {
        await notifyBusinessTripEvent(
            NOTIFICATION_EVENT_TYPES.BUSINESS_TRIP_SETTLEMENT_COMPLETED,
            result.trip,
        );
    }
    return result.trip;
};

const buildSettlementPayload = ({
    accountLabel = "",
    amount,
    notes = "",
    paymentMethod,
    referenceNumber = "",
    transactionDate,
    tripId,
}) => ({
    p_account_label: accountLabel || null,
    p_amount: Number(amount),
    p_business_trip_id: tripId,
    p_notes: notes || null,
    p_payment_method: paymentMethod,
    p_reference_number: referenceNumber || null,
    p_transaction_date: transactionDate
        ? `${transactionDate}T00:00:00`
        : new Date().toISOString(),
});

export const recordBusinessTripAdvanceRefund = async (payload) => {
    const { data, error } = await supabase.rpc(
        "record_business_trip_advance_refund",
        buildSettlementPayload(payload),
    );
    if (error) throw normalizeApprovalError(error);
    const result = await getBusinessTripRealizationVerificationDetail(data.id);
    await notifyBusinessTripEvent(
        NOTIFICATION_EVENT_TYPES.BUSINESS_TRIP_SETTLEMENT_COMPLETED,
        result.trip,
        { amount: payload.amount },
    );
    return result.trip;
};

export const payBusinessTripRealizationShortfall = async (payload) => {
    const { data, error } = await supabase.rpc(
        "pay_business_trip_realization_shortfall",
        buildSettlementPayload(payload),
    );
    if (error) throw normalizeApprovalError(error);
    const result = await getBusinessTripRealizationVerificationDetail(data.id);
    await notifyBusinessTripEvent(
        NOTIFICATION_EVENT_TYPES.BUSINESS_TRIP_SETTLEMENT_COMPLETED,
        result.trip,
        { amount: payload.amount },
    );
    return result.trip;
};

export const getBusinessTripSettlement = async (tripId) => {
    const settlementMap = await loadSettlementMapByTripIds([tripId]);
    return settlementMap[tripId] ?? [];
};

const REPORT_FETCH_PAGE_SIZE = 1000;
const REPORT_FETCH_MAX_ROWS = 10000;

const buildBusinessTripReportQuery = ({
    dateBasis = "created",
    endDate,
    projectId = "",
    settlementStatus = "",
    startDate,
    status = "",
} = {}) => {
    let query = supabase
        .from("business_trips")
        .select(
            "*, business_trip_agendas(id), business_trip_agenda_photos(id), business_trip_advance_disbursements(amount), business_trip_settlements(type, amount)",
            { count: "exact" },
        );

    const dateColumn =
        dateBasis === "completed"
            ? "completed_at"
            : dateBasis === "trip"
              ? "trip_date"
              : "created_at";
    if (dateBasis === "trip") {
        if (startDate && endDate) {
            query = query.or(
                `and(trip_date.gte.${startDate},trip_date.lte.${endDate}),and(trip_start_date.lte.${endDate},trip_end_date.gte.${startDate})`,
            );
        } else if (startDate) {
            query = query.or(
                `trip_date.gte.${startDate},trip_end_date.gte.${startDate}`,
            );
        } else if (endDate) {
            query = query.or(
                `trip_date.lte.${endDate},trip_start_date.lte.${endDate}`,
            );
        }
    } else {
        if (startDate) query = query.gte(dateColumn, `${startDate}T00:00:00`);
        if (endDate) query = query.lt(dateColumn, `${addOneDay(endDate)}T00:00:00`);
    }
    if (projectId) query = query.eq("project_id", projectId);
    if (status) query = query.eq("status", status);
    if (settlementStatus) query = query.eq("settlement_status", settlementStatus);

    return query;
};

const fetchBusinessTripReportRows = async (
    filters = {},
    {
        maxRows = REPORT_FETCH_MAX_ROWS,
        orderColumn =
            filters.dateBasis === "completed"
                ? "completed_at"
                : filters.dateBasis === "trip"
                  ? "trip_date"
                  : "created_at",
        sortMode = filters.sortMode ?? "newest",
    } = {},
) => {
    const rows = [];

    for (let offset = 0; offset < maxRows; offset += REPORT_FETCH_PAGE_SIZE) {
        const to = Math.min(offset + REPORT_FETCH_PAGE_SIZE - 1, maxRows - 1);
        const query = buildBusinessTripReportQuery(filters)
            .order(orderColumn, {
                ascending: sortMode === "oldest",
                nullsFirst: false,
            })
            .range(offset, to);
        const { data, error } = await query;
        if (error) throw error;

        const nextRows = data ?? [];
        rows.push(...nextRows);
        if (nextRows.length < REPORT_FETCH_PAGE_SIZE) break;
    }

    return rows;
};

export const getBusinessTripReport = async ({
    dateBasis = "created",
    endDate,
    page = 1,
    pageSize = 20,
    projectId = "",
    requester = "",
    search = "",
    settlementStatus = "",
    sortMode = "newest",
    startDate,
    status = "",
} = {}) => {
    const projects = await loadBusinessTripProjects();
    const baseFilters = {
        dateBasis,
        endDate,
        projectId,
        settlementStatus,
        startDate,
        status,
        sortMode,
    };

    const orderColumn =
        dateBasis === "completed"
            ? "completed_at"
            : dateBasis === "trip"
              ? "trip_date"
              : "created_at";
    const usesClientFilter = Boolean(search.trim() || requester.trim());
    const rows = usesClientFilter
        ? await fetchBusinessTripReportRows(baseFilters, { orderColumn, sortMode })
        : [];
    const profileMap = await loadProfileMap(rows.map((row) => row.requester_id));
    const projectMap = buildProjectMap(projects);

    if (usesClientFilter) {
        const filteredRows = applyBusinessTripReportFilters(
            rows,
            projects,
            profileMap,
            { requester, search },
        );
        const from = (page - 1) * pageSize;
        return {
            items: filteredRows
                .slice(from, from + pageSize)
                .map((row) => mapBusinessTripReportRow(row, projectMap, profileMap)),
            projects,
            total: filteredRows.length,
        };
    }

    let query = buildBusinessTripReportQuery(baseFilters).order(orderColumn, {
        ascending: sortMode === "oldest",
        nullsFirst: false,
    });
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await query.range(from, to);
    if (error) throw error;

    const pageRows = data ?? [];
    const pageProfileMap = await loadProfileMap(
        pageRows.map((row) => row.requester_id),
    );

    return {
        items: pageRows.map((row) =>
            mapBusinessTripReportRow(row, projectMap, pageProfileMap),
        ),
        projects,
        total: count ?? pageRows.length,
    };
};

export const getBusinessTripReportSummary = async (filters = {}) => {
    const projects = await loadBusinessTripProjects();
    const rows = await fetchBusinessTripReportRows(filters);
    const profileMap = await loadProfileMap(rows.map((row) => row.requester_id));
    const filteredRows = applyBusinessTripReportFilters(
        rows,
        projects,
        profileMap,
        filters,
    );
    const projectMap = buildProjectMap(projects);
    const reportRows = filteredRows.map((row) =>
        mapBusinessTripReportRow(row, projectMap, profileMap),
    );

    return reportRows.reduce(
        (acc, row) => ({
            total: acc.total + 1,
            requestedAmount: acc.requestedAmount + row.requestedAmount,
            disbursedAmount: acc.disbursedAmount + row.disbursedAmount,
            totalRealizationAmount:
                acc.totalRealizationAmount + row.totalRealizationAmount,
            refundAmount: acc.refundAmount + row.refundAmount,
            additionalPaymentAmount:
                acc.additionalPaymentAmount + row.additionalPaymentAmount,
        }),
        {
            total: 0,
            requestedAmount: 0,
            disbursedAmount: 0,
            totalRealizationAmount: 0,
            refundAmount: 0,
            additionalPaymentAmount: 0,
        },
    );
};

export const exportBusinessTripReportRows = async (filters = {}) => {
    const projects = await loadBusinessTripProjects();
    const rows = await fetchBusinessTripReportRows(filters);
    const profileMap = await loadProfileMap(rows.map((row) => row.requester_id));
    const filteredRows = applyBusinessTripReportFilters(
        rows,
        projects,
        profileMap,
        filters,
    );
    const projectMap = buildProjectMap(projects);
    return filteredRows.map((row) =>
        mapBusinessTripReportRow(row, projectMap, profileMap),
    );
};

export const getBusinessTripDashboardSummary = async ({ role, userId }) => {
    const isAdmin = ["admin", "management"].includes(role);
    const countStatus = async (statuses, extra = {}) => {
        let query = supabase
            .from("business_trips")
            .select("id", { count: "exact", head: true });
        if (!isAdmin) query = query.eq("requester_id", userId);
        if (statuses.length === 1) query = query.eq("status", statuses[0]);
        if (statuses.length > 1) query = query.in("status", statuses);
        if (extra.requestedAmountGtZero) query = query.gt("requested_amount", 0);
        const { count, error } = await query;
        if (error) throw error;
        return Number(count ?? 0);
    };

    if (isAdmin) {
        return {
            pendingApproval: await countStatus([
                BUSINESS_TRIP_DB_STATUS.PENDING_APPROVAL,
                BUSINESS_TRIP_DB_STATUS.SUBMITTED,
            ]),
            pendingDisbursement: await countStatus(
                [BUSINESS_TRIP_DB_STATUS.APPROVED],
                { requestedAmountGtZero: true },
            ),
            pendingVerification: await countStatus([
                BUSINESS_TRIP_DB_STATUS.REALIZATION_SUBMITTED,
            ]),
            pendingSettlement: await countStatus([
                BUSINESS_TRIP_DB_STATUS.PENDING_REFUND,
                BUSINESS_TRIP_DB_STATUS.PENDING_ADDITIONAL_PAYMENT,
            ]),
        };
    }

    return {
        draft: await countStatus([BUSINESS_TRIP_DB_STATUS.DRAFT]),
        pendingApproval: await countStatus([
            BUSINESS_TRIP_DB_STATUS.SUBMITTED,
            BUSINESS_TRIP_DB_STATUS.PENDING_APPROVAL,
        ]),
        needsRealization: await countStatus([
            BUSINESS_TRIP_DB_STATUS.APPROVED,
            BUSINESS_TRIP_DB_STATUS.ADVANCE_DISBURSED,
            BUSINESS_TRIP_DB_STATUS.IN_PROGRESS,
            BUSINESS_TRIP_DB_STATUS.REALIZATION_DRAFT,
            BUSINESS_TRIP_DB_STATUS.REALIZATION_REVISION_REQUIRED,
        ]),
        completed: await countStatus([BUSINESS_TRIP_DB_STATUS.COMPLETED]),
    };
};

const getPhotoExtension = (file) => {
    if (file.type === "image/png") return "png";
    if (file.type === "image/webp") return "webp";
    return "jpg";
};

const validateBusinessTripPhotoFile = (file, existingCount = 0) => {
    if (!BUSINESS_TRIP_ALLOWED_PHOTO_TYPES.includes(file.type)) {
        throw new Error("Format foto tidak didukung.");
    }
    if (file.size > BUSINESS_TRIP_MAX_PHOTO_BYTES) {
        throw new Error("Ukuran foto maksimal 5 MB.");
    }
    if (existingCount >= BUSINESS_TRIP_MAX_PHOTOS_PER_AGENDA) {
        throw new Error("Maksimal 10 foto per agenda.");
    }
};

export const uploadBusinessTripAgendaPhoto = async ({
    agendaId,
    businessTripId,
    existingCount = 0,
    file,
}) => {
    validateBusinessTripPhotoFile(file, existingCount);
    const fileToUpload = await compressJobPhotoFile(file, {
        maxBytes: BUSINESS_TRIP_MAX_PHOTO_BYTES,
        maxDimension: 1800,
        minQuality: 0.5,
    });
    const fileId =
        typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const storagePath = `business-trips/${businessTripId}/agendas/${agendaId}/${fileId}.${getPhotoExtension(fileToUpload)}`;

    const { error: uploadError } = await supabase.storage
        .from(BUSINESS_TRIP_PHOTO_BUCKET)
        .upload(storagePath, fileToUpload, { upsert: false });
    if (uploadError) throw new Error("Gagal mengunggah foto.");

    const { data: realization } = await supabase
        .from("business_trip_agenda_realizations")
        .select("id")
        .eq("business_trip_id", businessTripId)
        .eq("agenda_id", agendaId)
        .maybeSingle();

    const { data, error } = await supabase
        .from("business_trip_agenda_photos")
        .insert({
            agenda_id: agendaId,
            business_trip_id: businessTripId,
            file_name: file.name,
            original_file_name: file.name,
            file_size: fileToUpload.size,
            mime_type: fileToUpload.type || file.type,
            realization_id: realization?.id ?? null,
            storage_path: storagePath,
            uploaded_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .select()
        .single();

    if (error) {
        await supabase.storage
            .from(BUSINESS_TRIP_PHOTO_BUCKET)
            .remove([storagePath]);
        throw new Error("Gagal menyimpan metadata foto.");
    }

    const photo = mapAgendaPhotoFromDb(data);
    return {
        ...photo,
        previewUrl: await getBusinessTripSignedPhotoUrl(photo.storagePath),
    };
};

export const deleteBusinessTripAgendaPhoto = async (photo) => {
    if (!photo?.id) throw new Error("Foto tidak valid.");
    const storagePath = photo.storagePath ?? photo.storage_path;

    if (storagePath) {
        const { error: storageError } = await supabase.storage
            .from(BUSINESS_TRIP_PHOTO_BUCKET)
            .remove([storagePath]);
        if (storageError) throw new Error("Gagal menghapus foto.");
    }

    const { error } = await supabase
        .from("business_trip_agenda_photos")
        .delete()
        .eq("id", photo.id);
    if (error) throw new Error("Gagal menghapus metadata foto.");
};

export const getBusinessTripAgendaPhotos = async ({ agendaId, businessTripId }) => {
    const { data, error } = await supabase
        .from("business_trip_agenda_photos")
        .select("*")
        .eq("business_trip_id", businessTripId)
        .eq("agenda_id", agendaId)
        .order("created_at", { ascending: true });

    if (error) throw error;
    return Promise.all(
        (data ?? []).map(async (photo) => {
            const mappedPhoto = mapAgendaPhotoFromDb(photo);
            return {
                ...mappedPhoto,
                previewUrl: await getBusinessTripSignedPhotoUrl(
                    mappedPhoto.storagePath,
                ),
            };
        }),
    );
};

export const deleteBusinessTripDraft = async (tripId) => {
    const { error } = await supabase.rpc("delete_business_trip_draft", {
        p_business_trip_id: tripId,
    });
    if (error) throw error;
};

export const buildBusinessTripAccommodationPayload = ({ project, trip }) => ({
    project_id: trip.projectId,
    project_name: project?.project_name ?? null,
    request_title: `${trip.businessTripNo} - ${trip.title}`,
    purpose: trip.title,
    requested_amount: Number(trip.accommodationRequest?.requestedAmount ?? 0),
});

export const getBusinessTripStatusHistory = async (tripId) => {
    const { data, error } = await supabase
        .from("business_trip_status_history")
        .select("*")
        .eq("business_trip_id", tripId)
        .order("acted_at", { ascending: true });

    if (error) throw error;
    const actorMap = await loadProfileMap((data ?? []).map((item) => item.acted_by));
    return (data ?? []).map((item) => ({
        ...item,
        actedByName: actorMap[item.acted_by]?.displayName ?? "",
    }));
};
