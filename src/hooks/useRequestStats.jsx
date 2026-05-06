import { useEffect, useRef, useState, useCallback } from "react";
import supabase from "../supabaseClient";
import { useAuth } from "../context/useAuth";
import {
    cleanupAllChannels,
    createUniqueChannelName,
} from "../utils/realtimeChannelManager";

const INITIAL_STATS = {
    pending: 0,
    inProgress: 0,
    completed: 0,
    active: 0,
};

const countByStatus = async (status, { onlyUnassigned = false } = {}) => {
    let query = supabase
        .from("requests")
        .select("*", { count: "exact", head: true });

    if (status === "pending") {
        query = query.in("status", ["pending", "requested"]);
    } else {
        query = query.eq("status", status);
    }

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
    const loadingRef = useRef(loading);
    const userIdRef = useRef(user?.id);

    // ✅ Update refs without triggering effects
    useEffect(() => {
        roleRef.current = role;
    }, [role]);

    useEffect(() => {
        userIdRef.current = user?.id;
    }, [user?.id]);

    useEffect(() => {
        loadingRef.current = loading;
    }, [loading]);

    // ✅ Define loadStats as a stable function
    const loadStats = useCallback(async () => {
        try {
            // Guard: Don't load if still loading or no user yet
            if (loadingRef.current || !userIdRef.current) {
                return;
            }

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

    // ✅ Setup channel with proper lifecycle management
    useEffect(() => {
        // Guard: Don't setup if still loading or no user
        if (loading || !user?.id) {
            return;
        }

        isMountedRef.current = true;

        // Immediate stats load
        loadStats();

        // Async channel setup with unique name
        const setupChannel = async () => {
            try {
                // ✅ CRITICAL FIX: Cleanup ALL existing channels before creating new one
                // This prevents "cannot add postgres_changes callbacks after subscribe()" error
                await cleanupAllChannels();

                // ✅ CRITICAL FIX: Use unique channel name with user ID
                const channelName = createUniqueChannelName(
                    "requests-stats",
                    user.id,
                );

                // ✅ Skip if channel already exists
                const existingChannels = supabase.getChannels();
                const existing = existingChannels.find(
                    (ch) => ch.topic === `realtime:${channelName}`,
                );

                if (existing) {
                    console.log(
                        "[useRequestStats] Channel already exists, reusing:",
                        channelName,
                    );
                    channelRef.current = existing;
                    return;
                }

                // Create new channel
                const channel = supabase.channel(channelName).on(
                    "postgres_changes",
                    {
                        event: "*",
                        schema: "public",
                        table: "requests",
                    },
                    () => {
                        // Only call loadStats if mounted
                        if (isMountedRef.current) {
                            loadStats();
                        }
                    },
                );

                const { error } = await channel.subscribe();

                if (error) {
                    console.error("[useRequestStats] Subscribe error:", error);
                    return;
                }

                channelRef.current = channel;
                console.log("[useRequestStats] Subscribed to:", channelName);
            } catch (error) {
                console.error("[useRequestStats] Channel setup error:", error);
            }
        };

        setupChannel();

        // Polling backup every 5 seconds (for reliability)
        const intervalId = setInterval(() => {
            if (isMountedRef.current && !loadingRef.current) {
                loadStats();
            }
        }, 5000);

        // Reload when tab becomes visible
        const handleFocus = () => {
            if (
                document.visibilityState === "visible" &&
                isMountedRef.current
            ) {
                loadStats();
            }
        };

        document.addEventListener("visibilitychange", handleFocus);
        window.addEventListener("focus", handleFocus);

        // ✅ Cleanup function
        return () => {
            isMountedRef.current = false;

            // Clear intervals and event listeners
            clearInterval(intervalId);
            document.removeEventListener("visibilitychange", handleFocus);
            window.removeEventListener("focus", handleFocus);

            // ✅ CRITICAL FIX: Proper cleanup using supabase.removeChannel()
            // NOT .unsubscribe() - that only stops receiving events
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
                console.log("[useRequestStats] Channel cleaned up");
            }
        };
    }, [loading, user?.id, loadStats]); // ✅ Only depends on auth

    return stats;
}
