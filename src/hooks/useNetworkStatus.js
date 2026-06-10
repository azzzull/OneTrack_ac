import { useEffect, useRef, useState } from "react";

const getOnlineState = () => {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine;
};

export default function useNetworkStatus({ onOnlineRestored } = {}) {
    const [isOnline, setIsOnline] = useState(getOnlineState);
    const wasOfflineRef = useRef(!getOnlineState());

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            if (wasOfflineRef.current) {
                onOnlineRestored?.();
            }
            wasOfflineRef.current = false;
        };

        const handleOffline = () => {
            setIsOnline(false);
            wasOfflineRef.current = true;
        };

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);

        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, [onOnlineRestored]);

    return {
        isOnline,
        isOffline: !isOnline,
    };
}
