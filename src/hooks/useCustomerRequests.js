import { useEffect, useRef, useState } from "react";
import supabase from "../supabaseClient";
import { cleanupAllChannels } from "../utils/realtimeChannelManager";

const sortByCreatedAtDesc = (items) =>
    [...items].sort(
        (a, b) => new Date(b?.created_at ?? 0) - new Date(a?.created_at ?? 0),
    );

const upsertRequest = (items, row) => {
    const next = [...items];
    const index = next.findIndex((item) => item.id === row.id);

    if (index >= 0) {
        next[index] = row;
    } else {
        next.push(row);
    }

    return sortByCreatedAtDesc(next);
};

export default function useCustomerRequests(user) {
    const [loading, setLoading] = useState(true);
    const [requests, setRequests] = useState([]);
    const channelRef = useRef(null);
    const isMountedRef = useRef(true);
    const userRef = useRef(user);

    // ✅ Update user ref without triggering effects
    useEffect(() => {
        userRef.current = user;
    }, [user]);

    const fetchCustomerRequests = async () => {
        if (!userRef.current?.id) {
            if (isMountedRef.current) {
                setRequests([]);
                setLoading(false);
            }
            return;
        }

        if (isMountedRef.current) setLoading(true);

        try {
            // RLS enforces tenant boundary (customer_id IN get_assigned_customers(auth.uid()))
            const { data: requestData, error: requestError } = await supabase
                .from("requests")
                .select("*")
                .order("created_at", { ascending: false });

            if (requestError) throw requestError;
            if (isMountedRef.current) {
                setRequests(requestData ?? []);
            }
        } catch (error) {
            console.error("Error loading customer requests:", error);
            if (isMountedRef.current) {
                setRequests([]);
            }
        } finally {
            if (isMountedRef.current) {
                setLoading(false);
            }
        }
    };

    // ✅ Mount/unmount tracking
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // ✅ Initial load and visibility tracking
    useEffect(() => {
        fetchCustomerRequests();

        const onVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                fetchCustomerRequests();
            }
        };

        document.addEventListener("visibilitychange", onVisibilityChange);

        return () => {
            document.removeEventListener(
                "visibilitychange",
                onVisibilityChange,
            );
        };
        // Intentionally no deps to preserve original lifecycle
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ✅ Setup realtime subscription with proper lifecycle management
    useEffect(() => {
        if (!userRef.current?.id) return;

        const setupChannel = async () => {
            try {
                await cleanupAllChannels();

                const channelName = `customer-requests-${userRef.current.id}`;

                // ✅ Skip if channel already exists
                const existingChannels = supabase.getChannels();
                const existing = existingChannels.find(
                    (ch) => ch.topic === `realtime:${channelName}`,
                );

                if (existing) {
                    channelRef.current = existing;
                    return;
                }

                channelRef.current = supabase
                    .channel(channelName)
                    .on(
                        "postgres_changes",
                        {
                            event: "DELETE",
                            schema: "public",
                            table: "requests",
                        },
                        (payload) => {
                            if (!isMountedRef.current) return;
                            setRequests((current) =>
                                current.filter(
                                    (item) => item.id !== payload.old.id,
                                ),
                            );
                        },
                    )
                    .on(
                        "postgres_changes",
                        {
                            event: "INSERT",
                            schema: "public",
                            table: "requests",
                        },
                        (payload) => {
                            if (!isMountedRef.current) return;
                            setRequests((current) =>
                                upsertRequest(current, payload.new),
                            );
                        },
                    )
                    .on(
                        "postgres_changes",
                        {
                            event: "UPDATE",
                            schema: "public",
                            table: "requests",
                        },
                        (payload) => {
                            if (!isMountedRef.current) return;
                            setRequests((current) =>
                                upsertRequest(current, payload.new),
                            );
                        },
                    );

                const { error } = await channelRef.current.subscribe();

                if (error) {
                    console.error(
                        "[useCustomerRequests] Subscribe error:",
                        error,
                    );
                    return;
                }

                console.log(
                    "[useCustomerRequests] Subscribed to:",
                    channelName,
                );
            } catch (error) {
                console.error(
                    "[useCustomerRequests] Channel setup error:",
                    error,
                );
            }
        };

        setupChannel();

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [user?.id]);

    return {
        loading,
        requests,
        refresh: fetchCustomerRequests,
    };
}
