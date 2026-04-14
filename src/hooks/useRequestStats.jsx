import { useCallback, useEffect, useState } from "react";
import supabase from "../supabaseClient";
import { useAuth } from "../context/useAuth";

const INITIAL_STATS = {
    pending: 0,
    inProgress: 0,
    completed: 0,
    active: 0,
};

const countByStatus = async (status, { onlyUnassigned = false } = {}) => {
    let query = supabase
        .from("requests")
        .select("*", { count: "exact", head: true })
        .eq("status", status);

    if (onlyUnassigned) {
        query = query.is("technician_id", null);
    }

    const { count, error } = await query;

    if (error) throw error;
    return count ?? 0;
};

export default function useRequestStats() {
    const { role } = useAuth();
    const [stats, setStats] = useState(INITIAL_STATS);

    const loadStats = useCallback(async () => {
        try {
            const onlyUnassignedPending = role === "technician";
            const [pending, inProgress, completed] = await Promise.all([
                countByStatus("pending", {
                    onlyUnassigned: onlyUnassignedPending,
                }),
                countByStatus("in_progress"),
                countByStatus("completed"),
            ]);

            setStats({
                pending,
                inProgress,
                completed,
                active: pending + inProgress,
            });
        } catch (error) {
            console.error("Error loading request stats:", error);
            // Keep previous stats to avoid noisy resets (which can trigger repeated notifications)
        }
    }, [role]);

    useEffect(() => {
        const timerId = setTimeout(() => {
            loadStats();
        }, 0);

        const channel = supabase
            .channel("requests-stats")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "requests" },
                () => {
                    loadStats();
                },
            )
            .subscribe();

        const intervalId = setInterval(() => {
            loadStats();
        }, 5000);

        const onVisibilityOrFocus = () => {
            if (document.visibilityState === "visible") {
                loadStats();
            }
        };

        document.addEventListener("visibilitychange", onVisibilityOrFocus);
        window.addEventListener("focus", onVisibilityOrFocus);

        return () => {
            clearTimeout(timerId);
            clearInterval(intervalId);
            document.removeEventListener(
                "visibilitychange",
                onVisibilityOrFocus,
            );
            window.removeEventListener("focus", onVisibilityOrFocus);
            channel.unsubscribe();
        };
    }, [loadStats]);

    return stats;
}
