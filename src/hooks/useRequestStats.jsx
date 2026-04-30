import { useEffect, useRef, useState } from "react";
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
    const { role, user, loading } = useAuth();
    const [stats, setStats] = useState(INITIAL_STATS);
    const channelRef = useRef(null);
    const isMountedRef = useRef(true);
    const roleRef = useRef(role);

    // Update role ref whenever role changes (without triggering effect)
    useEffect(() => {
        roleRef.current = role;
    }, [role]);

    // Setup channel only once on mount AND after user is authenticated
    useEffect(() => {
        // Don't setup channel if user is still loading or not authenticated
        if (loading || !user) {
            return;
        }

        isMountedRef.current = true;

        const loadStats = async () => {
            try {
                const onlyUnassignedPending = roleRef.current === "technician";
                const [pending, inProgress, completed] = await Promise.all([
                    countByStatus("pending", {
                        onlyUnassigned: onlyUnassignedPending,
                    }),
                    countByStatus("in_progress"),
                    countByStatus("completed"),
                ]);

                if (isMountedRef.current) {
                    setStats({
                        pending,
                        inProgress,
                        completed,
                        active: pending + inProgress,
                    });
                }
            } catch (error) {
                console.error("Error loading request stats:", error);
            }
        };

        const timerId = setTimeout(() => {
            loadStats();
        }, 0);

        // Create and subscribe to channel - only once
        if (!channelRef.current) {
            channelRef.current = supabase
                .channel("requests-stats")
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "requests" },
                    () => {
                        loadStats();
                    },
                )
                .subscribe();
        }

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
            isMountedRef.current = false;
            clearTimeout(timerId);
            clearInterval(intervalId);
            document.removeEventListener(
                "visibilitychange",
                onVisibilityOrFocus,
            );
            window.removeEventListener("focus", onVisibilityOrFocus);
            // Unsubscribe channel only on unmount
            if (channelRef.current) {
                channelRef.current.unsubscribe();
                channelRef.current = null;
            }
        };
    }, [loading, user]); // Re-run only when user authentication status changes

    return stats;
}
