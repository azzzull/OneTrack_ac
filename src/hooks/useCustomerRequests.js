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

const normalizeTechnicianName = (value) => {
    const name = String(value ?? "").trim();
    return name && name !== "-" ? name : "";
};

const enrichRequestsWithTechnicians = async (rows) => {
    const requests = rows ?? [];
    const requestIds = requests.map((row) => row.id).filter(Boolean);
    if (requestIds.length === 0) return requests;

    const { data, error } = await supabase.rpc(
        "get_request_technician_summaries",
        { p_request_ids: requestIds },
    );

    if (error) {
        console.warn(
            "[useCustomerRequests] Technician summaries skipped:",
            error.message,
        );
        return requests;
    }

    const technicianMap = (data ?? []).reduce((acc, row) => {
        if (!row.job_id) return acc;
        if (!acc[row.job_id]) acc[row.job_id] = [];
        acc[row.job_id].push(row);
        return acc;
    }, {});

    return requests.map((request) => {
        const technicians = technicianMap[request.id] ?? [];
        const creator =
            technicians.find((item) => item.role === "creator") ??
            technicians[0] ??
            null;
        const technicianName =
            normalizeTechnicianName(creator?.technician_name) ||
            normalizeTechnicianName(request.technician_name) ||
            "-";

        return {
            ...request,
            technician_id:
                request.technician_id ?? creator?.technician_id ?? null,
            technician_name: technicianName,
            technician_names:
                technicians
                    .map((item) => normalizeTechnicianName(item.technician_name))
                    .filter(Boolean)
                    .join(", ") || technicianName,
        };
    });
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
            const enrichedRequests =
                await enrichRequestsWithTechnicians(requestData);
            if (isMountedRef.current) {
                setRequests(enrichedRequests);
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

    // ✅ Setup realtime subscription with proper lifecycle management
    useEffect(() => {
        if (!userRef.current?.id) return;

        const setupChannel = async () => {
            try {
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
                        async (payload) => {
                            if (!isMountedRef.current) return;
                            const [row] = await enrichRequestsWithTechnicians([
                                payload.new,
                            ]);
                            if (!isMountedRef.current) return;
                            setRequests((current) =>
                                upsertRequest(current, row ?? payload.new),
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
                        async (payload) => {
                            if (!isMountedRef.current) return;
                            const [row] = await enrichRequestsWithTechnicians([
                                payload.new,
                            ]);
                            if (!isMountedRef.current) return;
                            setRequests((current) =>
                                upsertRequest(current, row ?? payload.new),
                            );
                        },
                    )
                    .on(
                        "postgres_changes",
                        {
                            event: "*",
                            schema: "public",
                            table: "job_technicians",
                        },
                        () => {
                            if (!isMountedRef.current) return;
                            fetchCustomerRequests();
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
