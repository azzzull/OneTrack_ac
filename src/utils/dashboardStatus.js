const STATUS_META = {
    pending: { label: "Pending", color: "#ff893b" },
    in_progress: { label: "In Progress", color: "#87c6f8" },
    completed: { label: "Completed", color: "#37a0f4" },
    cancelled: { label: "Cancelled", color: "#94a3b8" },
};

export function buildStatusSegments(statusCounts) {
    return ["pending", "in_progress", "completed", "cancelled"].map((key) => ({
        key,
        value: statusCounts[key] ?? 0,
        label: STATUS_META[key].label,
        color: STATUS_META[key].color,
    }));
}
