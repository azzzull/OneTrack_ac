const CACHE_PREFIX = "onetrack.local-cache";

const getCacheKey = (key) => `${CACHE_PREFIX}.${key}`;

export const readLocalCache = (key, fallback = null) => {
    if (typeof window === "undefined") return fallback;

    try {
        const raw = window.localStorage.getItem(getCacheKey(key));
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return parsed?.data ?? fallback;
    } catch (error) {
        console.warn(`[LocalCache] Failed to read ${key}:`, error);
        return fallback;
    }
};

export const writeLocalCache = (key, data) => {
    if (typeof window === "undefined") return;

    try {
        window.localStorage.setItem(
            getCacheKey(key),
            JSON.stringify({
                data,
                cached_at: new Date().toISOString(),
            }),
        );
    } catch (error) {
        console.warn(`[LocalCache] Failed to write ${key}:`, error);
    }
};
