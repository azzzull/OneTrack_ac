import { useCallback, useEffect, useState } from "react";
import {
    AlertTriangle,
    ArrowLeft,
    LoaderCircle,
    Save,
    ShieldCheck,
    ShieldOff,
} from "lucide-react";
import { Link } from "react-router-dom";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import {
    getAccommodationSubmissionBlockSetting,
    saveAccommodationSubmissionBlockSetting,
} from "../../services/accommodationSubmissionSettings";

const formatUpdatedAt = (value) => {
    if (!value) return "Belum pernah diubah";

    return new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
};

export default function AccommodationSubmissionSettings() {
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const [enabled, setEnabled] = useState(true);
    const [note, setNote] = useState("");
    const [updatedAt, setUpdatedAt] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");

    const loadSetting = useCallback(async () => {
        setLoading(true);
        try {
            const setting = await getAccommodationSubmissionBlockSetting();
            setEnabled(setting.enabled);
            setNote(setting.note);
            setUpdatedAt(setting.updatedAt);
        } catch (error) {
            setMessage(
                error?.message || "Pengaturan pembatasan gagal dimuat.",
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSetting();
    }, [loadSetting]);

    const persistSetting = async ({ nextEnabled = enabled, successMessage }) => {
        setSaving(true);
        setMessage("");
        try {
            const setting = await saveAccommodationSubmissionBlockSetting({
                enabled: nextEnabled,
                note,
            });
            setEnabled(setting.enabled);
            setNote(setting.note);
            setUpdatedAt(setting.updatedAt);
            setMessage(
                successMessage ||
                    (setting.enabled
                    ? "Pembatasan pengajuan akomodasi telah diaktifkan."
                    : "Pembatasan pengajuan akomodasi sementara dinonaktifkan."),
            );
        } catch (error) {
            setMessage(
                error?.message || "Pengaturan pembatasan gagal disimpan.",
            );
        } finally {
            setSaving(false);
        }
    };

    const saveSetting = () =>
        persistSetting({
            successMessage: "Catatan pengaturan telah disimpan.",
        });

    const toggleSetting = () =>
        persistSetting({
            nextEnabled: !enabled,
        });

    return (
        <div className="min-h-screen bg-sky-50">
            <div className="flex min-h-screen">
                <Sidebar
                    collapsed={sidebarCollapsed}
                    onToggle={toggleSidebar}
                />

                <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8">
                    <Link
                        to="/admin/accommodation"
                        className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700 no-underline hover:text-sky-800 hover:underline"
                    >
                        <ArrowLeft size={16} />
                        Kembali ke Akomodasi
                    </Link>

                    <div className="mt-4 max-w-3xl">
                        <div className="flex items-start gap-3">
                            <span className="rounded-2xl bg-sky-100 p-3 text-sky-700">
                                <ShieldCheck size={24} />
                            </span>
                            <div>
                                <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">
                                    Aturan Pengajuan Akomodasi
                                </h1>
                                <p className="mt-1 leading-6 text-slate-600">
                                    Kelola sementara pembatasan pengajuan baru
                                    ketika masih ada akomodasi sebelumnya yang
                                    belum selesai.
                                </p>
                            </div>
                        </div>

                        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            {loading ? (
                                <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-slate-500">
                                    <LoaderCircle className="animate-spin" size={18} />
                                    Memuat pengaturan…
                                </div>
                            ) : (
                                <>
                                    <div
                                        className={`rounded-xl border p-4 ${
                                            enabled
                                                ? "border-emerald-200 bg-emerald-50"
                                                : "border-amber-200 bg-amber-50"
                                        }`}
                                    >
                                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex gap-3">
                                                <span
                                                    className={`mt-0.5 rounded-lg p-2 ${
                                                        enabled
                                                            ? "bg-white text-emerald-700"
                                                            : "bg-white text-amber-700"
                                                    }`}
                                                >
                                                    {enabled ? (
                                                        <ShieldCheck size={19} />
                                                    ) : (
                                                        <ShieldOff size={19} />
                                                    )}
                                                </span>
                                                <div>
                                                    <h2 className="font-semibold text-slate-900">
                                                        {enabled
                                                            ? "Pembatasan aktif"
                                                            : "Pembatasan sementara nonaktif"}
                                                    </h2>
                                                    <p className="mt-1 text-sm leading-5 text-slate-600">
                                                        {enabled
                                                            ? "Pengajuan baru tetap ditahan bila akomodasi sebelumnya belum direalisasikan atau diselesaikan."
                                                            : "Pengajuan akomodasi dan Business Trip baru dapat dikirim meskipun masih ada akomodasi sebelumnya yang belum selesai."}
                                                    </p>
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={enabled}
                                                disabled={saving}
                                                onClick={toggleSetting}
                                                className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                                    enabled
                                                        ? "bg-emerald-600"
                                                        : "bg-slate-400"
                                                }`}
                                            >
                                                <span
                                                    className={`inline-block h-6 w-6 rounded-full bg-white shadow transition ${
                                                        enabled
                                                            ? "translate-x-7"
                                                            : "translate-x-1"
                                                    }`}
                                                />
                                                <span className="sr-only">
                                                    {enabled
                                                        ? "Nonaktifkan pembatasan"
                                                        : "Aktifkan pembatasan"}
                                                </span>
                                            </button>
                                        </div>
                                    </div>

                                    <label className="mt-5 block">
                                        <span className="text-sm font-semibold text-slate-800">
                                            Catatan perubahan
                                        </span>
                                        <span className="mt-1 block text-xs leading-5 text-slate-500">
                                            Opsional. Contoh: “Pemutihan data
                                            akomodasi sampai 31 Oktober.”
                                        </span>
                                        <textarea
                                            value={note}
                                            onChange={(event) =>
                                                setNote(event.target.value)
                                            }
                                            rows={3}
                                            placeholder="Jelaskan alasan mengubah aturan ini"
                                            className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                                        />
                                    </label>

                                    <div className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-500">
                                        <AlertTriangle
                                            size={15}
                                            className="mt-0.5 shrink-0 text-amber-600"
                                        />
                                        <p>
                                            Toggle langsung menyimpan perubahan.
                                            Saat pembatasan nonaktif, pengajuan
                                            baru tetap dapat masuk meskipun ada
                                            saldo akomodasi terdahulu yang belum
                                            selesai. Aktifkan kembali setelah
                                            data selesai dirapikan.
                                        </p>
                                    </div>

                                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                                        <p className="text-xs text-slate-500">
                                            Terakhir diperbarui: {formatUpdatedAt(updatedAt)}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={saveSetting}
                                            disabled={saving}
                                            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {saving ? (
                                                <LoaderCircle
                                                    className="animate-spin"
                                                    size={16}
                                                />
                                            ) : (
                                                <Save size={16} />
                                            )}
                                            Simpan Catatan
                                        </button>
                                    </div>
                                </>
                            )}
                        </section>

                        {message && (
                            <p className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                                {message}
                            </p>
                        )}
                    </div>
                </main>
            </div>
            <MobileBottomNav />
        </div>
    );
}
