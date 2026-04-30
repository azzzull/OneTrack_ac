import { useEffect, useRef, useState, useCallback } from "react";
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
    const isMountedRef = useRef(false);
    const roleRef = useRef(role);

    // 🔹 selalu update role tanpa re-trigger effect
    useEffect(() => {
        roleRef.current = role;
    }, [role]);

    // 🔥 function load stats (dibungkus biar stabil)
    const loadStats = useCallback(async () => {
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
    }, []);

    // 🔥 effect utama (auth + realtime)
    useEffect(() => {
        if (loading || !user) return;

        isMountedRef.current = true;

        // 🔥 load pertama
        loadStats();

        // 🔥 cegah double subscribe
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

        // 🔹 polling backup (optional)
        const intervalId = setInterval(() => {
            loadStats();
        }, 5000);

        // 🔹 reload saat tab aktif lagi
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

            // 🔥 cleanup channel dengan benar
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [loading, user, loadStats]);

    return stats;
}
