/**
 * Universal date formatter utility
 * Formats all dates across the application in dd-mm-yyyy format
 */

/**
 * Format date to dd-mm-yyyy
 * Handles both YYYY-MM-DD strings and Date objects
 * @param {string|Date} dateValue - Date value to format
 * @returns {string} Formatted date as dd-mm-yyyy or "-" if invalid
 */
export const formatDateUniversal = (dateValue) => {
    if (!dateValue) return "-";

    let dateStr;

    // Handle Date objects
    if (dateValue instanceof Date) {
        if (isNaN(dateValue.getTime())) return "-";
        const day = String(dateValue.getDate()).padStart(2, "0");
        const month = String(dateValue.getMonth() + 1).padStart(2, "0");
        const year = dateValue.getFullYear();
        return `${day}-${month}-${year}`;
    }

    // Handle string dates in YYYY-MM-DD format
    if (typeof dateValue === "string" && dateValue.match(/^\d{4}-\d{2}-\d{2}/)) {
        const [year, month, day] = dateValue.split("-");
        return `${day}-${month}-${year}`;
    }

    // Handle ISO strings and other date formats
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
