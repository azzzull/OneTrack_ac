import { BUSINESS_TRIP_PREFIX } from "./businessTripConstants";

const dummyDailySequence = new Map();

const padTwoDigits = (value) => String(value).padStart(2, "0");

export const getBusinessTripDateKey = (createdDate) => {
    const date = new Date(createdDate);
    const year = padTwoDigits(date.getFullYear() % 100);
    const month = padTwoDigits(date.getMonth() + 1);
    const day = padTwoDigits(date.getDate());
    return `${year}${month}${day}`;
};

export const generateBusinessTripNumber = (createdDate, dailySequence) =>
    `${BUSINESS_TRIP_PREFIX}-${getBusinessTripDateKey(createdDate)}${padTwoDigits(
        dailySequence,
    )}`;

export const getNextDummyBusinessTripSequence = (createdDate) => {
    const key = getBusinessTripDateKey(createdDate);
    const nextSequence = (dummyDailySequence.get(key) ?? 0) + 1;
    dummyDailySequence.set(key, nextSequence);
    return nextSequence;
};

export const generateDummyBusinessTripNumber = (createdDate) => {
    // Demo-only fallback. Production numbers are generated atomically by the database.
    const dailySequence = getNextDummyBusinessTripSequence(createdDate);
    return generateBusinessTripNumber(createdDate, dailySequence);
};

export const dummyBusinessTripNumberScenarios = {
    sameDate: [
        generateBusinessTripNumber("2026-07-17T08:00:00", 1),
        generateBusinessTripNumber("2026-07-17T09:00:00", 2),
        generateBusinessTripNumber("2026-07-17T10:00:00", 3),
    ],
    differentDate: [generateBusinessTripNumber("2026-07-18T08:00:00", 1)],
};
