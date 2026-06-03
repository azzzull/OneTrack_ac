import { useCallback, useEffect, useState } from "react";
import { getJobTechnicians } from "../services/jobTechniciansService";

export default function useJobTechnicians(jobId) {
    const [technicians, setTechnicians] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const reload = useCallback(async () => {
        if (!jobId) {
            setTechnicians([]);
            setError(null);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const rows = await getJobTechnicians(jobId);
            setTechnicians(rows);
        } catch (err) {
            console.error("Failed to load job technicians:", err);
            setTechnicians([]);
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [jobId]);

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
