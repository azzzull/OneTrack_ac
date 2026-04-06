/**
 * Geolocation utility - wrapper around browser Geolocation API
 */

export const getCurrentLocation = () => {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("Geolocation is not supported by this browser"));
            return;
        }

        const options = {
            enableHighAccuracy: true,
            timeout: 10000, // 10 seconds
            maximumAge: 0, // Don't use cached position
        };

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;
                resolve({
                    latitude,
                    longitude,
                    accuracy,
                    timestamp: new Date(position.timestamp),
                });
            },
            (error) => {
                let errorMessage = "";
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage =
                            "Izin akses lokasi ditolak. Silakan aktifkan izin lokasi di browser.";
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMessage =
                            "Informasi lokasi tidak tersedia. Pastikan GPS/lokasi device aktif.";
                        break;
                    case error.TIMEOUT:
                        errorMessage =
                            "Waktu tunggu mendapatkan lokasi habis. Coba lagi.";
                        break;
                    default:
                        errorMessage =
                            "Terjadi kesalahan saat mendapatkan lokasi.";
                }
                reject(new Error(errorMessage));
            },
            options,
        );
    });
};

/**
 * Retry logic for geolocation with exponential backoff
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 * @param {number} initialDelay - Initial delay in ms (default: 1000)
 */
export const getCurrentLocationWithRetry = async (
    maxRetries = 3,
    initialDelay = 1000,
) => {
    let lastError;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await getCurrentLocation();
        } catch (error) {
            lastError = error;

            // Don't retry on permission denied
            if (error.message.includes("ditolak")) {
                throw error;
            }

            if (attempt < maxRetries) {
                console.log(
                    `Geolocation attempt ${attempt} failed, retrying in ${delay}ms...`,
                );
                await new Promise((resolve) => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            }
        }
    }

    throw lastError;
};
