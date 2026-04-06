/**
 * Universal date formatter utility
 * Formats all dates across the application in dd-mm-yyyy format
 */

/**
 * Format date to dd-mm-yyyy
 * Handles ISO datetime strings, YYYY-MM-DD strings, and Date objects
 * @param {string|Date} dateValue - Date value to format
 * @returns {string} Formatted date as dd-mm-yyyy or "-" if invalid
 */
export const formatDateUniversal = (dateValue) => {
    if (!dateValue) return "-";

    // Handle Date objects
    if (dateValue instanceof Date) {
        if (isNaN(dateValue.getTime())) return "-";
        const day = String(dateValue.getDate()).padStart(2, "0");
        const month = String(dateValue.getMonth() + 1).padStart(2, "0");
        const year = dateValue.getFullYear();
        return `${day}-${month}-${year}`;
    }

    // Handle string dates
    if (typeof dateValue === "string") {
        // Extract YYYY-MM-DD from ISO datetime (e.g., "2026-04-03T09:19:31.584+00:00" -> "2026-04-03")
        const isoMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) {
            const [, year, month, day] = isoMatch;
            return `${day}-${month}-${year}`;
        }
    }

    // Handle other date formats with Date constructor
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return "-";

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
};

/**
 * Format datetime to dd-mm-yyyy HH:mm:ss
 * @param {string|Date} dateValue - DateTime value to format
 * @returns {string} Formatted datetime or "-" if invalid
 */
export const formatDateTimeUniversal = (dateValue) => {
    if (!dateValue) return "-";

    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if (isNaN(date.getTime())) return "-";

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");

    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
};

export default formatDateUniversal;
