import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ArrowLeft,
    BriefcaseBusiness,
    CalendarDays,
    ChevronDown,
    CheckCircle2,
    Clock3,
    FileText,
    ImagePlus,
    MapPin,
    Pencil,
    Plane,
    Plus,
    Route,
    Save,
    Search,
    Send,
    Trash2,
    X,
    UserRoundCheck,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import { readLocalCache } from "../../utils/localDataCache";

const BUSINESS_TRIP_DRAFT_KEY = "business-trip.request-draft";

const masterProjectMock = [
    {
        id: "project-jakarta-chiller",
        project_name: "Jakarta Chiller Maintenance",
        customer_id: "customer-nusantara",
        job_scope: "AC",
        location: "Jakarta",
        is_active: true,
    },
    {
        id: "project-bandung-hotel",
        project_name: "Bandung Hotel Preventive Maintenance",
        customer_id: "customer-braga",
        job_scope: "AC",
        location: "Bandung",
        is_active: true,
    },
    {
        id: "project-surabaya-installation",
        project_name: "Surabaya Installation Survey",
        customer_id: "customer-sby",
        job_scope: "AC",
        location: "Surabaya",
        is_active: true,
    },
];

const getProjectLabel = (project) =>
    project?.project_name || project?.name || "Project";

const isProjectActive = (project) => {
    if (Object.prototype.hasOwnProperty.call(project, "is_active")) {
        return project.is_active !== false;
    }
    if (Object.prototype.hasOwnProperty.call(project, "status")) {
        return !["inactive", "nonaktif", "disabled", "archived"].includes(
            String(project.status ?? "").toLowerCase(),
        );
    }
    return true;
};

const loadMasterProjectOptions = () => {
    const cachedMasterData = readLocalCache("new-job.master-data", {});
    const cachedProjects = Array.isArray(cachedMasterData?.projects)
        ? cachedMasterData.projects
        : [];

    // TODO: Replace this fallback with the official Master Project hook/store
    // when Business Trip enters backend integration. Keep shape aligned with
    // `master_projects`: id, project_name, customer_id, job_scope, location.
    const sourceProjects = cachedProjects.length
        ? cachedProjects
        : masterProjectMock;

    return sourceProjects
        .filter(isProjectActive)
        .map((project) => ({
            ...project,
            id: project.id,
            project_name: getProjectLabel(project),
        }))
        .sort((a, b) =>
            getProjectLabel(a).localeCompare(getProjectLabel(b), "id-ID"),
        );
};

const getEmptyDraft = () => ({
    dateMode: "single",
    startDate: "",
    endDate: "",
    title: "",
    projectId: "",
    projectName: "",
    initiator: "self",
    initiatorName: "Budi Santoso",
    agendaItems: [],
});

const createAgendaItem = (index) => ({
    id: Date.now() + index,
    name: "",
    description: "",
    result: "",
    photos: [],
    expanded: true,
});

const normalizeAgendaItems = (agendaItems) =>
    (agendaItems ?? []).map((item, index) => ({
        id: item.id ?? Date.now() + index,
        name: item.name ?? item.title ?? "",
        description: item.description ?? item.note ?? "",
        result: item.result ?? "",
        photos: Array.isArray(item.photos) ? item.photos : [],
        expanded: item.expanded ?? index === 0,
    }));

const readBusinessTripDraft = () => {
    if (typeof window === "undefined") return getEmptyDraft();
    try {
        const raw = window.localStorage.getItem(BUSINESS_TRIP_DRAFT_KEY);
        if (!raw) return getEmptyDraft();
        const parsed = JSON.parse(raw);
        return {
            ...getEmptyDraft(),
            ...parsed,
            agendaItems: normalizeAgendaItems(parsed?.agendaItems),
        };
    } catch (error) {
        console.warn("[BusinessTrip] Failed to read draft:", error);
        return getEmptyDraft();
    }
};

const writeBusinessTripDraft = (draft) => {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(
            BUSINESS_TRIP_DRAFT_KEY,
            JSON.stringify(draft),
        );
    } catch (error) {
        console.warn("[BusinessTrip] Failed to write draft:", error);
    }
};

