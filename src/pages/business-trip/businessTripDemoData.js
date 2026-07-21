import { createAgendaItem } from "./businessTripAgendaModel";

const addDays = (date, days) => {
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + days);
    return nextDate.toISOString().slice(0, 10);
};

export const createBusinessTripDemoPatch = (requesterName = "User Dummy") => {
    const today = new Date();
    const kickoffAgenda = createAgendaItem();
    const surveyAgenda = createAgendaItem();

    return {
        dateMode: "range",
        startDate: addDays(today, 3),
        endDate: addDays(today, 4),
        tripDate: addDays(today, 3),
        title: "Kunjungan site customer Bandung",
        projectId: "project-bandung-retail",
        initiator: "management",
        initiatorName: "Management Operational",
        requesterName,
        agendas: [
            {
                ...kickoffAgenda,
                title: "Kickoff meeting dengan customer",
                objective:
                    "Menyamakan scope pekerjaan, timeline, dan PIC lapangan sebelum pekerjaan dimulai.",
                expanded: false,
            },
            {
                ...surveyAgenda,
                title: "Survey lokasi instalasi",
                objective:
                    "Mengecek kondisi area, akses teknisi, titik pemasangan, dan kebutuhan material tambahan.",
                expanded: true,
            },
        ],
    };
};
