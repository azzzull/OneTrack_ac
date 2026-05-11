import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, Send, ArrowLeft, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import CustomSelect from "../../components/ui/CustomSelect";
import PhotoUploadInput from "../../components/PhotoUploadInput";
import JobTechnicianManagerModal from "../../components/job-technicians/JobTechnicianManagerModal";
import ScopeDetailFieldsRenderer from "../../components/scope-detail-fields/ScopeDetailFieldsRenderer";
import useScopeDetailFields from "../../hooks/useScopeDetailFields";
import useTechnicianDirectory from "../../hooks/useTechnicianDirectory";
import {
    JOB_SCOPE_LABELS,
    JOB_SCOPES,
    normalizeJobScope,
} from "../../utils/jobScopeCatalog";
import supabase from "../../supabaseClient";
import { useAuth } from "../../context/useAuth";
import { useDialog } from "../../context/useDialog";
import useJobScopeOptions from "../../hooks/useJobScopeOptions";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import { scanBarcodeFromFile } from "../../utils/barcodeScanner";
import {
    buildScopeDetailValuesPayload,
    validateScopeDetailValues,
} from "../../services/scopeDetailFieldsService";
import { uploadJobPhotoFile } from "../../services/jobPhotoService";
import { syncJobTechnicians } from "../../services/jobTechniciansService";

const initialForm = {
    jobScope: "AC",
    customerId: "",
    projectId: "",
    acBrand: "",
    acType: "",
    acCapacityPk: "",
    roomLocation: "",
    serialNumber: "",
    troubleDescription: "",
    replacedParts: "",
    reconditionedParts: "",
    scopeDetails: {},
};

