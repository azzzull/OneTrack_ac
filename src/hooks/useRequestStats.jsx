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
            setStats(INITIAL_STATS);
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

        return () => {
            clearTimeout(timerId);
            channel.unsubscribe();
        };
    }, [loadStats]);

    return stats;
}
