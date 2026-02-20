import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, Send, ArrowLeft, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import supabase from "../../supabaseClient";
import { useAuth } from "../../context/useAuth";

const initialForm = {
    customerId: "",
    projectId: "",
    acBrand: "",
    acType: "Split Wall",
    acCapacityPk: "",
    roomLocation: "",
    serialNumber: "",
    troubleDescription: "",
    replacedParts: "",
    reconditionedParts: "",
};

const acTypeOptions = ["Split Wall", "Cassette", "Standing", "Ducting"];
const acCapacityOptions = ["0.5 PK", "0.75 PK", "1 PK", "1.5 PK", "2 PK", "3 PK"];

const SectionTitle = ({ children }) => (
    <h2 className="mb-4 inline-flex items-center gap-2 text-lg font-semibold text-sky-500">
        <CheckCircle2 size={16} />
        {children}
    </h2>
);

const FileCaptureCard = ({ label, fileName, onClick }) => (
    <div>
        <p className="mb-2 text-sm font-medium text-slate-700">{label}</p>
        <button
            type="button"
            onClick={onClick}
            className="flex h-40 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-slate-500 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-500"
        >
            <Camera size={20} />
            <span className="mt-2 text-sm">Klik untuk Ambil</span>
            {fileName && (
                <span className="mt-2 max-w-[90%] truncate text-xs text-slate-600">
                    {fileName}
                </span>
            )}
        </button>
    </div>
);

const inputClass =
    "mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-300 focus:bg-white";

