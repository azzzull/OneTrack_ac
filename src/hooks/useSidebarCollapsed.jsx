import { useEffect, useState } from "react";

const STORAGE_KEY = "onetrack:sidebar-collapsed";

export default function useSidebarCollapsed(defaultValue = false) {
    const [collapsed, setCollapsed] = useState(() => {
        if (typeof window === "undefined") return defaultValue;
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved === null) return defaultValue;
        return saved === "1";
    });

    useEffect(() => {
        window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    }, [collapsed]);

    const toggle = () => {
        setCollapsed((prev) => !prev);
    };

    return { collapsed, setCollapsed, toggle };
}
