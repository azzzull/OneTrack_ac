import { useEffect, useState, useCallback } from "react";
import supabase from "../supabaseClient";
export { JOB_SCOPES, JOB_SCOPE_LABELS } from "../utils/jobScopeCatalog";
import {
    DEFAULT_JOB_SCOPE_ROWS,
    buildJobScopeLabels,
    normalizeJobScopeCode,
} from "../utils/jobScopeCatalog";

/**
 * Hook to manage job scope operations
 * Handles fetching and filtering requests by job scope
 */
export function useJobScope(customerId = null) {
    const [scopes, setScopes] = useState([]);
    const [scopeRows, setScopeRows] = useState(DEFAULT_JOB_SCOPE_ROWS);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Get all available job scopes
    const getAvailableScopes = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: err } = await supabase
                .from("master_job_scopes")
                .select("code, label")
                .order("label", { ascending: true });
            if (err) throw err;
            const nextRows = (data ?? [])
                .map((item) => ({
                    code: normalizeJobScopeCode(item?.code),
                    label: String(item?.label ?? "").trim(),
                }))
                .filter((item) => item.code);
            const nextScopes = nextRows
                .map((item) => normalizeJobScopeCode(item?.code))
                .filter(Boolean);
            setScopes(
                nextScopes.length
                    ? nextScopes
                    : DEFAULT_JOB_SCOPE_ROWS.map((item) => item.code),
            );
            setScopeRows(nextRows.length ? nextRows : DEFAULT_JOB_SCOPE_ROWS);
        } catch (err) {
            console.error("Error fetching job scopes:", err);
            setError(err.message);
            setScopes(DEFAULT_JOB_SCOPE_ROWS.map((item) => item.code));
            setScopeRows(DEFAULT_JOB_SCOPE_ROWS);
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch requests by job scope
    const getRequestsByScope = useCallback(
        async (jobScope) => {
            setLoading(true);
            setError(null);
            try {
                let query = supabase
                    .from("requests")
                    .select("*")
                    .eq("job_scope", jobScope)
                    .is("deleted_at", null); // Exclude soft-deleted records

                // Filter by customer_id if provided
                if (customerId) {
                    query = query.eq("customer_id", customerId);
                }

                const { data, error: err } = await query;
                if (err) throw err;
                return data || [];
            } catch (err) {
                console.error(`Error fetching ${jobScope} requests:`, err);
                setError(err.message);
                return [];
            } finally {
                setLoading(false);
            }
        },
        [customerId],
    );

    // Fetch all requests with job scope information
    const getAllRequests = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            let query = supabase
                .from("requests")
                .select("*")
                .is("deleted_at", null); // Exclude soft-deleted records

            // Filter by customer_id if provided
            if (customerId) {
                query = query.eq("customer_id", customerId);
            }

            const { data, error: err } = await query;
            if (err) throw err;
            return data || [];
        } catch (err) {
            console.error("Error fetching all requests:", err);
            setError(err.message);
            return [];
        } finally {
            setLoading(false);
        }
    }, [customerId]);

    // Initialize: fetch available scopes on mount
    useEffect(() => {
        getAvailableScopes();
    }, [getAvailableScopes]);

    return {
        scopes,
        loading,
        error,
        getAvailableScopes,
        getRequestsByScope,
        getAllRequests,
        scopeLabels: buildJobScopeLabels(scopeRows),
    };
}
