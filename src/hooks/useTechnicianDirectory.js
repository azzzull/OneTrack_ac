import { useCallback, useEffect, useState } from "react";
import { getTechnicianProfiles } from "../services/jobTechniciansService";

export default function useTechnicianDirectory() {
    const [technicians, setTechnicians] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const rows = await getTechnicianProfiles();
            setTechnicians(rows);
        } catch (err) {
            console.error("Failed to load technician directory:", err);
            setTechnicians([]);
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
