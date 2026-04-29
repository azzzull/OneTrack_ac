import { useCallback, useEffect, useRef, useState } from "react";
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

    const fetchCustomerRequests = useCallback(async () => {
        if (!user?.id) {
            customerIdsRef.current = [];
            setRequests([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const email = String(user.email ?? "").trim();
            const [customersByUserRes, customersByEmailRes] = await Promise.all(
                [
                    supabase
                        .from("master_customers")
                        .select("id")
                        .eq("user_id", user.id),
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
                setRequests([]);
                return;
            }

            const { data: requestData, error: requestError } = await supabase
                .from("requests")
                .select("*")
                .in("customer_id", uniqueCustomerIds)
                .order("created_at", { ascending: false });

            if (requestError) throw requestError;
            setRequests(requestData ?? []);
        } catch (error) {
            console.error("Error loading customer requests:", error);
            setRequests([]);
        } finally {
            setLoading(false);
        }
    }, [user?.email, user?.id]);

    useEffect(() => {
        fetchCustomerRequests();
    }, [fetchCustomerRequests]);

    useEffect(() => {
        if (!user?.id) return undefined;

        const isRelevantCustomerRequest = (row) =>
            customerIdsRef.current.includes(row?.customer_id);

        const channel = supabase
            .channel(`customer-requests-${user.id}`)
            .on(
                "postgres_changes",
                { event: "DELETE", schema: "public", table: "requests" },
                (payload) => {
                    if (!isRelevantCustomerRequest(payload.old)) return;
                    setRequests((current) =>
                        current.filter((item) => item.id !== payload.old.id),
                    );
                },
            )
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "requests" },
                (payload) => {
                    if (!isRelevantCustomerRequest(payload.new)) return;
                    setRequests((current) => upsertRequest(current, payload.new));
                },
            )
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "requests" },
                (payload) => {
                    const isRelevant = isRelevantCustomerRequest(payload.new);
                    if (!isRelevant) {
                        setRequests((current) =>
                            current.filter((item) => item.id !== payload.new.id),
                        );
                        return;
                    }
                    setRequests((current) => upsertRequest(current, payload.new));
                },
            )
            .subscribe();

        return () => {
            channel.unsubscribe();
        };
    }, [fetchCustomerRequests, user?.id]);

    useEffect(() => {
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
    }, [fetchCustomerRequests]);

    return {
        loading,
        requests,
        refresh: fetchCustomerRequests,
    };
}