const SectionTitle = ({ children }) => (
    <h2 className="mb-4 inline-flex items-center gap-2 text-base font-semibold text-sky-500 md:text-lg">
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

const getCurrentUserDisplayName = (user) => {
    const composed =
        `${user?.user_metadata?.first_name ?? ""} ${user?.user_metadata?.last_name ?? ""}`.trim();
    return (
        composed ||
        String(user?.user_metadata?.full_name ?? "").trim() ||
        String(user?.email ?? "").trim() ||
        "Teknisi"
    );
};

const getSessionRole = (role, user) => {
    const metadataRole = String(user?.user_metadata?.role ?? "")
        .trim()
        .toLowerCase();
    return (
        String(role ?? "")
            .trim()
            .toLowerCase() || metadataRole
    );
};

export default function AdminNewJobPage() {
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const [form, setForm] = useState(initialForm);
    const [customers, setCustomers] = useState([]);
    const [projects, setProjects] = useState([]);
    const [acBrands, setAcBrands] = useState([]);
    const [acTypes, setAcTypes] = useState([]);
    const [acPks, setAcPks] = useState([]);
    const [beforePhotoFile, setBeforePhotoFile] = useState(null);
    const [progressPhotoFile, setProgressPhotoFile] = useState(null);
    const [afterPhotoFile, setAfterPhotoFile] = useState(null);
    const [beforePhotoUrl, setBeforePhotoUrl] = useState("");
    const [progressPhotoUrl, setProgressPhotoUrl] = useState("");
    const [afterPhotoUrl, setAfterPhotoUrl] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [cameraOpen, setCameraOpen] = useState(false);
    const [cameraTarget, setCameraTarget] = useState(null);
    const [cameraError, setCameraError] = useState("");
    const [technicianModalOpen, setTechnicianModalOpen] = useState(false);
    const [selectedTechnicianIds, setSelectedTechnicianIds] = useState([]);

    const streamRef = useRef(null);
    const videoRef = useRef(null);

    const { user, role } = useAuth();
    const { alert: showAlert } = useDialog();
    const { labels: jobScopeLabels } = useJobScopeOptions();
    const { technicians, loading: techniciansLoading } =
        useTechnicianDirectory();
    const navigate = useNavigate();
    const sessionRole = getSessionRole(role, user);

    const setField = (key, value) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const setScopeDetail = (key, value) => {
        setForm((prev) => ({
            ...prev,
            scopeDetails: {
                ...(prev.scopeDetails ?? {}),
                [key]: value,
            },
        }));
    };

    const toggleScopeChecklist = (item) => {
        setForm((prev) => {
            const current = Array.isArray(prev.scopeDetails?.checklist)
                ? prev.scopeDetails.checklist
                : [];
            const nextChecklist = current.includes(item)
                ? current.filter((value) => value !== item)
                : [...current, item];
            return {
                ...prev,
                scopeDetails: {
                    ...(prev.scopeDetails ?? {}),
                    checklist: nextChecklist,
                },
            };
        });
    };

    const loadMasterData = useCallback(async () => {
        try {
            const [customersRes, projectsRes, brandsRes, typesRes, pksRes] =
                await Promise.all([
                    supabase
                        .from("master_customers")
                        .select("*")
                        .order("name", { ascending: true }),
                    supabase
                        .from("master_projects")
                        .select("*")
                        .order("project_name", { ascending: true }),
                    supabase
                        .from("master_ac_brands")
                        .select("*")
                        .order("name", { ascending: true }),
                    supabase
                        .from("master_ac_types")
                        .select("*")
                        .order("name", { ascending: true }),
                    supabase
                        .from("master_ac_pks")
                        .select("*")
                        .order("label", { ascending: true }),
                ]);

            if (customersRes.error) throw customersRes.error;
            if (projectsRes.error) throw projectsRes.error;
            if (brandsRes.error) throw brandsRes.error;
            if (typesRes.error) throw typesRes.error;
            if (pksRes.error) throw pksRes.error;
            setCustomers(customersRes.data ?? []);
            setProjects(projectsRes.data ?? []);
            setAcBrands(brandsRes.data ?? []);
            setAcTypes(typesRes.data ?? []);
            setAcPks(pksRes.data ?? []);
        } catch (error) {
            console.error("Error loading master data for new job:", error);
            setCustomers([]);
            setProjects([]);
            setAcBrands([]);
            setAcTypes([]);
            setAcPks([]);
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
    const availableProjects = useMemo(() => {
        if (!form.customerId) return [];
        return projects.filter((item) => item.customer_id === form.customerId);
    }, [form.customerId, projects]);

    const selectedProject = useMemo(
        () =>
            availableProjects.find((item) => item.id === form.projectId) ??
            null,
        [availableProjects, form.projectId],
    );
    const activeJobScope = normalizeJobScope(
        selectedProject?.job_scope ?? form.jobScope ?? JOB_SCOPES.AC,
    );
    const {
        fields: activeScopeDetailFields,
        checklist: activeScopeChecklist,
        loading: scopeFieldsLoading,
    } =
        useScopeDetailFields(activeJobScope);
    const activeScopeDetailFormFields = useMemo(() => {
        const hasSerialNumber = activeScopeDetailFields.some(
            (field) => field.field_key === "serial_number",
        );

        if (hasSerialNumber) return activeScopeDetailFields;

        return [
            {
                id: "serial_number",
                scope_id: null,
                field_key: "serial_number",
                field_label: "Serial Number",
                field_type: "text",
                placeholder: "Opsional, bisa dikosongkan",
                is_required: false,
                options: [],
                sort_order: -1,
                created_at: null,
                updated_at: null,
            },
            ...activeScopeDetailFields,
        ];
    }, [activeScopeDetailFields]);
    const activeScopeChecklistItems = useMemo(
        () =>
            activeScopeChecklist.map((item) =>
                typeof item === "object" && item
                    ? {
                          key: String(item.id ?? item.item_label ?? ""),
                          label: String(item.item_label ?? "").trim(),
                      }
                    : {
                          key: String(item ?? ""),
                          label: String(item ?? "").trim(),
                      },
            ),
        [activeScopeChecklist],
    );
    const scopeFieldSelectOptions = useMemo(
        () => ({
            ac_brand: acBrands.map((item) => ({
                value: item.name,
                label: item.name,
            })),
            ac_type: acTypes.map((item) => ({
                value: item.name,
                label: item.name,
            })),
            ac_capacity_pk: acPks.map((item) => ({
                value: item.label,
                label: item.label,
            })),
        }),
        [acBrands, acTypes, acPks],
    );
    const hasSelectedProject = Boolean(form.projectId && selectedProject);
    const selectedTechnicians = useMemo(
        () =>
            technicians.filter((tech) =>
                selectedTechnicianIds.includes(tech.id),
            ),
        [selectedTechnicianIds, technicians],
    );

    useEffect(() => {
        setForm((prev) => {
            if (!prev.scopeDetails || Object.keys(prev.scopeDetails).length === 0) {
                return prev;
            }
            return {
                ...prev,
                scopeDetails: {},
            };
        });
    }, [activeJobScope]);

    useEffect(() => {
        if (!form.customerId) {
            setForm((prev) => ({ ...prev, projectId: "" }));
            return;
        }
        const isStillValid = availableProjects.some(
            (item) => item.id === form.projectId,
        );
        if (!isStillValid && form.projectId) {
            setForm((prev) => ({
                ...prev,
                projectId: "",
            }));
        }
    }, [availableProjects, form.customerId, form.projectId]);

    useEffect(() => {
        if (!selectedProject) return;
        const nextScope = normalizeJobScope(selectedProject.job_scope ?? "AC");
        setForm((prev) =>
            prev.jobScope === nextScope
                ? prev
                : { ...prev, jobScope: nextScope },
        );
    }, [selectedProject]);

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
        const value = await scanBarcodeFromFile(file);
        if (!value) return false;
        setScopeDetail("serial_number", value);
        return true;
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

        if (cameraTarget === "serial-scan") {
            const found = await scanSerialFromImage(file);
            closeCamera();
            if (!found) {
                await showAlert(
                    "Barcode belum terbaca, arahkan kamera lebih dekat lalu scan ulang.",
                    { title: "Scan Gagal" },
                );
            }
            return;
        }

        closeCamera();
    };

    const uploadQueuedPhoto = useCallback(
        async (file, folderName) => {
            if (!file) return { url: "", path: "" };
            return uploadJobPhotoFile({
                supabaseClient: supabase,
                userId: user?.id ?? null,
                folderName,
                file,
            });
        },
        [user?.id],
    );

    useEffect(() => {
        if (cameraOpen && videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
            videoRef.current.play().catch(() => null);
        }
    }, [cameraOpen]);

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (!form.customerId || !form.projectId) {
            await showAlert("Lengkapi customer dan proyek terlebih dahulu.", {
                title: "Data Belum Lengkap",
            });
            return;
        }

        if (scopeFieldsLoading) {
            await showAlert("Konfigurasi field scope masih dimuat.", {
                title: "Mohon Tunggu",
            });
            return;
        }

        const missingFields = validateScopeDetailValues(
            activeScopeDetailFormFields,
            form.scopeDetails,
        );
        if (missingFields.length > 0) {
            await showAlert(
                `Lengkapi field berikut: ${missingFields
                    .map((field) => field.field_label)
                    .join(", ")}`,
                { title: "Data Belum Lengkap" },
            );
            return;
        }

        setSubmitting(true);

        const uploadedPhotoPaths = [];

        try {
            const detailValues = buildScopeDetailValuesPayload(
                activeScopeDetailFormFields,
                form.scopeDetails,
            );

            const beforeUpload = await uploadQueuedPhoto(
                beforePhotoFile,
                "before",
            );
            const progressUpload = await uploadQueuedPhoto(
                progressPhotoFile,
                "progress",
            );
            const afterUpload = await uploadQueuedPhoto(
                afterPhotoFile,
                "after",
            );

            if (beforeUpload?.path) uploadedPhotoPaths.push(beforeUpload.path);
            if (progressUpload?.path) uploadedPhotoPaths.push(progressUpload.path);
            if (afterUpload?.path) uploadedPhotoPaths.push(afterUpload.path);

            const payload = {
                title: selectedProject?.project_name ?? "",
                status: afterUpload?.url
                    ? "completed"
                    : progressUpload?.url
                      ? "in_progress"
                      : "requested",
                job_scope: activeJobScope,
                dynamic_data: {
                    ...detailValues,
                    ...(Array.isArray(form.scopeDetails?.checklist) &&
                    form.scopeDetails.checklist.length > 0
                        ? { checklist: form.scopeDetails.checklist }
                        : {}),
                },
                location:
                    selectedProject?.location ??
                    selectedCustomer?.location ??
                    "",
                customer_name: selectedCustomer?.name ?? "",
                customer_phone:
                    selectedProject?.phone ?? selectedCustomer?.phone ?? "",
                address:
                    selectedProject?.address ?? selectedCustomer?.address ?? "",
                customer_id: form.customerId,
                project_id: form.projectId,
                ac_brand: detailValues.ac_brand ?? null,
                ac_type: detailValues.ac_type ?? null,
                ac_capacity_pk: detailValues.ac_capacity_pk ?? null,
                room_location: detailValues.room_location ?? null,
                serial_number: detailValues.serial_number ?? null,
                trouble_description: form.troubleDescription,
                replaced_parts: form.replacedParts,
                reconditioned_parts: form.reconditionedParts,
                before_photo_url: beforeUpload?.url || null,
                progress_photo_url: progressUpload?.url || null,
                after_photo_url: afterUpload?.url || null,
                created_by: user?.id ?? null,
            };
            if (sessionRole === "technician") {
                payload.technician_id = user?.id ?? null;
                payload.technician_name = getCurrentUserDisplayName(user);
            }

            const { data: createdRequest, error } = await supabase
                .from("requests")
                .insert(payload)
                .select("id")
                .single();
            if (error) throw error;
            if (!createdRequest?.id) {
                throw new Error("Job berhasil dibuat tetapi ID tidak ditemukan.");
            }

            await syncJobTechnicians({
                jobId: createdRequest.id,
                creatorId: user?.id ?? null,
                technicianIds: selectedTechnicianIds,
                addedBy: user?.id ?? null,
            });

            setSelectedTechnicianIds([]);
            setBeforePhotoFile(null);
            setProgressPhotoFile(null);
            setAfterPhotoFile(null);
            setBeforePhotoUrl("");
            setProgressPhotoUrl("");
            setAfterPhotoUrl("");

            navigate(
                sessionRole === "technician" ? "/technician" : "/requests",
            );
        } catch (error) {
            console.error("Error submitting new job:", error);
            if (uploadedPhotoPaths.length > 0) {
                try {
                    await supabase.storage.from("job-photos").remove(
                        uploadedPhotoPaths
                    );
                } catch (cleanupError) {
                    console.warn(
                        "Failed to cleanup uploaded job photos:",
                        cleanupError,
                    );
                }
            }
            const detail = [
                error?.message,
                error?.details,
                error?.hint,
                error?.code ? `code=${error.code}` : "",
            ]
                .filter(Boolean)
                .join(" | ");
            await showAlert(
                detail
                    ? `Gagal menyimpan data pekerjaan: ${detail}`
                    : "Gagal menyimpan data pekerjaan. Cek struktur tabel Supabase.",
                { title: "Simpan Gagal" },
            );
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
                    onToggle={toggleSidebar}
                />

                <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8">
                    <div className="mb-6 flex items-center gap-3">
                        <Link
                            to={
                                sessionRole === "technician"
                                    ? "/technician/requests"
                                    : "/requests"
                            }
                            className="inline-flex rounded-lg p-2 text-slate-600 no-underline hover:bg-slate-100"
                            style={{ textDecoration: "none" }}
                        >
                            <ArrowLeft size={18} />
                        </Link>
                        <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">
                            Pekerjaan Baru
                        </h1>
                    </div>

                    <form
                        onSubmit={handleSubmit}
                        noValidate
                        className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-6"
                    >
                        <section>
                            <SectionTitle>Informasi Proyek</SectionTitle>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <label>
                                    <span className="text-sm font-medium text-slate-700">
                                        Customer Proyek
                                    </span>
                                    <CustomSelect
                                        value={form.customerId}
                                        onChange={(nextValue) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                customerId: nextValue,
                                                projectId: "",
                                            }))
                                        }
                                        options={[
                                            {
                                                value: "",
                                                label: "Pilih customer",
                                            },
                                            ...customers.map((item) => ({
                                                value: item.id,
                                                label: item.name ?? "-",
                                            })),
                                        ]}
                                        placeholder="Pilih customer"
                                    />
                                </label>
                                <label>
                                    <span className="text-sm font-medium text-slate-700">
                                        Proyek
                                    </span>
                                    <CustomSelect
                                        value={form.projectId}
                                        onChange={(nextValue) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                projectId: nextValue,
                                            }))
                                        }
                                        options={[
                                            {
                                                value: "",
                                                label: "Pilih proyek",
                                            },
                                            ...availableProjects.map(
                                                (item) => ({
                                                    value: item.id,
                                                    label:
                                                        item.project_name ??
                                                        "-",
                                                }),
                                            ),
                                        ]}
                                        placeholder="Pilih proyek"
                                    />
                                </label>
                                <label>
                                    <span className="text-sm font-medium text-slate-700">
                                        Nama Proyek
                                    </span>
                                    <input
                                        value={
                                            selectedProject?.project_name ?? ""
                                        }
                                        readOnly
                                        placeholder="Auto dari master project"
                                        className={inputClass}
                                    />
                                </label>
                                <label>
                                    <span className="text-sm font-medium text-slate-700">
                                        Lokasi Proyek
                                    </span>
                                    <input
                                        value={
                                            selectedProject?.location ??
                                            selectedCustomer?.location ??
                                            ""
                                        }
                                        readOnly
                                        placeholder="Auto dari master customer"
                                        className={inputClass}
                                    />
                                </label>
                                <label>
                                    <span className="text-sm font-medium text-slate-700">
                                        Scope Proyek
                                    </span>
                                    <input
                                        value={
                                            selectedProject
                                                ? jobScopeLabels[
                                                      activeJobScope
                                                  ] ??
                                                  JOB_SCOPE_LABELS[
                                                      activeJobScope
                                                  ] ??
                                                  activeJobScope
                                                : "Auto dari project pekerjaan"
                                        }
                                        readOnly
                                        className={inputClass}
                                    />
                                </label>
                                <label>
                                    <span className="text-sm font-medium text-slate-700">
                                        Nomor Telepon
                                    </span>
                                    <input
                                        value={
                                            selectedProject?.phone ??
                                            selectedCustomer?.phone ??
                                            ""
                                        }
                                        readOnly
                                        placeholder="Auto dari master customer"
                                        className={inputClass}
                                    />
                                </label>
                                <label className="md:col-span-2">
                                    <span className="text-sm font-medium text-slate-700">
                                        Alamat Lengkap
                                    </span>
                                    <textarea
                                        value={
                                            selectedProject?.address ??
                                            selectedCustomer?.address ??
                                            ""
                                        }
                                        readOnly
                                        placeholder="Auto dari master customer"
                                        className={`${inputClass} min-h-24`}
                                    />
                                </label>
                            </div>
                        </section>

                        {hasSelectedProject && (
                            <section className="mt-8">
                                <SectionTitle>
                                    Detail{" "}
                                    {jobScopeLabels[activeJobScope] ??
                                        JOB_SCOPE_LABELS[activeJobScope] ??
                                        activeJobScope}
                                </SectionTitle>
                                <ScopeDetailFieldsRenderer
                                    scopeCode={activeJobScope}
                                    fields={activeScopeDetailFormFields}
                                    values={form.scopeDetails}
                                    onChange={setScopeDetail}
                                    selectOptionsByFieldKey={
                                        scopeFieldSelectOptions
                                    }
                                    supabaseClient={supabase}
                                    loading={scopeFieldsLoading}
                                    serialNumberActions={{
                                        onScan: () =>
                                            openCamera("serial-scan"),
                                        onClear: () =>
                                            setScopeDetail(
                                                "serial_number",
                                                "",
                                            ),
                                    }}
                                />
                                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-medium text-slate-700">
                                                Tambah Teknisi
                                            </p>
                                            <p className="mt-1 text-xs text-slate-500">
                                                Pilih teknisi lain yang ikut
                                                mengerjakan job ini.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setTechnicianModalOpen(true)
                                            }
                                            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-100"
                                            disabled={techniciansLoading}
                                        >
                                            Kelola Teknisi
                                        </button>
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {selectedTechnicians.length > 0 ? (
                                            selectedTechnicians.map((tech) => (
                                                <span
                                                    key={tech.id}
                                                    className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700"
                                                >
                                                    {`${tech.first_name ?? ""} ${tech.last_name ?? ""}`.trim() ||
                                                        tech.name ||
                                                        tech.email}
                                                </span>
                                            ))
                                        ) : (
                                            <span className="text-xs text-slate-500">
                                                Belum ada teknisi tambahan.
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {activeScopeChecklist.length > 0 && (
                                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-sm font-medium text-slate-700">
                                            Checklist Pekerjaan
                                        </p>
                                        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                                            {activeScopeChecklistItems.map((item) => {
                                                const checked =
                                                    Array.isArray(
                                                        form.scopeDetails
                                                            ?.checklist,
                                                    ) &&
                                                    form.scopeDetails.checklist.includes(
                                                        item.label,
                                                    );
                                                return (
                                                    <label
                                                        key={item.key}
                                                        className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() =>
                                                                toggleScopeChecklist(
                                                                    item.label,
                                                                )
                                                            }
                                                            className="mt-1"
                                                        />
                                                        <span>{item.label}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </section>
                        )}

                        {hasSelectedProject ? (
                            <>
                                <section className="mt-8">
                                    <SectionTitle>
                                        Dokumentasi Foto
                                    </SectionTitle>
                                    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-slate-700">
                                                Foto Before
                                            </label>
                                            <PhotoUploadInput
                                                folderName="before"
                                                photoType="before"
                                                supabaseClient={supabase}
                                                deferredUpload={true}
                                                onPhotoSelected={(file) =>
                                                    setBeforePhotoFile(file)
                                                }
                                            />
                                            {beforePhotoFile && (
                                                <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                                                    <p className="text-xs text-emerald-700">
                                                        Foto terpilih:{" "}
                                                        {beforePhotoFile.name}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-slate-700">
                                                Foto Progress
                                            </label>
                                            <PhotoUploadInput
                                                folderName="progress"
                                                photoType="progress"
                                                supabaseClient={supabase}
                                                deferredUpload={true}
                                                onPhotoSelected={(file) =>
                                                    setProgressPhotoFile(file)
                                                }
                                            />
                                            {progressPhotoFile && (
                                                <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                                                    <p className="text-xs text-emerald-700">
                                                        Foto terpilih:{" "}
                                                        {progressPhotoFile.name}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-slate-700">
                                                Foto After
                                            </label>
                                            <PhotoUploadInput
                                                folderName="after"
                                                photoType="after"
                                                supabaseClient={supabase}
                                                deferredUpload={true}
                                                onPhotoSelected={(file) =>
                                                    setAfterPhotoFile(file)
                                                }
                                            />
                                            {afterPhotoFile && (
                                                <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                                                    <p className="text-xs text-emerald-700">
                                                        Foto terpilih:{" "}
                                                        {afterPhotoFile.name}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </section>

                                <section className="mt-8">
                                    <SectionTitle>
                                        Detail Perbaikan
                                    </SectionTitle>
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
                                            />
                                        </label>
                                        <label>
                                            <span className="text-sm font-medium text-slate-700">
                                                Suku Cadang Diganti
                                            </span>
                                            <textarea
                                                value={form.replacedParts}
                                                onChange={(e) =>
                                                    setField(
                                                        "replacedParts",
                                                        e.target.value,
                                                    )
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
                            </>
                        ) : (
                            <section className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
                                <p className="text-sm text-slate-600">
                                    Pilih proyek terlebih dahulu untuk
                                    menampilkan detail scope, dokumentasi foto,
                                    dan deskripsi pekerjaan.
                                </p>
                            </section>
                        )}

                        <button
                            type="submit"
                            disabled={
                                submitting ||
                                !hasSelectedProject ||
                                scopeFieldsLoading
                            }
                            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-sky-500 px-6 py-3 text-base font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-70 md:text-lg"
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

            <JobTechnicianManagerModal
                isOpen={technicianModalOpen}
                title="Tambah Teknisi ke Job Baru"
                technicians={technicians}
                selectedTechnicianIds={selectedTechnicianIds}
                creatorTechnicianId={user?.id ?? null}
                creatorLabel="Pembuat"
                onClose={() => setTechnicianModalOpen(false)}
                onSave={async (nextIds) => {
                    setSelectedTechnicianIds(nextIds);
                    setTechnicianModalOpen(false);
                }}
            />

            {cameraOpen && cameraTarget === "serial-scan" && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <p className="text-sm font-semibold text-slate-800">
                                Scan Barcode Serial
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
                            Scan Sekarang
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
