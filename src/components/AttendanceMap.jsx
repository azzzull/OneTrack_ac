import React, { useState, useEffect } from "react";
import { useAttendance } from "../hooks/useAttendance";
import LeafletMap from "./Maps/LeafletMap";

/**
 * Display today's attendance locations on map
 * Shows check-in and (if available) check-out locations
 */
const AttendanceMap = ({ technicianId }) => {
    const { getTodayAttendance } = useAttendance();
    const [attendanceData, setAttendanceData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [markers, setMarkers] = useState([]);

    useEffect(() => {
        loadTodayData();
    }, [technicianId]);

    const loadTodayData = async () => {
        setLoading(true);
        const result = await getTodayAttendance(technicianId);

        if (result.data) {
            setAttendanceData(result.data);
            buildMarkers(result.data);
        }

        setLoading(false);
    };

    /**
     * Build markers array from attendance data
     */
    const buildMarkers = (data) => {
        const markerList = [];

        // Check-in marker
        if (data.check_in_latitude && data.check_in_longitude) {
            markerList.push({
                lat: parseFloat(data.check_in_latitude),
                lng: parseFloat(data.check_in_longitude),
                label: "Lokasi Masuk",
                info: {
                    waktu: new Date(data.check_in_time).toLocaleTimeString(
                        "id-ID",
                        {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                        },
                    ),
                    alamat: data.check_in_street_address || "-",
                    kecamatan: data.check_in_district || "-",
                    akurasi:
                        data.check_in_accuracy_meters &&
                        data.check_in_accuracy_meters > 0
                            ? `±${Math.round(data.check_in_accuracy_meters)}m`
                            : "N/A",
                },
            });
        }

        // Check-out marker (if available)
        if (data.check_out_latitude && data.check_out_longitude) {
            markerList.push({
                lat: parseFloat(data.check_out_latitude),
                lng: parseFloat(data.check_out_longitude),
                label: "Lokasi Pulang",
                info: {
                    waktu: new Date(data.check_out_time).toLocaleTimeString(
                        "id-ID",
                        {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                        },
                    ),
                    alamat: data.check_out_street_address || "-",
                    kecamatan: data.check_out_district || "-",
                    akurasi:
                        data.check_out_accuracy_meters &&
                        data.check_out_accuracy_meters > 0
                            ? `±${Math.round(data.check_out_accuracy_meters)}m`
                            : "N/A",
                },
            });
        }

        setMarkers(markerList);
    };

    // Don't show map if no check-in yet
    if (!attendanceData) {
        return null;
    }

    // Don't show map if no location data
    if (markers.length === 0) {
        return null;
    }

    if (loading) {
        return (
            <div className="h-96 bg-gray-100 rounded-lg flex items-center justify-center mb-6">
                <p className="text-gray-500">Memuat peta...</p>
            </div>
        );
    }

    // Determine center and initial zoom
    let center = { lat: -6.2088, lng: 106.8456 }; // Jakarta default
    let zoom = 13;

    if (markers.length > 0) {
        center = {
            lat: parseFloat(markers[0].lat),
            lng: parseFloat(markers[0].lng),
        };
        zoom = markers.length > 1 ? 13 : 15;
    }

    return (
        <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Lokasi Hari Ini
            </h3>
            <LeafletMap
                markers={markers}
                center={center}
                zoom={zoom}
                height="350px"
                className="shadow-md border border-gray-200"
            />
            <p className="text-xs text-gray-500 mt-2">
                {markers.length} lokasi tercatat (
                {markers.map((m) => m.label).join(", ")})
            </p>
        </div>
    );
};

export default AttendanceMap;
