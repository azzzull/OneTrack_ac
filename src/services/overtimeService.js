import supabase from "../supabaseClient";
import { compressJobPhotoFile } from "./jobPhotoService";
import {
    calculateAttendanceOvertime,
    calculateManualDuration,
    formatOvertimeDuration,
} from "../utils/overtime";

const getProfileName = (profile) =>
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
    profile?.name ||
    profile?.email ||
    "Teknisi";

export const isOvertimeTableMissingError = (error) =>
    error?.code === "42P01" ||
    error?.status === 404 ||
    String(error?.message || "")
        .toLowerCase()
        .includes("overtime_requests") ||
    String(error?.details || "")
        .toLowerCase()
        .includes("overtime_requests");

const throwFriendlyOvertimeError = (error) => {
    if (isOvertimeTableMissingError(error)) {
        throw new Error(
            "Tabel overtime_requests belum tersedia. Jalankan migration 202606110001_create_overtime_management.sql di Supabase, lalu refresh aplikasi.",
        );
    }
    throw error;
};

export const getAddressFromLocation = (locationData) =>
    [
        locationData?.street_address,
        locationData?.sub_district,
        locationData?.district,
        locationData?.postal_code,
    ]
        .filter(Boolean)
        .join(", ");

const loadImageFromFile = (file) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

const canvasToBlob = (canvas) =>
    new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.82);
    });

