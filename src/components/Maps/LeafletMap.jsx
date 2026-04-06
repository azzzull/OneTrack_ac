import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Generic Leaflet Map component
 * Displays markers on OpenStreetMap with customizable info popups
 *
 * @param {Array} markers - Array of marker objects: { lat, lng, label, info }
 * @param {Object} options - Map configuration: { center, zoom, height }
 */
const LeafletMap = ({
    markers = [],
    center = { lat: -6.2088, lng: 106.8456 }, // Jakarta default
    zoom = 13,
    height = "400px",
    className = "",
}) => {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef([]);

    // Normalize center to { lat, lng } format
    const normalizeCenter = (c) => {
        if (!c) return { lat: -6.2088, lng: 106.8456 };
        if (Array.isArray(c)) {
            return { lat: c[0], lng: c[1] };
        }
        return { lat: c.lat || -6.2088, lng: c.lng || 106.8456 };
    };

    const normalizedCenter = normalizeCenter(center);

    useEffect(() => {
        if (!mapRef.current) return;

        // Safety check for valid coordinates
        if (!normalizedCenter.lat || !normalizedCenter.lng) return;

        // Initialize map
        if (!mapInstanceRef.current) {
            try {
                mapInstanceRef.current = L.map(mapRef.current).setView(
                    [normalizedCenter.lat, normalizedCenter.lng],
                    zoom,
                );

                // Add OpenStreetMap tiles
                L.tileLayer(
                    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                    {
                        attribution:
                            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                        maxZoom: 19,
                    },
                ).addTo(mapInstanceRef.current);
            } catch (error) {
                console.error("Error initializing map:", error);
                return;
            }
        }

        // Clear existing markers
        markersRef.current.forEach((marker) => marker.remove());
        markersRef.current = [];

        // Add new markers
        if (markers && markers.length > 0) {
            const markerBounds = [];

            markers.forEach((markerData, index) => {
                const { lat, lng, label, info, icon } = markerData;

                // Create custom icon with different colors
                const markerIcon = icon || createMarkerIcon(index);

                const marker = L.marker([lat, lng], { icon: markerIcon })
                    .bindPopup(createPopupContent(label, info))
                    .addTo(mapInstanceRef.current);

                markersRef.current.push(marker);
                markerBounds.push([lat, lng]);
            });

            // Fit bounds if multiple markers
            if (markerBounds.length > 1) {
                mapInstanceRef.current.fitBounds(L.latLngBounds(markerBounds), {
                    padding: [50, 50],
                });
            } else if (markerBounds.length === 1) {
                mapInstanceRef.current.setView(
                    [markerBounds[0][0], markerBounds[0][1]],
                    15,
                );
            }
        }
    }, [markers, normalizedCenter.lat, normalizedCenter.lng, zoom]);

    return (
        <div
            ref={mapRef}
            className={`rounded-lg border border-gray-300 ${className}`}
            style={{ height }}
        />
    );
};

/**
 * Create marker icon with different colors
 */
function createMarkerIcon(index) {
    const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"]; // blue, green, amber, red
    const color = colors[index % colors.length];

    return L.icon({
        iconUrl: `data:image/svg+xml;base64,${btoa(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 41">
        <path d="M16 0C7.2 0 0 6.9 0 15.5 0 28 16 41 16 41s16-13 16-25.5C32 6.9 24.8 0 16 0z" fill="${color}"/>
        <circle cx="16" cy="15" r="6" fill="white"/>
      </svg>
    `)}`,
        iconSize: [32, 41],
        iconAnchor: [16, 41],
        popupAnchor: [0, -41],
    });
}

/**
 * Create popup content HTML
 */
function createPopupContent(label, info) {
    let html = "";

    if (label) {
        html += `<div class="font-semibold text-gray-900 mb-1">${label}</div>`;
    }

    if (typeof info === "object") {
        Object.entries(info).forEach(([key, value]) => {
            if (value) {
                const label = key
                    .replace(/([A-Z])/g, " $1")
                    .replace(/^./, (str) => str.toUpperCase())
                    .trim();
                html += `<div class="text-sm text-gray-700"><span class="font-medium">${label}:</span> ${value}</div>`;
            }
        });
    } else if (info) {
        html += `<div class="text-sm text-gray-700">${info}</div>`;
    }

    return html;
}

export default LeafletMap;
