import { useCallback, useEffect, useState } from "react";
import supabase from "../supabaseClient";

export default function useCustomerRequests(user) {
    const [loading, setLoading] = useState(true);
    const [requests, setRequests] = useState([]);

    const fetchCustomerRequests = useCallback(async () => {
        if (!user?.id) {
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

        const channel = supabase
            .channel(`customer-requests-${user.id}`)
            .on(
                "postgres_changes",
                { event: "DELETE", schema: "public", table: "requests" },
                fetchCustomerRequests,
            )
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "requests" },
                fetchCustomerRequests,
            )
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "requests" },
                fetchCustomerRequests,
            )
            .subscribe();

        return () => {
            channel.unsubscribe();
        };
    }, [fetchCustomerRequests, user?.id]);

    return {
        loading,
        requests,
        refresh: fetchCustomerRequests,
    };
}
