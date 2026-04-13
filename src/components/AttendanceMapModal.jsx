import React from "react";
import { X, MapPin, Clock, Gauge } from "lucide-react";
import LeafletMap from "./Maps/LeafletMap";

/**
 * Modal to display attendance location on map
 * Shows a single check-in or check-out location with all details
 */
const AttendanceMapModal = ({
    isOpen,
    onClose,
    data,
    type = "check-in", // 'check-in' or 'check-out'
}) => {
    if (!isOpen || !data) return null;

    const {
        time,
        latitude,
        longitude,
        street_address,
        district,
        sub_district,
        postal_code,
        accuracy_meters,
        technician_name,
    } = data;

    // Safety check - ensure we have valid coordinates
    if (!latitude || !longitude) {
        return (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-9999 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-6">
                    <h2 className="text-xl font-bold text-slate-900 mb-4">
                        Error
                    </h2>
                    <p className="text-slate-600 mb-6">
                        Koordinat lokasi tidak tersedia untuk record ini.
                    </p>
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-sky-500 text-white rounded-xl hover:bg-sky-600 transition font-medium"
                    >
                        Tutup
                    </button>
                </div>
            </div>
        );
    }

    // Ensure coordinates are numbers
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    // Verify coordinates are valid
    if (isNaN(lat) || isNaN(lng)) {
        return (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-9999 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-6">
                    <h2 className="text-xl font-bold text-slate-900 mb-4">
                        Error
                    </h2>
                    <p className="text-slate-600 mb-6">
                        Koordinat lokasi tidak valid.
                    </p>
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-sky-500 text-white rounded-xl hover:bg-sky-600 transition font-medium"
                    >
                        Tutup
                    </button>
                </div>
            </div>
        );
    }

    const marker = {
        lat: lat,
        lng: lng,
        label: type === "check-in" ? "Lokasi Masuk" : "Lokasi Pulang",
    };

    const latFixed = lat.toFixed(6);
    const lngFixed = lng.toFixed(6);

    const timeStr = new Date(time).toLocaleString("id-ID", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-9999 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="sticky top-0 bg-linear-to-r from-sky-500 to-sky-600 text-white px-6 py-5 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold">
                            {type === "check-in"
                                ? "Detail Lokasi Masuk"
                                : "Detail Lokasi Pulang"}
                        </h2>
                        {technician_name && (
                            <p className="text-sm text-sky-100 mt-1">
                                {technician_name}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="text-white hover:bg-sky-700 rounded-full p-2 transition hover:scale-110"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="overflow-y-auto flex-1">
                    <div className="p-6 space-y-6">
                        {/* Map */}
                        <div>
                            <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wide">
                                Peta Lokasi
                            </h3>
                            <div className="rounded-2xl overflow-hidden border-2 border-slate-200 shadow-md">
                                <LeafletMap
                                    markers={[marker]}
                                    center={[marker.lat, marker.lng]}
                                    zoom={18}
                                    height="280px"
                                />
                            </div>
                        </div>

                        {/* Location Details */}
                        <div className="rounded-2xl bg-sky-50 border-2 border-sky-200 p-5 space-y-4">
                            <h3 className="text-sm font-semibold text-sky-900 uppercase tracking-wide">
                                Detail Lokasi
                            </h3>

                            {/* Time */}
                            <div className="flex items-start gap-3">
                                <Clock
                                    size={18}
                                    className="text-sky-600 mt-0.5 shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-sky-700 uppercase tracking-wider">
                                        Waktu{" "}
                                        {type === "check-in"
                                            ? "Masuk"
                                            : "Pulang"}
                                    </p>
                                    <p className="text-sm text-slate-900 font-medium mt-1">
                                        {timeStr}
                                    </p>
                                </div>
                            </div>

                            {/* GPS Accuracy */}
                            <div className="flex items-start gap-3">
                                <Gauge
                                    size={18}
                                    className="text-sky-600 mt-0.5 shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-sky-700 uppercase tracking-wider">
                                        Akurasi GPS
                                    </p>
                                    <p className="text-sm text-slate-900 font-medium mt-1">
                                        {accuracy_meters
                                            ? `±${Math.round(accuracy_meters)} meter`
                                            : "Tidak tersedia"}
                                    </p>
                                </div>
                            </div>

                            {/* Street Address */}
                            <div className="flex items-start gap-3">
                                <MapPin
                                    size={18}
                                    className="text-sky-600 mt-0.5 shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-sky-700 uppercase tracking-wider">
                                        Nama Jalan
                                    </p>
                                    <p className="text-sm text-slate-900 font-medium mt-1 wrap-break-word">
                                        {street_address || "-"}
                                    </p>
                                </div>
                            </div>

                            {/* Address Details Grid */}
                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <div className="bg-white rounded-xl p-3 border border-sky-200">
                                    <p className="text-xs font-medium text-sky-700 uppercase tracking-wider">
                                        Kecamatan
                                    </p>
                                    <p className="text-sm text-slate-900 font-medium mt-1">
                                        {district || "-"}
                                    </p>
                                </div>

                                <div className="bg-white rounded-xl p-3 border border-sky-200">
                                    <p className="text-xs font-medium text-sky-700 uppercase tracking-wider">
                                        Kelurahan
                                    </p>
                                    <p className="text-sm text-slate-900 font-medium mt-1">
                                        {sub_district || "-"}
                                    </p>
                                </div>

                                <div className="col-span-2 bg-white rounded-xl p-3 border border-sky-200">
                                    <p className="text-xs font-medium text-sky-700 uppercase tracking-wider">
                                        Kode Pos
                                    </p>
                                    <p className="text-sm text-slate-900 font-medium mt-1">
                                        {postal_code || "-"}
                                    </p>
                                </div>

                                <div className="col-span-2 bg-slate-100 rounded-xl p-3 border border-slate-300">
                                    <p className="text-xs font-medium text-slate-700 uppercase tracking-wider">
                                        Koordinat GPS
                                    </p>
                                    <p className="text-sm text-slate-900 font-mono mt-1">
                                        {latFixed}, {lngFixed}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-sky-500 text-white rounded-xl hover:bg-sky-600 transition font-medium"
                    >
                        Tutup
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AttendanceMapModal;