export default function AdminNewJobPage() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [form, setForm] = useState(initialForm);
    const [customers, setCustomers] = useState([]);
    const [projects, setProjects] = useState([]);
    const [beforePhoto, setBeforePhoto] = useState(null);
    const [progressPhoto, setProgressPhoto] = useState(null);
    const [afterPhoto, setAfterPhoto] = useState(null);
    const [serialScanPhoto, setSerialScanPhoto] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [cameraOpen, setCameraOpen] = useState(false);
    const [cameraTarget, setCameraTarget] = useState(null);
    const [cameraError, setCameraError] = useState("");

    const streamRef = useRef(null);
    const videoRef = useRef(null);

    const { user } = useAuth();
    const navigate = useNavigate();

    const setField = (key, value) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const loadMasterData = useCallback(async () => {
        try {
            const [customersRes, projectsRes] = await Promise.all([
                supabase
                    .from("master_customers")
                    .select("*")
                    .order("name", { ascending: true }),
                supabase
                    .from("master_projects")
                    .select("*")
                    .order("project_name", { ascending: true }),
            ]);

            if (customersRes.error) throw customersRes.error;
            if (projectsRes.error) throw projectsRes.error;

            setCustomers(customersRes.data ?? []);
            setProjects(projectsRes.data ?? []);
        } catch (error) {
            console.error("Error loading master data for new job:", error);
            setCustomers([]);
            setProjects([]);
        }
    }, []);

    useEffect(() => {
        const timerId = setTimeout(() => {
            loadMasterData();
        }, 0);

        return () => clearTimeout(timerId);
    }, [loadMasterData]);

    const selectedCustomer = useMemo(
        () => customers.find((item) => item.id === form.customerId) ?? null,
        [customers, form.customerId],
    );

    const projectOptions = useMemo(
        () =>
            projects.filter((item) =>
                form.customerId ? item.customer_id === form.customerId : false,
            ),
        [projects, form.customerId],
    );

    const selectedProject = useMemo(
        () => projectOptions.find((item) => item.id === form.projectId) ?? null,
        [projectOptions, form.projectId],
    );

    const uploadPhoto = async (file, folderName) => {
        if (!file) return null;
        const ext = file.name.split(".").pop() || "jpg";
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const path = `${user?.id ?? "anonymous"}/${folderName}/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from("job-photos")
            .upload(path, file, { upsert: false });
        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from("job-photos").getPublicUrl(path);
        return data?.publicUrl ?? null;
    };

    const stopCameraStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, []);

    const closeCamera = useCallback(() => {
        stopCameraStream();
        setCameraOpen(false);
        setCameraTarget(null);
        setCameraError("");
    }, [stopCameraStream]);

    const openCamera = useCallback(async (target) => {
        if (!navigator.mediaDevices?.getUserMedia) {
            setCameraError("Browser tidak mendukung akses kamera.");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" } },
                audio: false,
            });
            streamRef.current = stream;
            setCameraTarget(target);
            setCameraOpen(true);
            setCameraError("");
        } catch (error) {
            console.error("Camera access failed:", error);
            setCameraError(
                "Akses kamera ditolak. Aktifkan izin kamera di browser.",
            );
        }
    }, []);

    const scanSerialFromImage = async (file) => {
        if (!file) return;
        if (!("BarcodeDetector" in window)) return;

        try {
            const bitmap = await createImageBitmap(file);
            const detector = new window.BarcodeDetector({
                formats: ["code_128", "code_39", "ean_13", "ean_8", "qr_code"],
            });
            const codes = await detector.detect(bitmap);
            if (codes.length > 0) {
                setField("serialNumber", codes[0].rawValue ?? "");
            }
        } catch (error) {
            console.error("Barcode scan failed:", error);
        }
    };

    const captureFromCamera = async () => {
        const video = videoRef.current;
        if (!video || !cameraTarget) return;

        const width = video.videoWidth || 1280;
        const height = video.videoHeight || 720;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.drawImage(video, 0, 0, width, height);

        const blob = await new Promise((resolve) => {
            canvas.toBlob(resolve, "image/jpeg", 0.9);
        });

        if (!blob) return;
        const file = new File([blob], `${cameraTarget}-${Date.now()}.jpg`, {
            type: "image/jpeg",
        });

        if (cameraTarget === "before") setBeforePhoto(file);
        if (cameraTarget === "progress") setProgressPhoto(file);
        if (cameraTarget === "after") setAfterPhoto(file);
        if (cameraTarget === "serial-scan") {
            setSerialScanPhoto(file);
            await scanSerialFromImage(file);
        }

        closeCamera();
    };

    useEffect(() => {
        if (cameraOpen && videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
            videoRef.current.play().catch(() => null);
        }
    }, [cameraOpen]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setSubmitting(true);

        try {
            const [beforeUrl, progressUrl, afterUrl, serialScanPhotoUrl] =
                await Promise.all([
                    uploadPhoto(beforePhoto, "before"),
                    uploadPhoto(progressPhoto, "progress"),
                    uploadPhoto(afterPhoto, "after"),
                    uploadPhoto(serialScanPhoto, "serial-scan"),
                ]);

            const payload = {
                title: selectedProject?.project_name ?? "",
                status: "pending",
                location: selectedProject?.location ?? "",
                customer_name: selectedCustomer?.name ?? "",
                customer_phone: selectedProject?.phone ?? "",
                address: selectedProject?.address ?? "",
                customer_id: form.customerId,
                project_id: form.projectId,
                ac_brand: form.acBrand,
                ac_type: form.acType,
                ac_capacity_pk: form.acCapacityPk,
                room_location: form.roomLocation,
                serial_number: form.serialNumber,
                serial_scan_photo_url: serialScanPhotoUrl,
                trouble_description: form.troubleDescription,
                replaced_parts: form.replacedParts,
                reconditioned_parts: form.reconditionedParts,
                before_photo_url: beforeUrl,
                progress_photo_url: progressUrl,
                after_photo_url: afterUrl,
                created_by: user?.id ?? null,
            };

            const { error } = await supabase.from("requests").insert(payload);
            if (error) throw error;

            navigate("/requests");
        } catch (error) {
            console.error("Error submitting new job:", error);
            alert("Gagal menyimpan data pekerjaan. Cek struktur tabel Supabase.");
        } finally {
            setSubmitting(false);
        }
    };

    useEffect(
        () => () => {
            stopCameraStream();
        },
        [stopCameraStream],
    );

    return (
        <div className="min-h-screen bg-sky-50">
            <div className="flex min-h-screen">
                <Sidebar
                    collapsed={sidebarCollapsed}
                    onToggle={() => setSidebarCollapsed((prev) => !prev)}
                />

                <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8">
                    <div className="mb-6 flex items-center gap-3">
                        <Link
                            to="/requests"
                            className="inline-flex rounded-lg p-2 text-slate-600 no-underline hover:bg-slate-100"
                            style={{ textDecoration: "none" }}
                        >
                            <ArrowLeft size={18} />
                        </Link>
                        <h1 className="text-3xl font-semibold text-slate-900">
                            Pekerjaan Baru
                        </h1>
                    </div>

                    <form
                        onSubmit={handleSubmit}
                        className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-6"
                    >
                        <section>
                            <SectionTitle>Informasi Proyek</SectionTitle>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <label>
                                    <span className="text-sm font-medium text-slate-700">
                                        Customer Proyek
                                    </span>
                                    <select
                                        value={form.customerId}
                                        onChange={(e) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                customerId: e.target.value,
                                                projectId: "",
                                            }))
                                        }
                                        className={inputClass}
                                        required
                                    >
                                        <option value="">Pilih customer</option>
                                        {customers.map((item) => (
                                            <option key={item.id} value={item.id}>
                                                {item.name}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    <span className="text-sm font-medium text-slate-700">
                                        Nama Proyek
                                    </span>
                                    <select
                                        value={form.projectId}
                                        onChange={(e) =>
                                            setField("projectId", e.target.value)
                                        }
                                        className={inputClass}
                                        required
                                        disabled={!form.customerId}
                                    >
                                        <option value="">Pilih proyek</option>
                                        {projectOptions.map((item) => (
                                            <option key={item.id} value={item.id}>
                                                {item.project_name}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    <span className="text-sm font-medium text-slate-700">
                                        Lokasi Proyek
                                    </span>
                                    <input
                                        value={selectedProject?.location ?? ""}
                                        readOnly
                                        placeholder="Auto dari master proyek"
                                        className={inputClass}
                                    />
                                </label>
                                <label>
                                    <span className="text-sm font-medium text-slate-700">
                                        Nomor Telepon
                                    </span>
                                    <input
                                        value={selectedProject?.phone ?? ""}
                                        readOnly
                                        placeholder="Auto dari master proyek"
                                        className={inputClass}
                                    />
                                </label>
                                <label className="md:col-span-2">
                                    <span className="text-sm font-medium text-slate-700">
                                        Alamat Lengkap
                                    </span>
                                    <textarea
                                        value={selectedProject?.address ?? ""}
                                        readOnly
                                        placeholder="Auto dari master proyek"
                                        className={`${inputClass} min-h-24`}
                                    />
                                </label>
                            </div>
                        </section>

                        <section className="mt-8">
                            <SectionTitle>Detail Unit AC</SectionTitle>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                <label>
                                    <span className="text-sm font-medium text-slate-700">
                                        Merk AC
                                    </span>
                                    <input
                                        value={form.acBrand}
                                        onChange={(e) =>
                                            setField("acBrand", e.target.value)
                                        }
                                        placeholder="Pilih Merk"
                                        className={inputClass}
                                        required
                                    />
                                </label>
                                <label>
                                    <span className="text-sm font-medium text-slate-700">
                                        Tipe AC
                                    </span>
                                    <select
                                        value={form.acType}
                                        onChange={(e) =>
                                            setField("acType", e.target.value)
                                        }
                                        className={inputClass}
                                    >
                                        {acTypeOptions.map((item) => (
                                            <option key={item} value={item}>
                                                {item}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    <span className="text-sm font-medium text-slate-700">
                                        Kapasitas AC (PK)
                                    </span>
                                    <select
                                        value={form.acCapacityPk}
                                        onChange={(e) =>
                                            setField("acCapacityPk", e.target.value)
                                        }
                                        className={inputClass}
                                        required
                                    >
                                        <option value="">Pilih PK</option>
                                        {acCapacityOptions.map((item) => (
                                            <option key={item} value={item}>
                                                {item}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="md:col-span-1">
                                    <span className="text-sm font-medium text-slate-700">
                                        Lokasi Ruangan
                                    </span>
                                    <input
                                        value={form.roomLocation}
                                        onChange={(e) =>
                                            setField("roomLocation", e.target.value)
                                        }
                                        placeholder="Contoh: Ruang Meeting A"
                                        className={inputClass}
                                        required
                                    />
                                </label>
                                <div className="md:col-span-2">
                                    <label>
                                        <span className="text-sm font-medium text-slate-700">
                                            Serial Number
                                        </span>
                                        <div className="mt-1 flex gap-2">
                                            <input
                                                value={form.serialNumber}
                                                onChange={(e) =>
                                                    setField(
                                                        "serialNumber",
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder="Scan atau input manual"
                                                className={inputClass}
                                            />
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    openCamera("serial-scan")
                                                }
                                                className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-100 px-3 text-slate-600 hover:bg-slate-200"
                                                title="Scan serial dengan kamera"
                                            >
                                                <Camera size={16} />
                                            </button>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </section>

                        <section className="mt-8">
                            <SectionTitle>Dokumentasi Foto</SectionTitle>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                <FileCaptureCard
                                    label="Foto Before"
                                    fileName={beforePhoto?.name}
                                    onClick={() => openCamera("before")}
                                />
                                <FileCaptureCard
                                    label="Foto Progress"
                                    fileName={progressPhoto?.name}
                                    onClick={() => openCamera("progress")}
                                />
                                <FileCaptureCard
                                    label="Foto After"
                                    fileName={afterPhoto?.name}
                                    onClick={() => openCamera("after")}
                                />
                            </div>
                        </section>

                        <section className="mt-8">
                            <SectionTitle>Detail Perbaikan</SectionTitle>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <label className="md:col-span-2">
                                    <span className="text-sm font-medium text-slate-700">
                                        Deskripsi Masalah / Trouble
                                    </span>
                                    <textarea
                                        value={form.troubleDescription}
                                        onChange={(e) =>
                                            setField(
                                                "troubleDescription",
                                                e.target.value,
                                            )
                                        }
                                        placeholder="Jelaskan keluhan kerusakan"
                                        className={`${inputClass} min-h-24`}
                                        required
                                    />
                                </label>
                                <label>
                                    <span className="text-sm font-medium text-slate-700">
                                        Suku Cadang Diganti
                                    </span>
                                    <textarea
                                        value={form.replacedParts}
                                        onChange={(e) =>
                                            setField("replacedParts", e.target.value)
                                        }
                                        placeholder="Daftar part baru"
                                        className={`${inputClass} min-h-20`}
                                    />
                                </label>
                                <label>
                                    <span className="text-sm font-medium text-slate-700">
                                        Suku Cadang Direkondisi
                                    </span>
                                    <textarea
                                        value={form.reconditionedParts}
                                        onChange={(e) =>
                                            setField(
                                                "reconditionedParts",
                                                e.target.value,
                                            )
                                        }
                                        placeholder="Daftar part rekondisi"
                                        className={`${inputClass} min-h-20`}
                                    />
                                </label>
                            </div>
                        </section>

                        <button
                            type="submit"
                            disabled={submitting}
                            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-sky-500 px-6 py-3 text-lg font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            <span>
                                {submitting
                                    ? "Mengirim Laporan..."
                                    : "Kirim Laporan Pekerjaan"}
                            </span>
                            <Send size={16} />
                        </button>
                    </form>
                </main>
            </div>

            <MobileBottomNav />

            {cameraOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <p className="text-sm font-semibold text-slate-800">
                                Ambil Foto
                            </p>
                            <button
                                type="button"
                                onClick={closeCamera}
                                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="overflow-hidden rounded-xl bg-black">
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className="h-80 w-full object-cover"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={captureFromCamera}
                            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
                        >
                            <Camera size={16} />
                            Ambil Foto
                        </button>
                    </div>
                </div>
            )}

            {cameraError && (
                <div className="fixed bottom-20 right-4 z-50 rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white shadow-lg">
                    {cameraError}
                </div>
            )}
        </div>
    );
}
