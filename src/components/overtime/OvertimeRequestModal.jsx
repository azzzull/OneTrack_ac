import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    AlertCircle,
    Camera as CameraIcon,
    Clock3,
    Loader,
    X,
} from "lucide-react";
import CustomSelect from "../ui/CustomSelect";
import LeafletMap from "../Maps/LeafletMap";
import { getCurrentLocationWithRetry } from "../../utils/geoLocation";
import { reverseGeocode } from "../../utils/nominatim";
import {
    calculateAttendanceOvertime,
    calculateManualDuration,
    formatOvertimeDuration,
    toDateInputValue,
    toDateTimeLocalValue,
} from "../../utils/overtime";
import { getAddressFromLocation } from "../../services/overtimeService";

const toLocalInput = (date, time) => `${date}T${time || "00:00"}`;

const formatPreviewDateTime = (value) =>
    value
        ? new Date(value).toLocaleString("id-ID", {
              day: "2-digit",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
          })
        : "-";

const getCheckoutLocationFromAttendance = (attendance) => {
    if (
        attendance?.check_out_latitude == null ||
        attendance?.check_out_longitude == null
    ) {
        return null;
    }

    return {
        latitude: attendance.check_out_latitude,
        longitude: attendance.check_out_longitude,
        accuracy_meters: attendance.check_out_accuracy_meters,
        street_address: attendance.check_out_street_address,
        district: attendance.check_out_district,
        sub_district: attendance.check_out_sub_district,
        postal_code: attendance.check_out_postal_code,
    };
};

