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

export const isAccommodationPaidForBusinessTrip = (request) => {
    const status = String(request?.status ?? "").toLowerCase();
    if (["realization_process", "partial_realized", "realized"].includes(status)) {
        return true;
    }
    return status === "approved" && Boolean(request?.transferProofUrl);
};

export const getBusinessTripAccommodationState = (request) => {
    if (!hasAccommodationRequest(request)) {
        return {
            canStartTrip: true,
            label: "Tidak mengajukan uang muka akomodasi",
            tone: "slate",
        };
    }

    const status = String(request?.status ?? "").toLowerCase();
    if (!request?.id) {
        return {
            canStartTrip: false,
            label: "Menunggu Pengajuan Akomodasi",
            tone: "amber",
        };
    }
    if (status === "pending") {
        return {
            canStartTrip: false,
            label: "Menunggu Approval Akomodasi",
            tone: "amber",
        };
    }
    if (status === "rejected") {
        return {
            canStartTrip: false,
            label: "Pengajuan Akomodasi Ditolak",
            tone: "red",
        };
    }
    if (isAccommodationPaidForBusinessTrip(request)) {
        return {
            canStartTrip: true,
            label: "Dana Akomodasi Telah Dibayar",
            tone: "emerald",
        };
    }
    if (status === "approved") {
        return {
            canStartTrip: false,
            label: "Menunggu Pembayaran Akomodasi",
            tone: "sky",
        };
    }

    return {
        canStartTrip: false,
        label: "Menunggu Proses Akomodasi",
        tone: "slate",
    };
};

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
