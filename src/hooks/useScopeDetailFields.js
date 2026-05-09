import { useCallback, useEffect, useState } from "react";
import {
    getScopeDetailConfig,
    invalidateScopeDetailConfigCache,
} from "../services/scopeDetailFieldsService";

export default function useScopeDetailFields(scopeCode) {
    const [scope, setScope] = useState(null);
    const [fields, setFields] = useState([]);
    const [checklist, setChecklist] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const loadFields = useCallback(async () => {
        const normalizedScope = String(scopeCode ?? "").trim();
        if (!normalizedScope) {
            setScope(null);
            setFields([]);
            setChecklist([]);
            setError(null);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const result = await getScopeDetailConfig(normalizedScope);
            setScope(result.scope);
            setFields(result.fields ?? []);
            setChecklist(result.checklist ?? []);
        } catch (err) {
            console.error("Failed to load scope detail fields:", err);
            setScope(null);
            setFields([]);
            setChecklist([]);
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [scopeCode]);

    useEffect(() => {
        loadFields();
    }, [loadFields]);

    const reload = useCallback(async () => {
        invalidateScopeDetailConfigCache(scopeCode);
        await loadFields();
    }, [loadFields, scopeCode]);

    return {
        scope,
        fields,
        checklist,
        loading,
        error,
        reload,
    };
}