export const createWatermarkedOvertimePhoto = async ({
    file,
    technicianName,
    takenAt,
    address,
    durationMinutes,
    overtimeType,
}) => {
    const image = await loadImageFromFile(file);
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(image, 0, 0, width, height);

    const lines = [
        `Nama: ${technicianName || "-"}`,
        `Waktu: ${new Date(takenAt).toLocaleString("id-ID", {
            day: "2-digit",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        })}`,
        `Lokasi: ${address || "-"}`,
        `Durasi: ${formatOvertimeDuration(durationMinutes)}`,
        `Jenis: ${overtimeType === "attendance" ? "Lembur dari Absensi" : "Lembur Manual"}`,
    ];

    const padding = Math.max(16, Math.round(width * 0.025));
    const fontSize = Math.max(18, Math.round(width * 0.026));
    const lineHeight = Math.round(fontSize * 1.35);
    const boxHeight = padding * 2 + lineHeight * lines.length;
    const y = height - boxHeight;

    ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
    ctx.fillRect(0, Math.max(0, y), width, boxHeight);
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 ${fontSize}px Arial, sans-serif`;
    ctx.textBaseline = "top";

    lines.forEach((line, index) => {
        ctx.fillText(line, padding, y + padding + index * lineHeight);
    });

    const blob = await canvasToBlob(canvas);
    return new File([blob], file.name || "overtime-proof.jpg", {
        type: "image/jpeg",
    });
};

export const uploadOvertimeProof = async ({
    userId,
    file,
    technicianName,
    takenAt,
    address,
    durationMinutes,
    overtimeType,
    alreadyWatermarked = false,
}) => {
    if (!navigator.onLine) throw new Error("Tidak ada koneksi internet.");
    if (!file) throw new Error("Foto bukti lembur wajib diisi.");

    const watermarkedFile = alreadyWatermarked
        ? file
        : await createWatermarkedOvertimePhoto({
              file,
              technicianName,
              takenAt,
              address,
              durationMinutes,
              overtimeType,
          });
    const compressedFile = await compressJobPhotoFile(watermarkedFile, {
        maxBytes: 220 * 1024,
        maxDimension: 1600,
        minQuality: 0.45,
    });
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const uploadPath = `${userId}/overtime/${fileName}`;

    const { error } = await supabase.storage
        .from("overtime-proofs")
        .upload(uploadPath, compressedFile, { upsert: false });
    if (error) throw error;

    const { data } = supabase.storage
        .from("overtime-proofs")
        .getPublicUrl(uploadPath);
    return { url: data?.publicUrl || "", path: uploadPath };
};

export const createAttendanceOvertimeRequest = async ({
    attendance,
    userId,
    profile,
    locationData,
    photoFile,
    photoAlreadyWatermarked = false,
    notes,
}) => {
    if (!attendance?.id) throw new Error("Data absensi tidak tersedia.");
    if (locationData?.latitude == null || locationData?.longitude == null) {
        throw new Error("Lokasi aktif wajib diambil.");
    }
    const address = getAddressFromLocation(locationData);
    if (!address) throw new Error("Alamat lokasi belum tersedia.");

    const overtime = calculateAttendanceOvertime({
        checkInTime: attendance.check_in_time,
        checkOutTime: attendance.check_out_time,
    });
    if (!overtime.eligible) throw new Error("Absensi belum memenuhi syarat lembur.");

    const technicianName = getProfileName(profile);
    const proof = await uploadOvertimeProof({
        userId,
        file: photoFile,
        technicianName,
        takenAt: attendance.check_out_time,
        address,
        durationMinutes: overtime.durationMinutes,
        overtimeType: "attendance",
        alreadyWatermarked: photoAlreadyWatermarked,
    });

    const { data, error } = await supabase
        .from("overtime_requests")
        .insert({
            attendance_id: attendance.id,
            technician_id: attendance.technician_id,
            requested_by: userId,
            overtime_type: "attendance",
            date: attendance.attendance_date,
            normal_checkout_at: overtime.normalCheckoutAt,
            start_at: overtime.normalCheckoutAt,
            end_at: attendance.check_out_time,
            duration_minutes: overtime.durationMinutes,
            photo_url: proof.url,
            photo_path: proof.path,
            location_lat: locationData.latitude,
            location_lng: locationData.longitude,
            location_address: address,
            notes: notes || null,
            status: "pending",
        })
        .select("*")
        .single();

    if (error) throwFriendlyOvertimeError(error);
    return data;
};

export const createManualOvertimeRequest = async ({
    technicianId,
    requestedBy,
    profile,
    date,
    startAt,
    endAt,
    locationData,
    photoFile,
    photoTakenAt,
    photoAlreadyWatermarked = false,
    notes,
}) => {
    if (!technicianId) throw new Error("Teknisi wajib diisi.");
    if (!date || !startAt || !endAt) throw new Error("Tanggal dan jam wajib diisi.");
    if (locationData?.latitude == null || locationData?.longitude == null) {
        throw new Error("Lokasi aktif wajib diambil.");
    }
    const address = getAddressFromLocation(locationData);
    if (!address) throw new Error("Alamat lokasi belum tersedia.");

    let start = new Date(startAt);
    let end = new Date(endAt);
    if (end <= start) {
        end = new Date(end);
        end.setDate(end.getDate() + 1);
    }
    const durationMinutes = calculateManualDuration(start, end);
    if (durationMinutes <= 0) throw new Error("Durasi lembur tidak valid.");

    const proof = await uploadOvertimeProof({
        userId: requestedBy,
        file: photoFile,
        technicianName: getProfileName(profile),
        takenAt: photoTakenAt || new Date().toISOString(),
        address,
        durationMinutes,
        overtimeType: "manual",
        alreadyWatermarked: photoAlreadyWatermarked,
    });

    const { data, error } = await supabase
        .from("overtime_requests")
        .insert({
            attendance_id: null,
            technician_id: technicianId,
            requested_by: requestedBy,
            overtime_type: "manual",
            date,
            normal_checkout_at: null,
            start_at: start.toISOString(),
            end_at: end.toISOString(),
            duration_minutes: durationMinutes,
            photo_url: proof.url,
            photo_path: proof.path,
            location_lat: locationData.latitude,
            location_lng: locationData.longitude,
            location_address: address,
            notes: notes || null,
            status: "pending",
        })
        .select("*")
        .single();

    if (error) throwFriendlyOvertimeError(error);
    return data;
};

export const markAttendanceOvertimeNotSubmitted = async ({
    attendanceId,
    reason,
}) => {
    const { data, error } = await supabase
        .from("attendance")
        .update({
            overtime_submission_status: "not_submitted",
            overtime_not_submitted_reason: reason || null,
        })
        .eq("id", attendanceId)
        .select("*")
        .single();
    if (error) throw error;
    return data;
};

export const listOvertimeRequests = async ({ role, userId } = {}) => {
    let query = supabase
        .from("overtime_requests")
        .select(
            `
            *,
            technician:profiles!overtime_requests_technician_id_fkey(id, first_name, last_name, name, email, role),
            requester:profiles!overtime_requests_requested_by_fkey(id, first_name, last_name, name, email),
            reviewer:profiles!overtime_requests_reviewed_by_fkey(id, first_name, last_name, name, email)
        `,
        )
        .order("created_at", { ascending: false });

    if (role === "technician" && userId) {
        query = query.eq("technician_id", userId);
    }

    const { data, error } = await query;
    if (error) throwFriendlyOvertimeError(error);
    return data || [];
};

export const reviewOvertimeRequest = async ({ requestId, status, notes, userId }) => {
    if (!["approved", "rejected"].includes(status)) {
        throw new Error("Status review tidak valid.");
    }

    const { data, error } = await supabase
        .from("overtime_requests")
        .update({
            status,
            reviewed_by: userId,
            reviewed_at: new Date().toISOString(),
            review_notes: notes || null,
        })
        .eq("id", requestId)
        .select("*")
        .single();

    if (error) throwFriendlyOvertimeError(error);
    return data;
};
