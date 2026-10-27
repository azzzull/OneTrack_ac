import supabase from "../supabaseClient";
import { loadAccommodationRequests } from "./accommodationService";
import { normalizePaymentStatus } from "./reimbursementAggregation";
import { loadReimbursements } from "./reimbursementService";

const getAccommodationProjectName = (request) =>
    request?.project_name ||
    request?.project?.project_name ||
    request?.project?.name ||
    "";

const isUuid = (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        String(value ?? ""),
    );

const getBusinessTripId = (request) => {
    if (isUuid(request?.business_trip_id)) return request.business_trip_id;
    if (
        String(request?.source_module ?? "").toLowerCase() ===
            "business_trip" &&
        isUuid(request?.source_id)
    ) {
        return request.source_id;
    }
    return "";
};

const getBusinessTripIds = (requests) =>
    [...new Set(requests.map(getBusinessTripId).filter(Boolean))];

const loadBusinessTripDetails = async (requests) => {
    const tripIds = getBusinessTripIds(requests);
    if (tripIds.length === 0) return {};

    const { data: trips, error: tripError } = await supabase
        .from("business_trips")
        .select("id, business_trip_no, project_id, title")
        .in("id", tripIds);

    if (tripError) {
        console.warn(
            "[GeneralReport] Business Trip lookup skipped:",
            tripError.message,
        );
        return {};
    }

    const projectIds = [
        ...new Set((trips ?? []).map((trip) => trip.project_id).filter(Boolean)),
    ];
    let projectMap = {};

    if (projectIds.length > 0) {
        const { data: projects, error: projectError } = await supabase
            .from("master_projects")
            .select("id, project_name")
            .in("id", projectIds);

        if (projectError) {
            console.warn(
                "[GeneralReport] Business Trip project lookup skipped:",
                projectError.message,
            );
        } else {
            projectMap = (projects ?? []).reduce((map, project) => {
                map[project.id] = project;
                return map;
            }, {});
        }
    }

    return (trips ?? []).reduce((map, trip) => {
        map[trip.id] = {
            ...trip,
            projectName: projectMap[trip.project_id]?.project_name ?? "",
        };
        return map;
    }, {});
};

const mapAccommodationRecord = (request, businessTripById) => {
    const businessTripId = getBusinessTripId(request);
    const businessTrip = businessTripById[businessTripId] ?? null;
    const isBusinessTrip = Boolean(businessTripId);

    return {
        id: `accommodation-${request.id}`,
        sourceId: request.id,
        category: "accommodation",
        date: request.requested_at ?? request.created_at ?? request.reviewed_at,
        employee: request.technician ?? null,
        employeeId: request.technician_id ?? "",
        amount: Number(request.requested_amount ?? 0),
        approvedAmount: Number(request.approved_amount ?? 0),
        approvedBy: request.reviewer ?? null,
        actualAmount: Number(request.totalRealized ?? 0),
        businessTripNo: businessTrip?.business_trip_no ?? "",
        businessTripTitle: businessTrip?.title ?? "",
        description: request.request_title || request.purpose || "Akomodasi",
        isBusinessTrip,
        projectName:
            getAccommodationProjectName(request) || businessTrip?.projectName || "-",
        status: request.status ?? "pending",
        transferProofUrl: request.transfer_proof_url ?? "",
        statusGroup:
            request.status === "rejected"
                ? "rejected"
                : request.status === "pending"
                  ? "pending"
                  : request.status === "realized"
                    ? "completed"
                    : ["realization_process", "partial_realized"].includes(
                          request.status,
                      )
                      ? "in_progress"
                      : "approved",
        statusLabel: request.status ?? "pending",
    };
};

const mapReimbursementRecord = (reimbursement) => {
    const paymentStatus = normalizePaymentStatus(reimbursement.payment_status);
    const isPaid =
        reimbursement.status === "approved" && paymentStatus === "paid";

    return {
        id: `reimbursement-${reimbursement.id}`,
        sourceId: reimbursement.id,
        category: "reimbursement",
        date: reimbursement.transaction_date ?? reimbursement.created_at,
        employee: reimbursement.requester ?? null,
        employeeId: reimbursement.requester_id ?? "",
        amount: Number(reimbursement.claim_amount ?? 0),
        approvedAmount: Number(reimbursement.approved_amount ?? 0),
        approvedBy: reimbursement.approver ?? null,
        actualAmount: isPaid ? Number(reimbursement.approved_amount ?? 0) : 0,
        businessTripNo: "",
        businessTripTitle: "",
        description: reimbursement.description || "Reimbursement",
        isBusinessTrip: false,
        projectName: "-",
        status: reimbursement.status ?? "pending",
        transferProofUrl: reimbursement.transfer_proof_url ?? "",
        statusGroup:
            reimbursement.status === "rejected"
                ? "rejected"
                : reimbursement.status === "pending"
                  ? "pending"
                  : isPaid
                    ? "completed"
                    : "approved",
        statusLabel: reimbursement.status ?? "pending",
    };
};

export const loadGeneralReportData = async ({ role, userId } = {}) => {
    const [accommodations, reimbursements] = await Promise.all([
        loadAccommodationRequests({ role, userId }),
        loadReimbursements({ role, userId }),
    ]);
    const businessTripById = await loadBusinessTripDetails(accommodations);

    const records = [
        ...accommodations.map((request) =>
            mapAccommodationRecord(request, businessTripById),
        ),
        ...reimbursements.map(mapReimbursementRecord),
    ];

    return records
        .filter((record) => record.approvedAmount > 0)
        .sort((left, right) => new Date(right.date ?? 0) - new Date(left.date ?? 0));
};
