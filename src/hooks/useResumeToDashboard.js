import { useCallback, useEffect } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { useNavigate } from "react-router-dom";

const BACKGROUND_AT_KEY = "onetrack:background-at";
const RESET_AFTER_MS = 2 * 60 * 1000;

const getDashboardPath = (role) => {
    if (role === "customer") return "/customer";
    if (role === "technician") return "/technician";
    if (["admin", "management"].includes(role)) return "/admin";
    return null;
};

const readBackgroundAt = () => {
    try {
        return Number(localStorage.getItem(BACKGROUND_AT_KEY) ?? 0);
    } catch {
        return 0;
    }
};

const writeBackgroundAt = () => {
    try {
        if (!localStorage.getItem(BACKGROUND_AT_KEY)) {
            localStorage.setItem(BACKGROUND_AT_KEY, String(Date.now()));
        }
    } catch {
        // Lifecycle reset tetap aman jika storage tidak tersedia.
    }
};

const clearBackgroundAt = () => {
    try {
        localStorage.removeItem(BACKGROUND_AT_KEY);
    } catch {
        // Abaikan storage yang tidak tersedia.
    }
};

export default function useResumeToDashboard({ userId, role, loading }) {
    const navigate = useNavigate();

    const handleActive = useCallback(() => {
        if (loading || !userId || !role) return;

        const backgroundAt = readBackgroundAt();
        if (!backgroundAt) return;

        clearBackgroundAt();
        if (Date.now() - backgroundAt < RESET_AFTER_MS) return;

        const dashboardPath = getDashboardPath(role);
        if (dashboardPath) navigate(dashboardPath, { replace: true });
    }, [loading, navigate, role, userId]);

    useEffect(() => {
        let disposed = false;
        let appStateListener = null;

        CapacitorApp.addListener("appStateChange", ({ isActive }) => {
            if (isActive) handleActive();
            else writeBackgroundAt();
        }).then((listener) => {
            if (disposed) listener.remove();
            else appStateListener = listener;
        });

        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") writeBackgroundAt();
            else if (document.visibilityState === "visible") handleActive();
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);

        if (document.visibilityState === "visible") handleActive();

        return () => {
            disposed = true;
            appStateListener?.remove();
            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange,
            );
        };
    }, [handleActive]);
}
