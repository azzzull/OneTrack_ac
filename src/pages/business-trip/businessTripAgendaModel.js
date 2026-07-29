const createLocalId = (prefix) => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const createAgendaItem = () => ({
    id: createLocalId("agenda"),
    title: "",
    objective: "",
    realization: {
        result: "",
        photos: [],
    },
    expanded: true,
});

export const getAgendaTitle = (agenda) => agenda?.title ?? agenda?.name ?? "";

export const getAgendaObjective = (agenda) =>
    agenda?.objective ?? agenda?.description ?? "";

export const normalizeAgenda = (agenda) => ({
    ...agenda,
    title: getAgendaTitle(agenda),
    objective: getAgendaObjective(agenda),
    realization: {
        result: agenda?.realization?.result ?? agenda?.result ?? "",
        photos: agenda?.realization?.photos ?? agenda?.photos ?? [],
    },
});
