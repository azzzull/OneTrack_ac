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
        const district = getDistrictName(address);
        const subDistrict = getSubDistrictName(address);

        return {
            street: getStreetName(address, { district, subDistrict }),
            district,
            subDistrict,
            postalCode: address.postcode || "",
            country: address.country || "",
            city: address.city || address.town || "",
        };
    } catch (error) {
        console.error("Reverse geocoding error:", error);
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

function getStreetName(address, context = {}) {
    const directStreet = firstNonEmpty([
        combineHouseNumber(address.house_number, address.road),
        address.road,
        address.street,
        address.pedestrian,
        address.residential,
        address.cycleway,
        address.footway,
        address.path,
        address.avenue,
        address.boulevard,
        address.lane,
        address.square,
        address.place,
        address.block,
    ]);

    if (directStreet) return directStreet;

    return firstNonEmpty([
        address.neighbourhood,
        address.suburb,
        address.hamlet,
        address.quarter,
        address.village,
        context.subDistrict,
        context.district,
    ]);
}

function getDistrictName(address) {
    return firstNonEmpty([
        address.city_district,
        address.district,
        address.borough,
        address.county,
        address.state_district,
        address.municipality,
        address.city,
        address.town,
        address.region,
    ]);
}

function getSubDistrictName(address) {
    return firstNonEmpty([
        address.suburb,
        address.neighbourhood,
        address.village,
        address.hamlet,
        address.quarter,
        address.residential,
        address.city_block,
    ]);
}

function combineHouseNumber(houseNumber, road) {
    return [houseNumber, road].filter(Boolean).join(" ").trim();
}

function firstNonEmpty(values) {
    const match = values.find(
        (value) => typeof value === "string" && value.trim().length > 0,
    );

    return match ? match.trim() : "";
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
 * Format short address for display (street first, then administrative fallback)
 */
export const formatAddressShort = (addressDetails) => {
    const parts = [];

    if (addressDetails.street) parts.push(addressDetails.street);
    if (!addressDetails.street && addressDetails.subDistrict) {
        parts.push(addressDetails.subDistrict);
    }
    if (addressDetails.district) parts.push(addressDetails.district);

    return parts.filter(Boolean).join(", ") || "Lokasi tidak tersedia";
};

export const hasLocationData = (location) => {
    if (!location) return false;

    return Boolean(
        location.latitude ||
            location.longitude ||
            location.street_address ||
            location.street ||
            location.sub_district ||
            location.subDistrict ||
            location.district ||
            location.postal_code ||
            location.postalCode,
    );
};

export const getLocationLabel = (location) => {
    if (!location) return "Lihat Peta";

    return (
        location.street_address ||
        location.street ||
        location.sub_district ||
        location.subDistrict ||
        location.district ||
        "Lihat Peta"
    );
};
