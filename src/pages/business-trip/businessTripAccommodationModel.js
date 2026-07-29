export const onlyAccommodationDigits = (value) =>
    String(value ?? "").replace(/\D/g, "");

export const parseAccommodationAmount = (value) => {
    const digits = onlyAccommodationDigits(value);
    if (!digits) return 0;
    return Number(digits);
};

export const formatAccommodationAmountInput = (value) => {
    const amount = Number(value ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return "";
    return `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;
};

export const formatAccommodationAmount = (value) => {
    const amount = Number(value ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return "Rp 0";
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
    }).format(amount);
};

export const hasAccommodationRequest = (request) =>
    Number(request?.requestedAmount ?? 0) > 0;

export const validateAccommodationRequest = (request) => {
    const amount = Number(request?.requestedAmount ?? 0);
    if (!Number.isFinite(amount)) return "Masukkan nominal yang valid";
    if (amount < 0) return "Requested Amount tidak boleh negatif";
    return "";
};

export const buildAccommodationRequestTitle = (businessTripNo, title) =>
    `${businessTripNo || "-"} - ${title || "Business Trip"}`;

export const buildAccommodationPayload = ({ project, trip }) => ({
    projectId: trip.projectId,
    projectName: project?.project_name ?? "",
    requestTitle: buildAccommodationRequestTitle(
        trip.businessTripNo,
        trip.title,
    ),
    purpose: trip.title,
    requestedAmount: Number(trip.accommodationRequest?.requestedAmount ?? 0),
});
