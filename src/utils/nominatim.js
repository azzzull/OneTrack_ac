/**
 * Nominatim (OpenStreetMap) reverse geocoding utility
 * Converts latitude/longitude to address details (street, district, sub_district, postal_code)
 */

const NOMINATIM_API_URL = "https://nominatim.openstreetmap.org/reverse";

/**
 * Reverse geocode coordinates to address details
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<Object>} Address details: { street, district, subDistrict, postalCode }
 */
export const reverseGeocode = async (latitude, longitude) => {
    try {
        // Rate limiting: 1 request per second for free tier
        // Add a small delay to respect Nominatim's terms
        await new Promise((resolve) => setTimeout(resolve, 100));

        const response = await fetch(
            `${NOMINATIM_API_URL}?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
            {
                headers: {
                    Accept: "application/json",
                    "User-Agent": "OneTrackAC/1.0 (Attendance GPS Tracker)",
                },
            },
        );

        if (!response.ok) {
            throw new Error(`Nominatim API error: ${response.status}`);
        }

        const data = await response.json();
        const address = data.address || {};

        return {
            street: getStreetName(address),
            district:
                address.county ||
                address.district ||
                address.state_district ||
                "",
            subDistrict:
                address.suburb ||
                address.neighbourhood ||
                address.village ||
                "",
            postalCode: address.postcode || "",
            country: address.country || "",
            city: address.city || address.town || "",
        };
    } catch (error) {
        console.error("Reverse geocoding error:", error);
        // Return empty object on error - fields will be saved as NULL in DB
        return {
            street: "",
            district: "",
            subDistrict: "",
            postalCode: "",
            country: "",
            city: "",
        };
    }
};

/**
 * Helper to extract street name from address object
 */
function getStreetName(address) {
    // Try common variants
    if (address.road) return address.road;
    if (address.street) return address.street;
    if (address.pedestrian) return address.pedestrian;
    if (address.cycleway) return address.cycleway;
    if (address.footway) return address.footway;

    // Fallback: combine what we have
    const parts = [];
    if (address.house_number) parts.push(address.house_number);
    if (address.road) parts.push(address.road);

    return parts.join(" ") || "";
}

/**
 * Format address details for display
 * @param {Object} addressDetails - Result from reverseGeocode()
 * @returns {string} Formatted address string
 */
export const formatAddress = (addressDetails) => {
    const parts = [];

    if (addressDetails.street) parts.push(addressDetails.street);
    if (addressDetails.subDistrict) parts.push(addressDetails.subDistrict);
    if (addressDetails.district) parts.push(addressDetails.district);
    if (addressDetails.postalCode) parts.push(addressDetails.postalCode);

    return parts.filter(Boolean).join(", ");
};

/**
 * Format short address for display (street only)
 */
export const formatAddressShort = (addressDetails) => {
    const parts = [];

    if (addressDetails.street) parts.push(addressDetails.street);
    if (addressDetails.district) parts.push(addressDetails.district);

    return parts.filter(Boolean).join(", ") || "Lokasi tidak tersedia";
};
