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

    // ✅ Update role ref without triggering effects
    useEffect(() => {
        roleRef.current = role;
    }, [role]);

    // ✅ Define loadStats function (will be called directly, not as dependency)
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

    // ✅ Setup channel once after authentication
    useEffect(() => {
        if (loading || !user) return;

        isMountedRef.current = true;

        // Load stats immediately
        loadStats();

        // ✅ Create channel only once per session
        if (!channelRef.current) {
            channelRef.current = supabase
                .channel("requests-stats")
                .on(
                    "postgres_changes",
                    {
                        event: "*",
                        schema: "public",
                        table: "requests",
                    },
                    () => {
                        loadStats();
                    },
                )
                .subscribe();
        }

        // Polling backup every 5 seconds
        const intervalId = setInterval(() => {
            loadStats();
        }, 5000);

        // Reload when tab becomes visible
        const handleFocus = () => {
            if (document.visibilityState === "visible") {
                loadStats();
            }
        };

        document.addEventListener("visibilitychange", handleFocus);
        window.addEventListener("focus", handleFocus);

        return () => {
            isMountedRef.current = false;

            clearInterval(intervalId);
            document.removeEventListener("visibilitychange", handleFocus);
            window.removeEventListener("focus", handleFocus);

            // ✅ Proper cleanup: unsubscribe AND remove channel
            if (channelRef.current) {
                channelRef.current.unsubscribe();
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [loading, user]); // ✅ Only depends on auth status

    return stats;
}
