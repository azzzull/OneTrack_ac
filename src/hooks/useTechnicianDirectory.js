import { useCallback, useEffect, useState } from "react";
import { getTechnicianProfiles } from "../services/jobTechniciansService";
import { readLocalCache, writeLocalCache } from "../utils/localDataCache";

const TECHNICIAN_DIRECTORY_CACHE_KEY = "technician-directory";

export default function useTechnicianDirectory() {
    const [technicians, setTechnicians] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            if (!navigator.onLine) {
                setTechnicians(
                    readLocalCache(TECHNICIAN_DIRECTORY_CACHE_KEY, []),
                );
                return;
            }

            const rows = await getTechnicianProfiles();
            setTechnicians(rows);
            writeLocalCache(TECHNICIAN_DIRECTORY_CACHE_KEY, rows);
        } catch (err) {
            console.error("Failed to load technician directory:", err);
            setTechnicians(readLocalCache(TECHNICIAN_DIRECTORY_CACHE_KEY, []));
            setError(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        reload();
    }, [reload]);

    return {
        technicians,
        loading,
        error,
        reload,
    };
}
