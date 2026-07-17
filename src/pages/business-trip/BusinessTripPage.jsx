import { useMemo, useState } from "react";
import {
    ArrowLeft,
    BriefcaseBusiness,
    CalendarDays,
    CheckCircle2,
    Plus,
    Save,
    Send,
    Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";

const dummyUserName = "Budi Santoso";

const createAgenda = (index) => ({
    id: Date.now() + index,
    title: `Agenda ${index}`,
    description: "Detail agenda akan dilengkapi pada tahap berikutnya.",
});

export default function BusinessTripPage() {
    const { collapsed, toggle } = useSidebarCollapsed();
    const navigate = useNavigate();
    const [dateMode, setDateMode] = useState("single");
    const [form, setForm] = useState({
        startDate: "",
        endDate: "",
        title: "",
        initiator: "self",
        initiatorName: dummyUserName,
    });
    const [agendas, setAgendas] = useState([]);
    const [touched, setTouched] = useState({});
    const [toast, setToast] = useState("");

    const hasDate =
        dateMode === "single"
            ? Boolean(form.startDate)
            : Boolean(form.startDate && form.endDate);
    const hasTitle = Boolean(form.title.trim());
    const canSubmit = hasDate && hasTitle && agendas.length > 0;

    const dateSummary = useMemo(() => {
        if (!form.startDate) return "Tanggal belum dipilih";
        if (dateMode === "range" && form.endDate) {
            return `${form.startDate} sampai ${form.endDate}`;
        }
        return form.startDate;
    }, [dateMode, form.endDate, form.startDate]);

    const updateForm = (key, value) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const selectInitiator = (value) => {
        setForm((prev) => ({
            ...prev,
            initiator: value,
            initiatorName: value === "self" ? dummyUserName : prev.initiatorName,
        }));
    };

    const showToast = (message) => {
        setToast(message);
        window.setTimeout(() => setToast(""), 2400);
    };

    const addAgenda = () => {
        setTouched((prev) => ({ ...prev, agenda: true }));
        setAgendas((prev) => [...prev, createAgenda(prev.length + 1)]);
    };

    const removeAgenda = (agendaId) => {
        setAgendas((prev) => prev.filter((item) => item.id !== agendaId));
    };

    const handleDraft = () => {
        console.log("[BusinessTrip] Simpan Draft", {
            ...form,
            dateMode,
            agendas,
        });
        showToast("Draft Business Trip tersimpan secara lokal.");
    };

    const handleSubmit = () => {
        setTouched({ date: true, title: true, agenda: true });
        if (!canSubmit) return;

        console.log("[BusinessTrip] Ajukan", {
            ...form,
            dateMode,
            agendas,
        });
        showToast("Dummy action: pengajuan siap dikirim.");
    };

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
                                    Pengajuan Business Trip
                                </h1>
                            </div>
                            <span className="hidden rounded-2xl bg-sky-500/20 p-3 text-sky-100 md:inline-flex">
                                <BriefcaseBusiness size={24} />
                            </span>
                        </div>
                        <div className="px-4 py-5 md:px-6">
                            <p className="max-w-2xl text-sm leading-6 text-slate-300">
                                Lengkapi informasi dasar perjalanan dinas,
                                inisiator, dan agenda sebelum pengajuan
                                dikirim.
                            </p>
                        </div>
                    </section>

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
                                        Semua data masih local state untuk tahap
                                        UI/UX.
                                    </p>
                                </div>
                            </div>

                            <div className="mt-5 space-y-5">
                                <div>
                                    <FieldLabel required>
                                        Tanggal Business Trip
                                    </FieldLabel>
                                    <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                                        {[
                                            ["single", "Single Date"],
                                            ["range", "Date Range"],
                                        ].map(([value, label]) => (
                                            <button
                                                key={value}
                                                type="button"
                                                onClick={() =>
                                                    setDateMode(value)
                                                }
                                                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                                                    dateMode === value
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
                                            value={form.startDate}
                                            onBlur={() =>
                                                setTouched((prev) => ({
                                                    ...prev,
                                                    date: true,
                                                }))
                                            }
                                            onChange={(event) =>
                                                updateForm(
                                                    "startDate",
                                                    event.target.value,
                                                )
                                            }
                                            className={`w-full rounded-xl border px-3 py-3 text-sm text-slate-700 outline-none focus:border-sky-400 ${
                                                touched.date && !hasDate
                                                    ? "border-red-300 bg-red-50"
                                                    : "border-slate-200 bg-white"
                                            }`}
                                        />
                                        {dateMode === "range" && (
                                            <input
                                                type="date"
                                                value={form.endDate}
                                                min={
                                                    form.startDate || undefined
                                                }
                                                onBlur={() =>
                                                    setTouched((prev) => ({
                                                        ...prev,
                                                        date: true,
                                                    }))
                                                }
                                                onChange={(event) =>
                                                    updateForm(
                                                        "endDate",
                                                        event.target.value,
                                                    )
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
                                    <FieldLabel required>
                                        Judul Business Trip
                                    </FieldLabel>
                                    <input
                                        type="text"
                                        value={form.title}
                                        onBlur={() =>
                                            setTouched((prev) => ({
                                                ...prev,
                                                title: true,
                                            }))
                                        }
                                        onChange={(event) =>
                                            updateForm(
                                                "title",
                                                event.target.value,
                                            )
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
                                                onClick={() =>
                                                    selectInitiator(value)
                                                }
                                                className={`rounded-xl px-2 py-2.5 text-xs font-semibold transition sm:text-sm ${
                                                    form.initiator === value
                                                        ? "bg-slate-950 text-white shadow-sm"
                                                        : "text-slate-500 hover:text-slate-700"
                                                }`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="mt-2 text-xs text-slate-500">
                                        Jika memilih Saya, nama inisiator
                                        otomatis memakai user dummy. Pilihan
                                        lain tetap bisa diisi manual.
                                    </p>
                                </div>

                                <label className="block">
                                    <FieldLabel>Nama Inisiator</FieldLabel>
                                    <input
                                        type="text"
                                        value={form.initiatorName}
                                        readOnly={form.initiator === "self"}
                                        onChange={(event) =>
                                            updateForm(
                                                "initiatorName",
                                                event.target.value,
                                            )
                                        }
                                        placeholder="Masukkan nama inisiator"
                                        className={`mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-400 ${
                                            form.initiator === "self"
                                                ? "bg-slate-50"
                                                : "bg-white"
                                        }`}
                                    />
                                </label>

                                <div>
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <FieldLabel required>
                                                List Agenda
                                            </FieldLabel>
                                            <p className="mt-1 text-xs text-slate-500">
                                                Minimal 1 agenda sebelum tombol
                                                Ajukan aktif.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={addAgenda}
                                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
                                        >
                                            <Plus size={16} />
                                            Tambah Agenda
                                        </button>
                                    </div>

                                    <div className="mt-3 space-y-3">
                                        {agendas.length === 0 ? (
                                            <div
                                                className={`rounded-2xl border-2 border-dashed p-6 text-center ${
                                                    touched.agenda
                                                        ? "border-red-200 bg-red-50 text-red-700"
                                                        : "border-sky-200 bg-sky-50 text-sky-700"
                                                }`}
                                            >
                                                <CalendarDays
                                                    size={30}
                                                    className="mx-auto mb-2"
                                                />
                                                <p className="text-sm font-semibold">
                                                    Belum ada agenda
                                                </p>
                                                <p className="mx-auto mt-1 max-w-md text-xs leading-5 opacity-80">
                                                    Tambahkan agenda perjalanan
                                                    seperti meeting, site visit,
                                                    atau keberangkatan.
                                                </p>
                                            </div>
                                        ) : (
                                            agendas.map((agenda, index) => (
                                                <article
                                                    key={agenda.id}
                                                    className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                                                >
                                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sm font-semibold text-sky-700">
                                                        {index + 1}
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="font-semibold text-slate-900">
                                                            {agenda.title}
                                                        </p>
                                                        <p className="mt-1 text-sm text-slate-500">
                                                            {
                                                                agenda.description
                                                            }
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            removeAgenda(
                                                                agenda.id,
                                                            )
                                                        }
                                                        className="h-9 w-9 rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600"
                                                        aria-label="Hapus agenda"
                                                    >
                                                        <Trash2
                                                            size={17}
                                                            className="mx-auto"
                                                        />
                                                    </button>
                                                </article>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </form>

                        <aside className="h-fit rounded-2xl bg-white p-4 shadow-sm md:p-5">
                            <h2 className="text-base font-semibold text-slate-900">
                                Ringkasan Pengajuan
                            </h2>
                            <div className="mt-4 space-y-3 text-sm">
                                <SummaryRow
                                    label="Tanggal"
                                    value={dateSummary}
                                />
                                <SummaryRow
                                    label="Judul"
                                    value={
                                        form.title.trim() ||
                                        "Judul belum diisi"
                                    }
                                />
                                <SummaryRow
                                    label="Inisiator"
                                    value={
                                        form.initiatorName ||
                                        "Nama belum diisi"
                                    }
                                />
                                <SummaryRow
                                    label="Agenda"
                                    value={`${agendas.length} agenda`}
                                />
                            </div>

                            <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                                <p className="text-sm font-semibold text-slate-900">
                                    Status kelengkapan
                                </p>
                                <div className="mt-3 space-y-2 text-sm">
                                    <ChecklistItem
                                        done={hasDate}
                                        label="Tanggal terisi"
                                    />
                                    <ChecklistItem
                                        done={hasTitle}
                                        label="Judul terisi"
                                    />
                                    <ChecklistItem
                                        done={agendas.length > 0}
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
                </main>
            </div>
            <MobileBottomNav />
        </div>
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
