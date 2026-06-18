export const getStoragePathFromPublicUrl = (url, bucket) => {
    if (!url || !bucket) return null;

    const raw = String(url).trim();
    if (!raw) return null;

    if (!raw.includes("://")) {
        return raw.replace(/^\/+/, "");
    }

    try {
        const parsed = new URL(raw);
        const decodedPath = decodeURIComponent(parsed.pathname);
        const marker = `/storage/v1/object/public/${bucket}/`;
        const markerIndex = decodedPath.indexOf(marker);

        if (markerIndex === -1) return null;
        return decodedPath.slice(markerIndex + marker.length).replace(/^\/+/, "");
    } catch {
        return null;
    }
};

export const uniqueStoragePaths = (paths) => [
    ...new Set((paths ?? []).filter(Boolean)),
];
