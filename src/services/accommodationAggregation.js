const toAmount = (value) => {
    const amount = Number(value ?? 0);
    return Number.isFinite(amount) ? amount : 0;
};

const getRequestDate = (item) =>
    item?.requested_at ?? item?.created_at ?? item?.reviewed_at ?? null;

const normalizeStatus = (value) =>
    String(value ?? "pending")
        .trim()
        .toLowerCase()
        .replaceAll("-", "_")
        .replaceAll(" ", "_");

export const requiresAccommodationMonitoring = (item) =>
    !["realized", "rejected"].includes(normalizeStatus(item?.status));

const GROUP_STATUS_PRIORITY = {
    pending: 0,
    approved: 1,
    realization_process: 2,
    partial_realized: 2,
    realized: 3,
    rejected: 4,
};

export const deriveAccommodationGroupStatus = (items) =>
    [...items]
        .map((item) => String(item?.status ?? "pending").toLowerCase())
        .sort(
            (left, right) =>
                (GROUP_STATUS_PRIORITY[left] ?? GROUP_STATUS_PRIORITY.pending) -
                (GROUP_STATUS_PRIORITY[right] ?? GROUP_STATUS_PRIORITY.pending),
        )[0] ?? "pending";

export const groupAccommodationRequestsByTechnician = (items) => {
    const groups = new Map();

    for (const item of items) {
        const id = item?.technician_id ?? "unknown";
        const group = groups.get(id) ?? {
            id,
            technician: item?.technician ?? null,
            items: [],
        };
        group.items.push(item);
        groups.set(id, group);
    }

    return [...groups.values()]
        .map((group) => {
            const itemsByNewest = [...group.items].sort(
                (left, right) =>
                    new Date(getRequestDate(right) ?? 0) -
                    new Date(getRequestDate(left) ?? 0),
            );
            const totals = itemsByNewest.reduce(
                (summary, item) => ({
                    requestedAmount:
                        summary.requestedAmount + toAmount(item.requested_amount),
                    approvedAmount:
                        summary.approvedAmount + toAmount(item.approved_amount),
                    realizedAmount:
                        summary.realizedAmount + toAmount(item.totalRealized),
                    remainingAmount:
                        summary.remainingAmount + toAmount(item.remainingAmount),
                    pending:
                        summary.pending + (item.status === "pending" ? 1 : 0),
                    inRealization:
                        summary.inRealization +
                        (["approved", "realization_process", "partial_realized"].includes(
                            item.status,
                        )
                            ? 1
                            : 0),
                }),
                {
                    requestedAmount: 0,
                    approvedAmount: 0,
                    realizedAmount: 0,
                    remainingAmount: 0,
                    pending: 0,
                    inRealization: 0,
                },
            );

            return {
                ...group,
                items: itemsByNewest,
                latestAt: getRequestDate(itemsByNewest[0]),
                status: deriveAccommodationGroupStatus(itemsByNewest),
                ...totals,
            };
        })
        .sort(
            (left, right) =>
                (GROUP_STATUS_PRIORITY[left.status] ?? GROUP_STATUS_PRIORITY.pending) -
                    (GROUP_STATUS_PRIORITY[right.status] ?? GROUP_STATUS_PRIORITY.pending) ||
                new Date(right.latestAt ?? 0) - new Date(left.latestAt ?? 0),
        );
};