export default function OvertimeRequestModal({
    isOpen,
    mode = "manual",
    attendance,
    currentUserId,
    role,
    technicians = [],
    onClose,
    onSubmit,
    loading = false,
}) {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const [technicianId, setTechnicianId] = useState(currentUserId || "");
    const [date, setDate] = useState(toDateInputValue());
    const [startTime, setStartTime] = useState("17:00");
    const [endTime, setEndTime] = useState("19:00");
    const [nextDay, setNextDay] = useState(false);
    const [locationData, setLocationData] = useState(null);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [cameraActive, setCameraActive] = useState(false);
    const [previewImage, setPreviewImage] = useState(null);
    const [photoFile, setPhotoFile] = useState(null);
    const [photoTakenAt, setPhotoTakenAt] = useState(null);
    const [notes, setNotes] = useState("");
    const [error, setError] = useState("");

    const isAttendanceMode = mode === "attendance";
    const canChooseTechnician = ["admin", "management"].includes(role);

    const stopCamera = useCallback(() => {
        const stream = streamRef.current || videoRef.current?.srcObject;
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current?.srcObject) {
            videoRef.current.srcObject = null;
        }
        setCameraActive(false);
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        setError("");
        stopCamera();
        setPhotoFile(null);
        setPhotoTakenAt(null);
        setPreviewImage(null);
        setNotes("");
        setLocationData(
            isAttendanceMode
                ? getCheckoutLocationFromAttendance(attendance)
                : null,
        );
        setTechnicianId(
            isAttendanceMode
                ? attendance?.technician_id || currentUserId || ""
                : currentUserId || "",
        );
        setDate(attendance?.attendance_date || toDateInputValue());
        if (attendance?.check_out_time) {
            setEndTime(toDateTimeLocalValue(attendance.check_out_time).slice(11));
        }
        if (attendance?.check_in_time) {
            setStartTime("17:00");
        }
        setNextDay(false);
    }, [attendance, currentUserId, isAttendanceMode, isOpen, stopCamera]);

    useEffect(() => () => stopCamera(), [stopCamera]);

    useEffect(() => {
        if (!cameraActive || !videoRef.current || !streamRef.current) return;

        videoRef.current.srcObject = streamRef.current;
        videoRef.current.play?.().catch(() => {});
    }, [cameraActive]);

    const attendanceOvertime = useMemo(() => {
        if (!attendance) return null;
        return calculateAttendanceOvertime({
            checkInTime: attendance.check_in_time,
            checkOutTime: attendance.check_out_time,
        });
    }, [attendance]);

    const manualStartAt = useMemo(
        () => new Date(toLocalInput(date, startTime)),
        [date, startTime],
    );
    const manualEndAt = useMemo(() => {
        const value = new Date(toLocalInput(date, endTime));
        if (nextDay) value.setDate(value.getDate() + 1);
        return value;
    }, [date, endTime, nextDay]);
    const manualDuration = useMemo(
        () => calculateManualDuration(manualStartAt, manualEndAt),
        [manualEndAt, manualStartAt],
    );

    const durationMinutes = isAttendanceMode
        ? attendanceOvertime?.durationMinutes || 0
        : manualDuration;
    const address = getAddressFromLocation(locationData);
    const previewTime = isAttendanceMode
        ? attendance?.check_out_time
        : photoTakenAt;
    const previewTimeLabel = formatPreviewDateTime(previewTime);

    const captureCurrentLocation = async () => {
        setGpsLoading(true);
        setError("");
        try {
            const location = await getCurrentLocationWithRetry();
            const addressResult = await reverseGeocode(
                location.latitude,
                location.longitude,
            );
            const nextLocationData = {
                latitude: location.latitude,
                longitude: location.longitude,
                accuracy_meters: Math.round(location.accuracy || 0),
                street_address: addressResult.street,
                district: addressResult.district,
                sub_district: addressResult.subDistrict,
                postal_code: addressResult.postalCode,
            };
            setLocationData(nextLocationData);
            return nextLocationData;
        } catch (err) {
            setError(
                err.message ||
                    "Gagal mengambil lokasi. Pastikan GPS aktif dan coba lagi.",
            );
            throw err;
        } finally {
            setGpsLoading(false);
        }
    };

    const drawWatermark = (ctx, width, height, takenAt) => {
        const lines = [
            `Waktu: ${formatPreviewDateTime(takenAt)}`,
            `Lokasi: ${address || "-"}`,
            `Durasi: ${formatOvertimeDuration(durationMinutes)}`,
            `Jenis: ${isAttendanceMode ? "Lembur dari Absensi" : "Lembur Manual"}`,
        ];
        const padding = Math.max(14, Math.round(width * 0.025));
        const fontSize = Math.max(16, Math.round(width * 0.028));
        const lineHeight = Math.round(fontSize * 1.35);
        const boxHeight = padding * 2 + lineHeight * lines.length;
        const y = height - boxHeight;

        ctx.fillStyle = "rgba(15, 23, 42, 0.74)";
        ctx.fillRect(0, Math.max(0, y), width, boxHeight);
        ctx.fillStyle = "#ffffff";
        ctx.font = `600 ${fontSize}px Arial, sans-serif`;
        ctx.textBaseline = "top";
        lines.forEach((line, index) => {
            ctx.fillText(line, padding, y + padding + index * lineHeight);
        });
    };

    const handleOpenCamera = async () => {
        setError("");
        try {
            if (!isAttendanceMode) {
                await captureCurrentLocation();
                setPhotoTakenAt(new Date().toISOString());
            } else if (!locationData) {
                setError("Lokasi checkout belum tersedia di data absensi.");
                return;
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" },
                audio: false,
            });
            streamRef.current = stream;
            setPhotoFile(null);
            setPreviewImage(null);
            setCameraActive(true);
        } catch (err) {
            setError(
                err.message ||
                    "Gagal membuka kamera. Pastikan izin kamera diberikan.",
            );
        }
    };

    const handleCapturePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const width = video.videoWidth || 1280;
        const height = video.videoHeight || 720;
        const takenAt = isAttendanceMode
            ? attendance?.check_out_time
            : photoTakenAt || new Date().toISOString();

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, width, height);
        drawWatermark(ctx, width, height, takenAt);

        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    setError("Gagal mengambil foto dari kamera.");
                    return;
                }
                const file = new File(
                    [blob],
                    `overtime-proof-${Date.now()}.jpg`,
                    { type: "image/jpeg" },
                );
                setPhotoFile(file);
                setPhotoTakenAt(takenAt);
                setPreviewImage(URL.createObjectURL(blob));
                stopCamera();
            },
            "image/jpeg",
            0.9,
        );
    };

    const handleSubmit = async () => {
        setError("");
        if (!technicianId) {
            setError("Teknisi wajib diisi.");
            return;
        }
        if (!locationData) {
            setError("Lokasi aktif wajib diambil.");
            return;
        }
        if (!photoFile) {
            setError("Foto bukti lembur wajib diisi.");
            return;
        }
        if (!isAttendanceMode && durationMinutes <= 0) {
            setError("Durasi lembur tidak valid.");
            return;
        }

        try {
            await onSubmit({
                technicianId,
                date,
                startAt: manualStartAt.toISOString(),
                endAt: manualEndAt.toISOString(),
                locationData,
                photoFile,
                photoTakenAt,
                photoAlreadyWatermarked: true,
                notes,
            });
        } catch (err) {
            setError(err.message || "Gagal mengajukan lembur.");
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-9999 flex items-center justify-center bg-slate-950/50 p-3">
            <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">
                            {isAttendanceMode ? "Ajukan Lembur" : "Add Overtime"}
                        </h2>
                        <p className="text-xs text-slate-500">
                            {isAttendanceMode
                                ? "Pengajuan dari data checkout absensi"
                                : "Pengajuan lembur manual"}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-60"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="space-y-5 px-5 py-5">
                    {error && (
                        <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            <AlertCircle size={16} className="mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {isAttendanceMode ? (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <InfoBox label="Jam Check In" value={toDateTimeLocalValue(attendance?.check_in_time).replace("T", " ")} />
                            <InfoBox label="Jam Check Out" value={toDateTimeLocalValue(attendance?.check_out_time).replace("T", " ")} />
                            <InfoBox
                                label="Durasi Lembur"
                                value={formatOvertimeDuration(durationMinutes)}
                            />
                        </div>
                    ) : (
                        <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                            {canChooseTechnician && (
                                <label className="block w-full min-w-0 sm:col-span-2">
                                    <span className="mb-2 block text-xs font-medium text-slate-600">
                                        Teknisi
                                    </span>
                                    <CustomSelect
                                        value={technicianId}
                                        onChange={setTechnicianId}
                                        options={technicians.map((tech) => ({
                                            value: tech.id,
                                            label:
                                                `${tech.first_name ?? ""} ${tech.last_name ?? ""}`.trim() ||
                                                tech.name ||
                                                tech.email ||
                                                tech.id,
                                        }))}
                                    />
                                </label>
                            )}
                            <label className="block w-full min-w-0">
                                <span className="mb-2 block text-xs font-medium text-slate-600">
                                    Tanggal
                                </span>
                                <input
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    className="h-10 w-full min-w-0 max-w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400"
                                />
                            </label>
                            <label className="block w-full min-w-0">
                                <span className="mb-2 block text-xs font-medium text-slate-600">
                                    Durasi
                                </span>
                                <div className="flex h-10 w-full min-w-0 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm text-slate-700">
                                    <Clock3 size={15} />
                                    {formatOvertimeDuration(durationMinutes)}
                                </div>
                            </label>
                            <label className="block w-full min-w-0">
                                <span className="mb-2 block text-xs font-medium text-slate-600">
                                    Jam Mulai
                                </span>
                                <input
                                    type="time"
                                    value={startTime}
                                    onChange={(e) => setStartTime(e.target.value)}
                                    className="h-10 w-full min-w-0 max-w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400"
                                />
                            </label>
                            <label className="block w-full min-w-0">
                                <span className="mb-2 block text-xs font-medium text-slate-600">
                                    Jam Selesai
                                </span>
                                <input
                                    type="time"
                                    value={endTime}
                                    onChange={(e) => setEndTime(e.target.value)}
                                    className="h-10 w-full min-w-0 max-w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400"
                                />
                            </label>
                            <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                                <input
                                    type="checkbox"
                                    checked={nextDay}
                                    onChange={(e) => setNextDay(e.target.checked)}
                                    className="h-4 w-4 rounded border-slate-300"
                                />
                                Selesai lewat tengah malam
                            </label>
                        </div>
                    )}

                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-slate-800">
                                    {isAttendanceMode
                                        ? "Lokasi Checkout"
                                        : "Lokasi Saat Ini"}
                                </p>
                                <p className="text-xs text-slate-500">
                                    {isAttendanceMode
                                        ? "Alamat checkout dipakai untuk watermark foto."
                                        : "Lokasi otomatis direkam saat tombol kamera dibuka."}
                                </p>
                            </div>
                        </div>
                        {locationData && (
                            <div className="space-y-3">
                                <div className="overflow-hidden rounded-xl border border-slate-200">
                                    <LeafletMap
                                        markers={[
                                            {
                                                lat: locationData.latitude,
                                                lng: locationData.longitude,
                                                label: "Lokasi Lembur",
                                            },
                                        ]}
                                        center={[
                                            locationData.latitude,
                                            locationData.longitude,
                                        ]}
                                        zoom={18}
                                        height="220px"
                                    />
                                </div>
                                <div className="grid grid-cols-1 gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-slate-700 sm:grid-cols-2">
                                    <div>
                                        <p className="text-xs font-semibold text-sky-700">
                                            Nama Lokasi
                                        </p>
                                        <p className="mt-1">{address || "-"}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-sky-700">
                                            Jam Watermark
                                        </p>
                                        <p className="mt-1">
                                            {formatPreviewDateTime(previewTime)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                        {!locationData && !isAttendanceMode && (
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                                Lokasi dan jam akan muncul otomatis setelah
                                kamera dibuka.
                            </div>
                        )}
                    </div>

                    <div className="block">
                        <span className="mb-2 block text-xs font-medium text-slate-600">
                            Foto Bukti Lembur
                        </span>
                        <div className="rounded-xl border border-slate-200 p-3">
                            <button
                                type="button"
                                onClick={handleOpenCamera}
                                disabled={loading || gpsLoading || cameraActive}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                            >
                                {gpsLoading ? (
                                    <Loader size={17} className="animate-spin" />
                                ) : (
                                    <CameraIcon size={17} />
                                )}
                                {gpsLoading
                                    ? "Mengambil Lokasi..."
                                    : cameraActive
                                      ? "Kamera Aktif"
                                      : photoFile
                                        ? "Ambil Ulang Foto"
                                        : "Buka Kamera"}
                            </button>
                            {cameraActive && (
                                <div className="mt-3 space-y-3">
                                    <div className="relative overflow-hidden rounded-xl bg-slate-950">
                                        <video
                                            ref={videoRef}
                                            autoPlay
                                            playsInline
                                            muted
                                            className="aspect-video w-full object-cover"
                                        />
                                        <div className="absolute inset-x-0 bottom-0 bg-slate-950/75 p-3 text-xs font-semibold text-white">
                                            <p>Jam: {previewTimeLabel}</p>
                                            <p className="mt-1 line-clamp-2">
                                                Lokasi: {address || "-"}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={stopCamera}
                                            className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                        >
                                            Batal Kamera
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleCapturePhoto}
                                            className="flex-1 rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-600"
                                        >
                                            Ambil Foto
                                        </button>
                                    </div>
                                </div>
                            )}
                            {previewImage && (
                                <div className="mt-3">
                                    <p className="mb-2 text-xs font-semibold text-slate-600">
                                        Preview Foto Watermark
                                    </p>
                                    <img
                                        src={previewImage}
                                        alt="Preview foto lembur dengan watermark"
                                        className="max-h-80 w-full rounded-xl bg-slate-100 object-contain"
                                    />
                                </div>
                            )}
                            {photoFile && (
                                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                                    <p className="font-semibold">
                                        Foto kamera sudah diambil.
                                    </p>
                                    <p className="mt-1">
                                        Jam foto:{" "}
                                        {formatPreviewDateTime(photoTakenAt)}
                                    </p>
                                </div>
                            )}
                            <p className="mt-2 text-xs text-slate-500">
                                Foto wajib diambil langsung dari kamera.
                            </p>
                        </div>
                    </div>

                    <label className="block w-full min-w-0">
                        <span className="mb-2 block text-xs font-medium text-slate-600">
                            Catatan Lembur
                        </span>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            className="w-full min-w-0 max-w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400"
                            placeholder="Opsional"
                        />
                    </label>

                    <div className="flex gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                            Batal
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={loading}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
                        >
                            {loading && <Loader size={16} className="animate-spin" />}
                            Submit
                        </button>
                    </div>
                </div>
                <canvas ref={canvasRef} className="hidden" />
            </div>
        </div>
    );
}

function InfoBox({ label, value }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
                {value || "-"}
            </p>
        </div>
    );
}
