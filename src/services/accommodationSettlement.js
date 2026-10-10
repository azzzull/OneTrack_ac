const normalizeStatus = (value) =>
    String(value ?? "pending")
        .trim()
        .toLowerCase()
        .replaceAll("-", "_")
        .replaceAll(" ", "_");

const getTotalRealized = (request) => {
    if (request?.totalRealized !== undefined && request?.totalRealized !== null) {
        return Number(request.totalRealized);
    }

    return (request?.realizations ?? []).reduce(
        (total, realization) => total + Number(realization?.amount ?? 0),
        0,
    );
};

export const isAccommodationFullyRealized = (request) => {
    if (normalizeStatus(request?.status) !== "realized") return false;

    const approvedAmount = Number(request?.approved_amount ?? 0);
    const totalRealized = getTotalRealized(request);

    return (
        Number.isFinite(approvedAmount) &&
        approvedAmount > 0 &&
        Number.isFinite(totalRealized) &&
        totalRealized >= approvedAmount
    );
};

export const hasOpenAccommodationSettlement = (request) =>
    normalizeStatus(request?.status) !== "rejected" &&
    !isAccommodationFullyRealized(request);
