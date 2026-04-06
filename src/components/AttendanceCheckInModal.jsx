import React, { useState } from "react";
import { X, MapPin, Loader, AlertCircle } from "lucide-react";
import LeafletMap from "./Maps/LeafletMap";
import { getCurrentLocationWithRetry } from "../utils/geoLocation";
import { reverseGeocode } from "../utils/nominatim";

const AttendanceCheckInModal = ({
    isOpen,
    onClose,
    onSubmit,
    type = "check-in",
    loading = false,
}) => {
    const [gpsLoading, setGpsLoading] = useState(false);
    const [locationData, setLocationData] = useState(null);
    const [error, setError] = useState(null);

    if (!isOpen) return null;

    const handleGetLocation = async () => {
        setGpsLoading(true);
        setError(null);

        try {
            const location = await getCurrentLocationWithRetry();

            if (!location) {
                setError("Gagal mendapatkan lokasi. Coba lagi.");
                setGpsLoading(false);
                return;
            }

            // Reverse geocode
            const address = await reverseGeocode(
                location.latitude,
                location.longitude,
            );

            setLocationData({
                latitude: location.latitude,
                longitude: location.longitude,
                accuracy_meters: Math.round(location.accuracy),
                street_address: address.street,
                district: address.district,
                sub_district: address.subDistrict,
                postal_code: address.postalCode,
            });
        } catch (err) {
            console.error("Location error:", err);
            setError(
                err.message ||
                    "Terjadi kesalahan saat mendapatkan lokasi. Pastikan GPS aktif.",
            );
        } finally {
            setGpsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-xl">
                {/* Header */}
                <div className="sticky top-0 border-b border-slate-200 bg-white px-6 py-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-slate-900">
                            {type === "check-in"
                                ? "Absen Masuk"
                                : "Absen Pulang"}
                        </h2>
                        <button
                            onClick={onClose}
                            className="text-slate-500 hover:text-slate-700"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="px-6 py-6">
                    {!locationData ? (
                        <div className="space-y-4">
                            <p className="text-sm text-slate-600">
                                Klik tombol di bawah untuk mengambil lokasi Anda
                                dengan GPS
                            </p>
                            {error && (
                                <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3">
                                    <AlertCircle
                                        size={16}
                                        className="mt-0.5 shrink-0 text-red-600"
                                    />
                                    <p className="text-xs text-red-700">
                                        {error}
                                    </p>
                                </div>
                            )}
                            <button
                                onClick={handleGetLocation}
                                disabled={gpsLoading}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-3 text-sm font-medium text-white transition hover:bg-sky-600 disabled:opacity-70"
                            >
                                {gpsLoading ? (
                                    <>
                                        <Loader
                                            size={16}
                                            className="animate-spin"
                                        />
                                        Mengambil Lokasi...
                                    </>
                                ) : (
                                    <>
                                        <MapPin size={16} />
                                        Ambil Lokasi GPS
                                    </>
                                )}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Map */}
                            <div className="rounded-xl overflow-hidden border border-slate-200">
                                <LeafletMap
                                    markers={[
                                        {
                                            lat: locationData.latitude,
                                            lng: locationData.longitude,
                                            label:
                                                type === "check-in"
                                                    ? "Lokasi Masuk"
                                                    : "Lokasi Pulang",
                                        },
                                    ]}
                                    center={[
                                        locationData.latitude,
                                        locationData.longitude,
                                    ]}
                                    zoom={18}
                                    height="250px"
                                />
                            </div>

                            {/* Location Details */}
                            <div className="space-y-2 rounded-lg bg-sky-50 p-3 border border-sky-200">
                                <p className="text-xs font-medium text-sky-700 uppercase tracking-wider">
                                    📍 Lokasi
                                </p>
                                <p className="text-sm font-medium text-slate-900">
                                    {locationData.street_address}
                                </p>
                                <p className="text-xs text-slate-600">
                                    {[
                                        locationData.sub_district,
                                        locationData.district,
                                        locationData.postal_code,
                                    ]
                                        .filter(Boolean)
                                        .join(", ")}
                                </p>
                                <p className="text-xs text-slate-500 mt-1">
                                    Akurasi: ±{locationData.accuracy_meters}m
                                </p>
                            </div>

                            {/* GPS Coordinates */}
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded bg-slate-100 p-2">
                                    <p className="text-slate-600 text-xs font-medium">
                                        Lintang
                                    </p>
                                    <p className="font-mono text-slate-700 text-xs mt-1">
                                        {locationData.latitude.toFixed(6)}
                                    </p>
                                </div>
                                <div className="rounded bg-slate-100 p-2">
                                    <p className="text-slate-600 text-xs font-medium">
                                        Bujur
                                    </p>
                                    <p className="font-mono text-slate-700 text-xs mt-1">
                                        {locationData.longitude.toFixed(6)}
                                    </p>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2 pt-2">
                                <button
                                    onClick={() => setLocationData(null)}
                                    className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                                    disabled={loading}
                                >
                                    Ambil Ulang
                                </button>
                                <button
                                    onClick={() => onSubmit(locationData)}
                                    disabled={loading}
                                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-green-500 py-2 text-sm font-medium text-white transition hover:bg-green-600 disabled:opacity-70"
                                >
                                    {loading ? (
                                        <>
                                            <Loader
                                                size={14}
                                                className="animate-spin"
                                            />
                                            Proses...
                                        </>
                                    ) : type === "check-in" ? (
                                        "Submit Masuk"
                                    ) : (
                                        "Submit Pulang"
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AttendanceCheckInModal;