const pageConfig = {
    request: {
        title: "Pengajuan Business Trip",
        description: "Draft form pengajuan perjalanan dinas dengan data dummy.",
        icon: BriefcaseBusiness,
        stats: [
            { label: "Draft", value: "2", tone: "bg-slate-100 text-slate-700" },
            { label: "Pending", value: "4", tone: "bg-amber-50 text-amber-700" },
            { label: "Approved", value: "8", tone: "bg-emerald-50 text-emerald-700" },
        ],
        cards: [
            {
                title: "Site Visit Jakarta",
                meta: "PT Nusantara Cooling",
                detail: "Estimasi perjalanan 18-20 Jul 2026 untuk inspeksi unit AC chiller.",
                status: "Draft",
                icon: MapPin,
            },
            {
                title: "Maintenance Bandung",
                meta: "Hotel Braga",
                detail: "Pengajuan transport, penginapan, dan uang harian teknisi.",
                status: "Pending Review",
                icon: Plane,
            },
        ],
    },
    agenda: {
        title: "Agenda Business Trip",
        description: "Timeline perjalanan dinas dan aktivitas lapangan.",
        icon: CalendarDays,
        stats: [
            { label: "Hari Ini", value: "1", tone: "bg-sky-50 text-sky-700" },
            { label: "Minggu Ini", value: "5", tone: "bg-indigo-50 text-indigo-700" },
            { label: "Selesai", value: "12", tone: "bg-emerald-50 text-emerald-700" },
        ],
        cards: [
            {
                title: "Keberangkatan ke Surabaya",
                meta: "08:00 - CGK Terminal 3",
                detail: "Briefing singkat dan pengecekan dokumen perjalanan sebelum boarding.",
                status: "Scheduled",
                icon: Route,
            },
            {
                title: "Meeting Customer",
                meta: "13:30 - Site Office",
                detail: "Review scope pekerjaan, PIC lapangan, dan kebutuhan akses area.",
                status: "Confirmed",
                icon: UserRoundCheck,
            },
        ],
    },
    review: {
        title: "Review Pengajuan",
        description: "Daftar pengajuan dummy untuk kebutuhan approval UI.",
        icon: CheckCircle2,
        stats: [
            { label: "Menunggu", value: "6", tone: "bg-amber-50 text-amber-700" },
            { label: "Disetujui", value: "9", tone: "bg-emerald-50 text-emerald-700" },
            { label: "Revisi", value: "3", tone: "bg-red-50 text-red-700" },
        ],
        cards: [
            {
                title: "BT-2026-0017",
                meta: "Diajukan oleh Andi Saputra",
                detail: "Trip ke Medan untuk preventive maintenance 3 hari 2 malam.",
                status: "Need Review",
                icon: FileText,
            },
            {
                title: "BT-2026-0018",
                meta: "Diajukan oleh Rina Lestari",
                detail: "Kunjungan customer dan survey instalasi unit outdoor.",
                status: "Need Revision",
                icon: Clock3,
            },
        ],
    },
};

const businessTripTabs = [
    { label: "Pengajuan", path: "/business-trip", end: true },
    { label: "Agenda", path: "/business-trip/agenda" },
    { label: "Review", path: "/business-trip/review" },
];

