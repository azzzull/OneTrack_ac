import { useCallback, useEffect, useMemo, useState } from "react";
import supabase from "../supabaseClient";
import {
    DEFAULT_JOB_SCOPE_ROWS,
    buildJobScopeLabels,
    buildJobScopeOptions,
    normalizeJobScopeCode,
} from "../utils/jobScopeCatalog";

const normalizeRows = (rows) =>
    (rows ?? [])
        .map((row) => {
            const code = normalizeJobScopeCode(row?.code);
            if (!code) return null;
            return {
                ...row,
                code,
                label: String(row?.label ?? "").trim() || code,
            };
        })
        .filter(Boolean);

export default function useJobScopeOptions() {
    const [rows, setRows] = useState(DEFAULT_JOB_SCOPE_ROWS);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const loadJobScopes = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: fetchError } = await supabase
                .from("master_job_scopes")
                .select("*")
                .order("label", { ascending: true });

            if (fetchError) throw fetchError;
            const nextRows = normalizeRows(data);
            setRows(nextRows.length ? nextRows : DEFAULT_JOB_SCOPE_ROWS);
        } catch (err) {
            console.warn("Falling back to default job scopes:", err);
            setRows(DEFAULT_JOB_SCOPE_ROWS);
            setError(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadJobScopes();
    }, [loadJobScopes]);

    const options = useMemo(() => buildJobScopeOptions(rows), [rows]);
    const labels = useMemo(() => buildJobScopeLabels(rows), [rows]);

    return {
        rows,
        options,
        labels,
        loading,
        error,
        reload: loadJobScopes,
    };
}
