import { useEffect, useRef, useState } from "react";
import supabase from "../supabaseClient";

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
    const customerIdsRef = useRef([]);
    const channelRef = useRef(null);
    const isMountedRef = useRef(true);
    const userRef = useRef(user);

    // ✅ Update user ref without triggering effects
    useEffect(() => {
        userRef.current = user;
    }, [user]);

    const fetchCustomerRequests = async () => {
        if (!userRef.current?.id) {
            customerIdsRef.current = [];
            if (isMountedRef.current) {
                setRequests([]);
                setLoading(false);
            }
            return;
        }

        if (isMountedRef.current) setLoading(true);

        try {
            const email = String(userRef.current.email ?? "").trim();
            const [customersByUserRes, customersByEmailRes] = await Promise.all(
                [
                    supabase
                        .from("master_customers")
                        .select("id")
                        .eq("user_id", userRef.current.id),
                    email
                        ? supabase
                              .from("master_customers")
                              .select("id")
                              .eq("email", email)
                        : Promise.resolve({ data: [], error: null }),
                ],
            );

            if (customersByUserRes.error) throw customersByUserRes.error;
            if (customersByEmailRes?.error) throw customersByEmailRes.error;

            const customerIds = [
                ...(customersByUserRes.data ?? []).map((item) => item.id),
                ...(customersByEmailRes?.data ?? []).map((item) => item.id),
            ];
            const uniqueCustomerIds = [...new Set(customerIds)];
            customerIdsRef.current = uniqueCustomerIds;

            if (uniqueCustomerIds.length === 0) {
                if (isMountedRef.current) setRequests([]);
                return;
            }

            const { data: requestData, error: requestError } = await supabase
                .from("requests")
                .select("*")
                .in("customer_id", uniqueCustomerIds)
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
    }, []);

    // ✅ Setup realtime subscription - only once per user.id
    useEffect(() => {
        if (!userRef.current?.id) return;

        const isRelevantCustomerRequest = (row) =>
            customerIdsRef.current.includes(row?.customer_id);

        if (!channelRef.current) {
            channelRef.current = supabase
                .channel(`customer-requests-${userRef.current.id}`)
                .on(
                    "postgres_changes",
                    { event: "DELETE", schema: "public", table: "requests" },
                    (payload) => {
                        if (!isRelevantCustomerRequest(payload.old)) return;
                        setRequests((current) =>
                            current.filter(
                                (item) => item.id !== payload.old.id,
                            ),
                        );
                    },
                )
                .on(
                    "postgres_changes",
                    { event: "INSERT", schema: "public", table: "requests" },
                    (payload) => {
                        if (!isRelevantCustomerRequest(payload.new)) return;
                        setRequests((current) =>
                            upsertRequest(current, payload.new),
                        );
                    },
                )
                .on(
                    "postgres_changes",
                    { event: "UPDATE", schema: "public", table: "requests" },
                    (payload) => {
                        const isRelevant = isRelevantCustomerRequest(
                            payload.new,
                        );
                        if (!isRelevant) {
                            setRequests((current) =>
                                current.filter(
                                    (item) => item.id !== payload.new.id,
                                ),
                            );
                            return;
                        }
                        setRequests((current) =>
                            upsertRequest(current, payload.new),
                        );
                    },
                )
                .subscribe();
        }

        return () => {
            if (channelRef.current) {
                channelRef.current.unsubscribe();
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