export default function BusinessTripPage({ type = "request" }) {
    const { collapsed, toggle } = useSidebarCollapsed();
    const navigate = useNavigate();
    const config = pageConfig[type] ?? pageConfig.request;
    const Icon = config.icon;

    return (
        <div className="min-h-screen bg-sky-50">
            <div className="flex min-h-screen">
                <Sidebar collapsed={collapsed} onToggle={toggle} />
                <main className="min-w-0 flex-1 p-4 pb-24 md:p-8 md:pb-8">
                    <section className="overflow-hidden rounded-2xl bg-slate-950 text-white shadow-sm">
                        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4 md:px-6">
                            <button
                                type="button"
                                onClick={() => navigate(-1)}
                                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/15"
                                aria-label="Kembali"
                            >
                                <ArrowLeft size={20} />
                            </button>
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold uppercase text-sky-200">
                                    Business Trip
                                </p>
                                <h1 className="truncate text-xl font-semibold md:text-2xl">
                                    {config.title}
                                </h1>
                            </div>
                            <span className="hidden rounded-2xl bg-sky-500/20 p-3 text-sky-100 md:inline-flex">
                                <Icon size={24} />
                            </span>
                        </div>
                        <div className="px-4 py-5 md:px-6">
                            <p className="max-w-2xl text-sm leading-6 text-slate-300">
                                {config.description}
                            </p>
                            <div className="mt-5 grid grid-cols-3 gap-2 md:max-w-xl md:gap-3">
                                {config.stats.map((item) => (
                                    <div
                                        key={item.label}
                                        className={`rounded-2xl p-3 ${item.tone}`}
                                    >
                                        <p className="text-xs opacity-80">
                                            {item.label}
                                        </p>
                                        <p className="mt-1 text-2xl font-semibold">
                                            {item.value}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    <nav className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-white p-2 shadow-sm">
                        {businessTripTabs.map((tab) => (
                            <NavLink
                                key={tab.path}
                                to={tab.path}
                                end={tab.end}
                                className={({ isActive }) =>
                                    `rounded-xl px-2 py-3 text-center text-xs font-semibold transition md:text-sm ${
                                        isActive
                                            ? "bg-sky-600 text-white shadow-sm"
                                            : "text-slate-600 hover:bg-slate-50"
                                    }`
                                }
                                style={{ textDecoration: "none" }}
                            >
                                {tab.label}
                            </NavLink>
                        ))}
                    </nav>

                    {type === "request" ? (
                        <BusinessTripRequestForm />
                    ) : type === "review" ? (
                        <BusinessTripReviewPanel />
                    ) : (
                        <section className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
                            <div className="space-y-3">
                                {config.cards.map((card) => (
                                    <PlaceholderCard
                                        key={card.title}
                                        item={card}
                                    />
                                ))}
                            </div>

                            <aside className="rounded-2xl bg-white p-4 shadow-sm">
                                <div className="flex items-center gap-3">
                                    <span className="rounded-2xl bg-sky-50 p-3 text-sky-700">
                                        <Icon size={22} />
                                    </span>
                                    <div>
                                        <h2 className="text-base font-semibold text-slate-900">
                                            Placeholder UI
                                        </h2>
                                        <p className="text-sm text-slate-500">
                                            Belum terhubung backend.
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-4 space-y-3 text-sm text-slate-600">
                                    <p className="rounded-xl bg-slate-50 p-3">
                                        Area ini disiapkan untuk ringkasan,
                                        informasi approval, atau quick action
                                        pada tahap berikutnya.
                                    </p>
                                    <button
                                        type="button"
                                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                    >
                                        Action Placeholder
                                    </button>
                                </div>
                            </aside>
                        </section>
                    )}
                </main>
            </div>
            <MobileBottomNav />
        </div>
    );
}

function ProjectSearchSelect({
    value,
    projects,
    loading,
    error,
    onChange,
    onBlur,
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const rootRef = useRef(null);
    const selectedProject =
        projects.find((project) => project.id === value) ?? null;
    const filteredProjects = projects.filter((project) => {
        const keyword = search.trim().toLowerCase();
        if (!keyword) return true;
        const haystack = [
            project.project_name,
            project.location,
            project.customer_id,
            project.job_scope,
        ]
            .join(" ")
            .toLowerCase();
        return haystack.includes(keyword);
    });

    const close = useCallback(() => {
        setOpen(false);
        setSearch("");
        onBlur?.();
    }, [onBlur]);

    useEffect(() => {
        if (!open) return undefined;

        const handlePointerDown = (event) => {
            if (!rootRef.current?.contains(event.target)) close();
        };
        const handleEscape = (event) => {
            if (event.key === "Escape") close();
        };

        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [close, open]);

    return (
        <div ref={rootRef} className="relative mt-2">
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                onBlur={() => {
                    if (!open) onBlur?.();
                }}
                className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border bg-white px-3 py-3 text-left text-sm outline-none transition focus:border-sky-400 ${
                    error
                        ? "border-red-300 bg-red-50"
                        : "border-slate-200 hover:border-sky-300"
                }`}
            >
                <span
                    className={`min-w-0 flex-1 truncate ${
                        selectedProject ? "text-slate-800" : "text-slate-400"
                    }`}
                >
                    {loading
                        ? "Menyiapkan data project..."
                        : selectedProject?.project_name || "Pilih project"}
                </span>
                {selectedProject && (
                    <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onChange("");
                            onBlur?.();
                        }}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                event.stopPropagation();
                                onChange("");
                            }
                        }}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        aria-label="Clear project"
                    >
                        <X size={16} />
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                    <div className="border-b border-slate-100 p-2">
                        <label className="relative block">
                            <Search
                                size={16}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                            />
                            <input
                                value={search}
                                onChange={(event) =>
                                    setSearch(event.target.value)
                                }
                                placeholder="Cari nama project atau lokasi"
                                className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-sky-400"
                                autoFocus
                            />
                        </label>
                    </div>

                    <div className="max-h-72 overflow-y-auto p-1">
                        {loading ? (
                            <p className="px-3 py-4 text-sm text-slate-500">
                                Menyiapkan data project...
                            </p>
                        ) : projects.length === 0 ? (
                            <p className="px-3 py-4 text-sm text-slate-500">
                                Data project belum tersedia
                            </p>
                        ) : filteredProjects.length === 0 ? (
                            <p className="px-3 py-4 text-sm text-slate-500">
                                Project tidak ditemukan
                            </p>
                        ) : (
                            filteredProjects.map((project) => (
                                <button
                                    key={project.id}
                                    type="button"
                                    onMouseDown={(event) =>
                                        event.preventDefault()
                                    }
                                    onClick={() => {
                                        onChange(project.id);
                                        close();
                                    }}
                                    className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition ${
                                        project.id === value
                                            ? "bg-sky-50 text-sky-800"
                                            : "text-slate-700 hover:bg-slate-50"
                                    }`}
                                >
                                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                                        <BriefcaseBusiness size={16} />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-semibold">
                                            {project.project_name}
                                        </span>
                                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                                            {project.location || "Lokasi belum diisi"}
                                        </span>
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function BusinessTripRequestForm() {
    const dummyUserName = "Budi Santoso";
    const [draft, setDraft] = useState(readBusinessTripDraft);
    const [projects] = useState(loadMasterProjectOptions);
    const [projectLoading] = useState(false);
    const [toast, setToast] = useState("");
    const [touched, setTouched] = useState({});

    const hasDate =
        draft.dateMode === "single"
            ? Boolean(draft.startDate)
            : Boolean(draft.startDate && draft.endDate);
    const hasTitle = Boolean(draft.title.trim());
    const hasProject = Boolean(draft.projectId);
    const canSubmit =
        hasDate && hasTitle && hasProject && draft.agendaItems.length > 0;

    const summary = useMemo(() => {
        if (!draft.startDate) return "Tanggal belum dipilih";
        if (draft.dateMode === "range" && draft.endDate) {
            return `${draft.startDate} sampai ${draft.endDate}`;
        }
        return draft.startDate;
    }, [draft.dateMode, draft.endDate, draft.startDate]);

    const updateForm = (key, value) => {
        setDraft((prev) => {
            const next = { ...prev, [key]: value };
            writeBusinessTripDraft(next);
            return next;
        });
    };

    const selectInitiator = (value) => {
        setDraft((prev) => {
            const next = {
                ...prev,
                initiator: value,
                initiatorName:
                    value === "self" ? dummyUserName : prev.initiatorName,
            };
            writeBusinessTripDraft(next);
            return next;
        });
    };

    const selectProject = (projectId) => {
        const selectedProject =
            projects.find((project) => project.id === projectId) ?? null;
        setDraft((prev) => {
            const next = {
                ...prev,
                projectId: selectedProject?.id ?? "",
                projectName: selectedProject
                    ? getProjectLabel(selectedProject)
                    : "",
            };
            writeBusinessTripDraft(next);
            return next;
        });
    };

    const addAgenda = () => {
        setDraft((prev) => {
            const next = {
                ...prev,
                agendaItems: [
                    ...prev.agendaItems.map((item) => ({
                        ...item,
                        expanded: false,
                    })),
                    createAgendaItem(prev.agendaItems.length + 1),
                ],
            };
            writeBusinessTripDraft(next);
            return next;
        });
    };

    const removeAgenda = (id) => {
        setDraft((prev) => {
            const next = {
                ...prev,
                agendaItems: prev.agendaItems.filter((item) => item.id !== id),
            };
            writeBusinessTripDraft(next);
            return next;
        });
    };

    const updateAgenda = (id, patch) => {
        setDraft((prev) => {
            const next = {
                ...prev,
                agendaItems: prev.agendaItems.map((item) =>
                    item.id === id ? { ...item, ...patch } : item,
                ),
            };
            writeBusinessTripDraft(next);
            return next;
        });
    };

    const toggleAgenda = (id) => {
        setDraft((prev) => {
            const next = {
                ...prev,
                agendaItems: prev.agendaItems.map((item) =>
                    item.id === id
                        ? { ...item, expanded: !item.expanded }
                        : item,
                ),
            };
            writeBusinessTripDraft(next);
            return next;
        });
    };

    const addAgendaPhotos = (id, fileList) => {
        const files = Array.from(fileList ?? []);
        if (!files.length) return;

        const nextPhotos = files.map((file, index) => ({
            id: `${Date.now()}-${index}`,
            name: file.name,
            size: file.size,
            type: file.type,
            previewUrl: file.type.startsWith("image/")
                ? URL.createObjectURL(file)
                : "",
        }));

        setDraft((prev) => {
            const next = {
                ...prev,
                agendaItems: prev.agendaItems.map((item) =>
                    item.id === id
                        ? {
                              ...item,
                              photos: [...(item.photos ?? []), ...nextPhotos],
                          }
                        : item,
                ),
            };
            writeBusinessTripDraft(next);
            return next;
        });
    };

    const removeAgendaPhoto = (agendaId, photoId) => {
        setDraft((prev) => {
            const next = {
                ...prev,
                agendaItems: prev.agendaItems.map((item) =>
                    item.id === agendaId
                        ? {
                              ...item,
                              photos: (item.photos ?? []).filter(
                                  (photo) => photo.id !== photoId,
                              ),
                          }
                        : item,
                ),
            };
            writeBusinessTripDraft(next);
            return next;
        });
    };

    const showToast = (message) => {
        setToast(message);
        window.setTimeout(() => setToast(""), 2400);
    };

    const handleDraft = () => {
        console.log("[BusinessTrip] Simpan draft", {
            ...draft,
        });
        showToast("Draft pengajuan Business Trip tersimpan secara lokal.");
    };

    const handleSubmit = () => {
        setTouched({ title: true, date: true, project: true, agenda: true });
        if (!canSubmit) return;
        console.log("[BusinessTrip] Ajukan", {
            ...draft,
        });
        showToast("Dummy action: pengajuan siap dikirim.");
    };

    return (
        <section className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
            <form className="rounded-2xl bg-white p-4 shadow-sm md:p-6">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                    <span className="rounded-2xl bg-sky-50 p-3 text-sky-700">
                        <BriefcaseBusiness size={22} />
                    </span>
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">
                            Form Pengajuan
                        </h2>
                        <p className="text-sm text-slate-500">
                            Lengkapi detail dasar perjalanan dinas.
                        </p>
                    </div>
                </div>

                <div className="mt-5 space-y-5">
                    <div>
                        <FieldLabel required>Tanggal Business Trip</FieldLabel>
                        <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                            {[
                                ["single", "Single Date"],
                                ["range", "Date Range"],
                            ].map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => updateForm("dateMode", value)}
                                    className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                                        draft.dateMode === value
                                            ? "bg-white text-sky-700 shadow-sm"
                                            : "text-slate-500 hover:text-slate-700"
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <input
                                type="date"
                                value={draft.startDate}
                                onBlur={() =>
                                    setTouched((prev) => ({
                                        ...prev,
                                        date: true,
                                    }))
                                }
                                onChange={(event) =>
                                    updateForm("startDate", event.target.value)
                                }
                                className={`w-full rounded-xl border px-3 py-3 text-sm text-slate-700 outline-none focus:border-sky-400 ${
                                    touched.date && !hasDate
                                        ? "border-red-300 bg-red-50"
                                        : "border-slate-200 bg-white"
                                }`}
                            />
                            {draft.dateMode === "range" && (
                                <input
                                    type="date"
                                    value={draft.endDate}
                                    min={draft.startDate || undefined}
                                    onBlur={() =>
                                        setTouched((prev) => ({
                                            ...prev,
                                            date: true,
                                        }))
                                    }
                                    onChange={(event) =>
                                        updateForm("endDate", event.target.value)
                                    }
                                    className={`w-full rounded-xl border px-3 py-3 text-sm text-slate-700 outline-none focus:border-sky-400 ${
                                        touched.date && !hasDate
                                            ? "border-red-300 bg-red-50"
                                            : "border-slate-200 bg-white"
                                    }`}
                                />
                            )}
                        </div>
                        {touched.date && !hasDate && (
                            <p className="mt-2 text-xs font-medium text-red-600">
                                Tanggal Business Trip wajib diisi.
                            </p>
                        )}
                    </div>

                    <label className="block">
                        <FieldLabel required>Judul Business Trip</FieldLabel>
                        <input
                            type="text"
                            value={draft.title}
                            onBlur={() =>
                                setTouched((prev) => ({
                                    ...prev,
                                    title: true,
                                }))
                            }
                            onChange={(event) =>
                                updateForm("title", event.target.value)
                            }
                            placeholder="Contoh: Site visit customer Jakarta"
                            className={`mt-2 w-full rounded-xl border px-3 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-400 ${
                                touched.title && !hasTitle
                                    ? "border-red-300 bg-red-50"
                                    : "border-slate-200 bg-white"
                            }`}
                        />
                        {touched.title && !hasTitle && (
                            <p className="mt-2 text-xs font-medium text-red-600">
                                Judul Business Trip wajib diisi.
                            </p>
                        )}
                    </label>

                    <div>
                        <FieldLabel required>Project</FieldLabel>
                        <ProjectSearchSelect
                            value={draft.projectId}
                            projects={projects}
                            loading={projectLoading}
                            error={touched.project && !hasProject}
                            onChange={selectProject}
                            onBlur={() =>
                                setTouched((prev) => ({
                                    ...prev,
                                    project: true,
                                }))
                            }
                        />
                        {touched.project && !hasProject && (
                            <p className="mt-2 text-xs font-medium text-red-600">
                                Project wajib dipilih
                            </p>
                        )}
                    </div>

                    <div>
                        <FieldLabel>Inisiator</FieldLabel>
                        <div className="mt-2 grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1">
                            {[
                                ["self", "Saya"],
                                ["management", "Management"],
                                ["other", "Pihak Lain"],
                            ].map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => selectInitiator(value)}
                                    className={`rounded-xl px-2 py-2.5 text-xs font-semibold transition sm:text-sm ${
                                        draft.initiator === value
                                            ? "bg-slate-950 text-white shadow-sm"
                                            : "text-slate-500 hover:text-slate-700"
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                            Jika memilih Saya, nama inisiator otomatis memakai
                            user dummy. Pilihan lain tetap bisa diisi manual.
                        </p>
                    </div>

                    <label className="block">
                        <FieldLabel>Nama Inisiator</FieldLabel>
                        <input
                            type="text"
                            value={draft.initiatorName}
                            readOnly={draft.initiator === "self"}
                            onChange={(event) =>
                                updateForm("initiatorName", event.target.value)
                            }
                            placeholder="Masukkan nama inisiator"
                            className={`mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-400 ${
                                draft.initiator === "self"
                                    ? "bg-slate-50"
                                    : "bg-white"
                            }`}
                        />
                    </label>

                    <div>
                        <AgendaList
                            items={draft.agendaItems}
                            touched={touched.agenda}
                            onAdd={addAgenda}
                            onUpdate={updateAgenda}
                            onRemove={removeAgenda}
                            onToggle={toggleAgenda}
                            onAddPhotos={addAgendaPhotos}
                            onRemovePhoto={removeAgendaPhoto}
                        />
                    </div>
                </div>
            </form>

            <aside className="h-fit rounded-2xl bg-white p-4 shadow-sm md:p-5">
                <h2 className="text-base font-semibold text-slate-900">
                    Ringkasan Pengajuan
                </h2>
                <div className="mt-4 space-y-3 text-sm">
                    <SummaryRow label="Tanggal" value={summary} />
                    <SummaryRow
                        label="Judul"
                        value={draft.title.trim() || "Judul belum diisi"}
                    />
                    <SummaryRow
                        label="Project"
                        value={draft.projectName || "Project belum dipilih"}
                    />
                    <SummaryRow
                        label="Inisiator"
                        value={draft.initiatorName || "Nama belum diisi"}
                    />
                    <SummaryRow
                        label="Agenda"
                        value={`${draft.agendaItems.length} agenda`}
                    />
                </div>

                <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">
                        Status kelengkapan
                    </p>
                    <div className="mt-3 space-y-2 text-sm">
                        <ChecklistItem done={hasDate} label="Tanggal terisi" />
                        <ChecklistItem done={hasTitle} label="Judul terisi" />
                        <ChecklistItem
                            done={hasProject}
                            label="Project dipilih"
                        />
                        <ChecklistItem
                            done={draft.agendaItems.length > 0}
                            label="Minimal 1 agenda"
                        />
                    </div>
                </div>

                <div className="sticky bottom-20 mt-5 grid gap-2 rounded-2xl bg-white md:bottom-5">
                    <button
                        type="button"
                        onClick={handleDraft}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                        <Save size={16} />
                        Simpan Draft
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                        <Send size={16} />
                        Ajukan
                    </button>
                </div>

                {toast && (
                    <div className="fixed inset-x-4 bottom-24 z-50 rounded-2xl bg-slate-950 px-4 py-3 text-center text-sm font-medium text-white shadow-xl md:left-auto md:right-8 md:w-96">
                        {toast}
                    </div>
                )}
            </aside>
        </section>
    );
}

function AgendaList({
    items,
    touched,
    onAdd,
    onUpdate,
    onRemove,
    onToggle,
    onAddPhotos,
    onRemovePhoto,
}) {
    return (
        <section>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <FieldLabel required>List Agenda</FieldLabel>
                    <p className="mt-1 text-xs text-slate-500">
                        Tambahkan satu atau lebih agenda untuk Business Trip.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onAdd}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
                >
                    <Plus size={16} />
                    Tambah Agenda
                </button>
            </div>

            <div className="mt-3 space-y-3">
                {items.length === 0 ? (
                    <div
                        className={`rounded-2xl border-2 border-dashed p-6 text-center ${
                            touched
                                ? "border-red-200 bg-red-50 text-red-700"
                                : "border-sky-200 bg-sky-50 text-sky-700"
                        }`}
                    >
                        <CalendarDays size={30} className="mx-auto mb-2" />
                        <p className="text-sm font-semibold">
                            Belum ada agenda
                        </p>
                        <p className="mx-auto mt-1 max-w-md text-xs leading-5 opacity-80">
                            Tambahkan agenda perjalanan seperti meeting
                            customer, site visit, survey, atau kunjungan
                            instalasi.
                        </p>
                    </div>
                ) : (
                    items.map((item, index) => (
                        <AgendaCard
                            key={item.id}
                            item={item}
                            index={index}
                            onUpdate={onUpdate}
                            onRemove={onRemove}
                            onToggle={onToggle}
                            onAddPhotos={onAddPhotos}
                            onRemovePhoto={onRemovePhoto}
                        />
                    ))
                )}
            </div>
        </section>
    );
}

function AgendaCard({
    item,
    index,
    onUpdate,
    onRemove,
    onToggle,
    onAddPhotos,
    onRemovePhoto,
}) {
    const agendaLabel = `Agenda ${index + 1}`;
    const nameLabel = item.name?.trim() || "Nama agenda belum diisi";
    const summary =
        item.description?.trim() ||
        item.result?.trim() ||
        "Detail agenda belum dilengkapi.";

    return (
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-start gap-3 p-4">
                <button
                    type="button"
                    onClick={() => onToggle(item.id)}
                    className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 hover:bg-sky-100"
                    aria-label={`${item.expanded ? "Collapse" : "Expand"} ${agendaLabel}`}
                >
                    <ChevronDown
                        size={18}
                        className={`transition ${
                            item.expanded ? "rotate-180" : ""
                        }`}
                    />
                </button>

                <button
                    type="button"
                    onClick={() => onToggle(item.id)}
                    className="min-w-0 flex-1 text-left"
                >
                    <p className="text-xs font-semibold uppercase text-sky-700">
                        {agendaLabel}
                    </p>
                    <h3 className="mt-1 truncate text-base font-semibold text-slate-900">
                        {nameLabel}
                    </h3>
                    {!item.expanded && (
                        <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                            {summary}
                        </p>
                    )}
                    {!item.expanded && (
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                                {(item.photos ?? []).length} foto
                            </span>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                                {item.result?.trim()
                                    ? "Hasil terisi"
                                    : "Hasil belum diisi"}
                            </span>
                        </div>
                    )}
                </button>

                <div className="flex shrink-0 items-center gap-1">
                    <button
                        type="button"
                        onClick={() => {
                            if (!item.expanded) onToggle(item.id);
                        }}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        aria-label={`Edit ${agendaLabel}`}
                        title="Edit agenda"
                    >
                        <Pencil size={17} />
                    </button>
                    <button
                        type="button"
                        onClick={() => onRemove(item.id)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Hapus ${agendaLabel}`}
                        title="Hapus agenda"
                    >
                        <Trash2 size={17} />
                    </button>
                </div>
            </div>

            {item.expanded && (
                <div className="border-t border-slate-100 p-4 pt-5">
                    <div className="grid gap-4">
                        <label className="block">
                            <FieldLabel>Nama Agenda</FieldLabel>
                            <input
                                value={item.name ?? ""}
                                onChange={(event) =>
                                    onUpdate(item.id, {
                                        name: event.target.value,
                                    })
                                }
                                placeholder="Contoh: Meeting kickoff dengan customer"
                                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-400"
                            />
                        </label>

                        <label className="block">
                            <FieldLabel>Deskripsi / Tujuan Agenda</FieldLabel>
                            <textarea
                                value={item.description ?? ""}
                                onChange={(event) =>
                                    onUpdate(item.id, {
                                        description: event.target.value,
                                    })
                                }
                                placeholder="Tuliskan tujuan kunjungan, PIC yang ditemui, atau aktivitas utama."
                                className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-400"
                            />
                        </label>

                        <label className="block">
                            <FieldLabel>Hasil Business Trip</FieldLabel>
                            <textarea
                                value={item.result ?? ""}
                                onChange={(event) =>
                                    onUpdate(item.id, {
                                        result: event.target.value,
                                    })
                                }
                                placeholder="Contoh: Scope pekerjaan sudah disepakati dan jadwal follow-up dikonfirmasi."
                                className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-400"
                            />
                        </label>

                        <AgendaPhotoUpload
                            agendaId={item.id}
                            photos={item.photos ?? []}
                            onAddPhotos={onAddPhotos}
                            onRemovePhoto={onRemovePhoto}
                        />
                    </div>
                </div>
            )}
        </article>
    );
}

function AgendaPhotoUpload({
    agendaId,
    photos,
    onAddPhotos,
    onRemovePhoto,
}) {
    return (
        <div>
            <FieldLabel>Area Upload Foto Bukti Kunjungan</FieldLabel>
            <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-sky-200 bg-sky-50 px-4 py-6 text-center text-sky-700 transition hover:bg-sky-100">
                <ImagePlus size={28} />
                <span className="mt-2 text-sm font-semibold">
                    Upload Foto Bukti Kunjungan
                </span>
                <span className="mt-1 text-xs text-sky-600">
                    Pilih satu atau beberapa foto dari perangkat.
                </span>
                <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                        onAddPhotos(agendaId, event.target.files);
                        event.target.value = "";
                    }}
                />
            </label>

            {photos.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {photos.map((photo) => (
                        <div
                            key={photo.id}
                            className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                        >
                            {photo.previewUrl ? (
                                <img
                                    src={photo.previewUrl}
                                    alt={photo.name}
                                    className="aspect-square w-full object-cover"
                                />
                            ) : (
                                <div className="flex aspect-square items-center justify-center p-3 text-center text-xs text-slate-500">
                                    {photo.name}
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={() =>
                                    onRemovePhoto(agendaId, photo.id)
                                }
                                className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-slate-500 shadow-sm hover:bg-red-50 hover:text-red-600"
                                aria-label={`Hapus foto ${photo.name}`}
                            >
                                <X size={15} />
                            </button>
                            <div className="p-2">
                                <p className="truncate text-xs font-semibold text-slate-700">
                                    {photo.name}
                                </p>
                                <p className="mt-0.5 text-[11px] text-slate-500">
                                    {formatFileSize(photo.size)}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function formatFileSize(size) {
    const value = Number(size ?? 0);
    if (!value) return "0 KB";
    if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function BusinessTripReviewPanel() {
    const draft = readBusinessTripDraft();
    const initiatorLabel = {
        self: "Saya",
        management: "Management",
        other: "Pihak Lain",
    }[draft.initiator] ?? "Saya";
    const dateLabel =
        draft.dateMode === "range" && draft.endDate
            ? `${draft.startDate || "-"} sampai ${draft.endDate}`
            : draft.startDate || "-";

    return (
        <section className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
            <article className="rounded-2xl bg-white p-4 shadow-sm md:p-6">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                    <span className="rounded-2xl bg-sky-50 p-3 text-sky-700">
                        <CheckCircle2 size={22} />
                    </span>
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">
                            Informasi Business Trip
                        </h2>
                        <p className="text-sm text-slate-500">
                            Ringkasan data dari form pengajuan lokal.
                        </p>
                    </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                    <SummaryRow label="Tanggal Business Trip" value={dateLabel} />
                    <SummaryRow
                        label="Judul Business Trip"
                        value={draft.title || "-"}
                    />
                    <SummaryRow
                        label="Project"
                        value={draft.projectName || "Project belum dipilih"}
                    />
                    <SummaryRow label="Inisiator" value={initiatorLabel} />
                    <SummaryRow
                        label="Nama Inisiator"
                        value={draft.initiatorName || "-"}
                    />
                </div>

                <div className="mt-5">
                    <h3 className="text-sm font-semibold text-slate-900">
                        List Agenda
                    </h3>
                    <div className="mt-3 space-y-3">
                        {draft.agendaItems.length ? (
                            draft.agendaItems.map((item, index) => (
                                <div
                                    key={item.id}
                                    className="rounded-2xl border border-slate-200 p-3"
                                >
                                    <div className="flex gap-3">
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sm font-semibold text-sky-700">
                                            {index + 1}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-semibold text-slate-900">
                                                {item.name ||
                                                    `Agenda ${index + 1}`}
                                            </p>
                                            <p className="mt-1 text-sm text-slate-500">
                                                {item.description ||
                                                    "Deskripsi belum diisi."}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                                        <p className="rounded-xl bg-slate-50 p-3 text-slate-600">
                                            <span className="block text-xs font-semibold uppercase text-slate-500">
                                                Hasil
                                            </span>
                                            <span className="mt-1 block">
                                                {item.result ||
                                                    "Hasil belum diisi."}
                                            </span>
                                        </p>
                                        <p className="rounded-xl bg-slate-50 p-3 text-slate-600">
                                            <span className="block text-xs font-semibold uppercase text-slate-500">
                                                Foto Bukti
                                            </span>
                                            <span className="mt-1 block">
                                                {(item.photos ?? []).length}{" "}
                                                foto
                                            </span>
                                        </p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">
                                Belum ada agenda untuk direview.
                            </div>
                        )}
                    </div>
                </div>
            </article>

            <aside className="h-fit rounded-2xl bg-white p-4 shadow-sm md:p-5">
                <h2 className="text-base font-semibold text-slate-900">
                    Status Review
                </h2>
                <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                    Halaman ini masih UI preview. Data Project ditampilkan
                    memakai nama project yang tersimpan pada draft lokal, bukan
                    hanya ID.
                </div>
                <NavLink
                    to="/business-trip"
                    className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-700"
                    style={{ textDecoration: "none" }}
                >
                    Kembali Edit
                </NavLink>
            </aside>
        </section>
    );
}

function FieldLabel({ children, required = false }) {
    return (
        <span className="text-sm font-semibold text-slate-800">
            {children}
            {required && <span className="ml-1 text-red-500">*</span>}
        </span>
    );
}

function SummaryRow({ label, value }) {
    return (
        <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs font-medium uppercase text-slate-500">
                {label}
            </p>
            <p className="mt-1 break-words font-semibold text-slate-900">
                {value}
            </p>
        </div>
    );
}

function ChecklistItem({ done, label }) {
    return (
        <div className="flex items-center gap-2">
            <span
                className={`h-2.5 w-2.5 rounded-full ${
                    done ? "bg-emerald-500" : "bg-slate-300"
                }`}
            />
            <span className={done ? "text-slate-700" : "text-slate-500"}>
                {label}
            </span>
        </div>
    );
}

function PlaceholderCard({ item }) {
    const Icon = item.icon;

    return (
        <article className="rounded-2xl bg-white p-4 shadow-sm transition hover:shadow-md md:p-5">
            <div className="flex gap-3">
                <span className="mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                    <Icon size={21} />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                            <h2 className="text-base font-semibold text-slate-900">
                                {item.title}
                            </h2>
                            <p className="mt-1 text-sm text-slate-500">
                                {item.meta}
                            </p>
                        </div>
                        <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                            {item.status}
                        </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                        {item.detail}
                    </p>
                </div>
            </div>
        </article>
    );
}
