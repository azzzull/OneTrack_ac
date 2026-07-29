import { BUSINESS_TRIP_STATUS } from "./businessTripConstants";

export const BUSINESS_TRIP_CARD_STYLE = {
    [BUSINESS_TRIP_STATUS.DRAFT]: {
        background: "linear-gradient(135deg, #F4F8FF 0%, #DBEAFE 100%)",
        borderColor: "#BBD1F4",
    },
    [BUSINESS_TRIP_STATUS.SUBMITTED]: {
        background: "linear-gradient(135deg, #FFF7D6 0%, #FFE9A8 100%)",
        borderColor: "#F59E0B",
    },
    [BUSINESS_TRIP_STATUS.PENDING_APPROVAL]: {
        background: "linear-gradient(135deg, #FFF7D6 0%, #FFE9A8 100%)",
        borderColor: "#F59E0B",
    },
    [BUSINESS_TRIP_STATUS.REJECTED]: {
        background: "linear-gradient(135deg, #FFF0F3 0%, #FFC9D2 100%)",
        borderColor: "#F3AAB7",
    },
    [BUSINESS_TRIP_STATUS.APPROVED]: {
        background: "linear-gradient(135deg, #E7FBF1 0%, #C8F2DA 100%)",
        borderColor: "#9BDDBB",
    },
    [BUSINESS_TRIP_STATUS.ADVANCE_DISBURSED]: {
        background: "linear-gradient(135deg, #E0FCFF 0%, #BFF3EF 100%)",
        borderColor: "#8EDDD8",
    },
    [BUSINESS_TRIP_STATUS.IN_PROGRESS]: {
        background: "linear-gradient(135deg, #E0F2FF 0%, #BAEAFE 100%)",
        borderColor: "#8FD1F0",
    },
    [BUSINESS_TRIP_STATUS.REALIZATION_DRAFT]: {
        background: "linear-gradient(135deg, #DFF8F4 0%, #BFF0E8 100%)",
        borderColor: "#8EDBD0",
    },
    [BUSINESS_TRIP_STATUS.REALIZATION_SUBMITTED]: {
        background: "linear-gradient(135deg, #F0EAFF 0%, #DCE5FF 100%)",
        borderColor: "#BFC8F3",
    },
    [BUSINESS_TRIP_STATUS.REALIZATION_REVISION_REQUIRED]: {
        background: "linear-gradient(135deg, #FFF7ED 0%, #FED7AA 100%)",
        borderColor: "#FDBA74",
    },
    [BUSINESS_TRIP_STATUS.PENDING_REFUND]: {
        background: "linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 100%)",
        borderColor: "#FDBA74",
    },
    [BUSINESS_TRIP_STATUS.PENDING_ADDITIONAL_PAYMENT]: {
        background: "linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)",
        borderColor: "#FBBF24",
    },
    [BUSINESS_TRIP_STATUS.COMPLETED]: {
        background: "linear-gradient(135deg, #E7FBEF 0%, #D2F4DF 100%)",
        borderColor: "#A9E1BF",
    },
};

export const getBusinessTripCardStyle = (status) =>
    BUSINESS_TRIP_CARD_STYLE[status] ?? BUSINESS_TRIP_CARD_STYLE[BUSINESS_TRIP_STATUS.DRAFT];
