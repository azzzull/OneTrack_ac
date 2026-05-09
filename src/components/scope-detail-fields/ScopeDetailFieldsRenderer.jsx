import { useState } from "react";
import { Camera, Upload, FileText } from "lucide-react";
import CustomSelect from "../ui/CustomSelect";
import { useAuth } from "../../context/useAuth";
import {
    uploadScopeDetailFile,
} from "../../services/scopeDetailFieldsService";

const inputClass =
    "mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-300 focus:bg-white disabled:opacity-70";

const checkboxClass =
    "h-4 w-4 rounded border-slate-300 text-sky-500 focus:ring-sky-400";

const getDisplayText = (value) => {
    if (value === null || value === undefined || value === "") return "-";
    if (typeof value === "boolean") return value ? "Ya" : "Tidak";
    if (Array.isArray(value)) return value.filter(Boolean).join(", ") || "-";
    if (typeof value === "object") {
        return String(value?.name ?? value?.label ?? value?.url ?? "-");
    }
    return String(value);
};

const getFileLabel = (value) => {
    if (!value) return "-";
    if (typeof value === "object") {
        return String(value.name ?? value.label ?? value.url ?? "-");
    }

    const raw = String(value ?? "").trim();
    if (!raw) return "-";

    try {
        const url = new URL(raw);
        const pathname = url.pathname.split("/").filter(Boolean);
        return decodeURIComponent(pathname[pathname.length - 1] ?? raw);
    } catch {
        return raw.split("/").pop() || raw;
    }
};

export default function ScopeDetailFieldsRenderer({
    fields = [],
    values = {},
    onChange,
    errors = {},
    disabled = false,
    loading = false,
    mode = "form",
    scopeCode = "",
    selectOptionsByFieldKey = {},
    supabaseClient = null,
    serialNumberActions = null,
    className = "",
}) {
    const { user } = useAuth();
    const [uploadingKey, setUploadingKey] = useState("");
    const normalizedScope = String(scopeCode ?? "").trim();

    const handleFileChange = async (field, file) => {
        if (!file) return;
        if (!supabaseClient) {
            throw new Error("Supabase client tidak tersedia.");
        }
        if (!user?.id) {
            throw new Error("User belum login.");
        }

        setUploadingKey(field.field_key);
        try {
            const uploaded = await uploadScopeDetailFile({
                supabaseClient,
                userId: user.id,
                scopeCode: normalizedScope,
                fieldKey: field.field_key,
                file,
            });

            onChange?.(field.field_key, uploaded);
        } finally {
            setUploadingKey("");
        }
    };

    const renderFieldValue = (field) => {
        const value = values?.[field.field_key];
        const fileHref =
            typeof value === "string"
                ? value
                : typeof value === "object" && value
                  ? value.url ?? ""
                  : "";
        const isFileLink = field.field_type === "file" && Boolean(fileHref);
        const baseLabel = (
            <span className="text-sm font-medium text-slate-700">
                {field.field_label}
                {field.is_required ? <span className="text-rose-500"> *</span> : null}
            </span>
        );

        if (mode === "display") {
            return (
                <div
                    key={field.field_key}
                    className="rounded-xl border border-slate-200 bg-white p-3"
                >
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        {field.field_label}
                    </p>
                    <div className="mt-1 text-sm text-slate-700">
                        {field.field_type === "checkbox"
                            ? getDisplayText(Boolean(value))
                            : field.field_type === "file"
                              ? isFileLink ? (
                                  <a
                                      href={String(fileHref)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-2 text-sky-600 hover:underline"
                                  >
                                      <FileText size={14} />
                                      {getFileLabel(value)}
                                  </a>
                              ) : (
                                  "-"
                              )
                              : getDisplayText(value)}
                    </div>
                </div>
            );
        }

        if (
            field.field_type === "text" &&
            field.field_key === "serial_number" &&
            serialNumberActions
        ) {
            return (
                <div key={field.field_key} className="block">
                    {baseLabel}
                    <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                        <input
                            value={String(value ?? "")}
                            onChange={(event) =>
                                onChange?.(field.field_key, event.target.value)
                            }
                            placeholder={field.placeholder || ""}
                            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-300 focus:bg-white disabled:opacity-70"
                            disabled={disabled || loading}
                        />
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={serialNumberActions.onScan}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={disabled || loading}
                        >
                                <Camera size={14} />
                                Scan
                            </button>
                            <button
                                type="button"
                                onClick={serialNumberActions.onClear}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={disabled || loading || !String(value ?? "").trim()}
                            >
                                <span>Hapus</span>
                            </button>
                        </div>
                    </div>
                    {String(value ?? "").trim() ? (
                        <p className="mt-2 text-xs text-slate-500">
                            Hasil saat ini: {String(value)}
                        </p>
                    ) : (
                        <p className="mt-2 text-xs text-slate-500">
                            Bisa ketik manual atau scan barcode dari kamera.
                        </p>
                    )}
                    {errors[field.field_key] ? (
                        <p className="mt-1 text-xs text-rose-500">
                            {errors[field.field_key]}
                        </p>
                    ) : null}
                </div>
            );
        }

        if (field.field_type === "select") {
            const options =
                selectOptionsByFieldKey[field.field_key] ??
                field.options?.map((item) => ({
                    value: item,
                    label: item,
                })) ??
                [];

            return (
                <label key={field.field_key} className="block">
                    {baseLabel}
                    <CustomSelect
                        value={String(value ?? "")}
                        onChange={(nextValue) =>
                            onChange?.(field.field_key, nextValue)
                        }
                        options={[
                            { value: "", label: "Pilih opsi" },
                            ...options,
                        ]}
                        placeholder={field.placeholder || "Pilih opsi"}
                        disabled={disabled || loading}
                    />
                    {errors[field.field_key] ? (
                        <p className="mt-1 text-xs text-rose-500">
                            {errors[field.field_key]}
                        </p>
                    ) : null}
                </label>
            );
        }

        if (field.field_type === "textarea") {
            return (
                <label key={field.field_key} className="block md:col-span-2">
                    {baseLabel}
                    <textarea
                        value={String(value ?? "")}
                        onChange={(event) =>
                            onChange?.(field.field_key, event.target.value)
                        }
                        placeholder={field.placeholder || ""}
                        className={`${inputClass} min-h-24`}
                        disabled={disabled || loading}
                    />
                    {errors[field.field_key] ? (
                        <p className="mt-1 text-xs text-rose-500">
                            {errors[field.field_key]}
                        </p>
                    ) : null}
                </label>
            );
        }

        if (field.field_type === "number") {
            return (
                <label key={field.field_key} className="block">
                    {baseLabel}
                    <input
                        type="number"
                        value={value ?? ""}
                        onChange={(event) =>
                            onChange?.(field.field_key, event.target.value)
                        }
                        placeholder={field.placeholder || ""}
                        className={inputClass}
                        disabled={disabled || loading}
                    />
                    {errors[field.field_key] ? (
                        <p className="mt-1 text-xs text-rose-500">
                            {errors[field.field_key]}
                        </p>
                    ) : null}
                </label>
            );
        }

        if (field.field_type === "date") {
            return (
                <label key={field.field_key} className="block">
                    {baseLabel}
                    <input
                        type="date"
                        value={String(value ?? "")}
                        onChange={(event) =>
                            onChange?.(field.field_key, event.target.value)
                        }
                        className={inputClass}
                        disabled={disabled || loading}
                    />
                    {errors[field.field_key] ? (
                        <p className="mt-1 text-xs text-rose-500">
                            {errors[field.field_key]}
                        </p>
                    ) : null}
                </label>
            );
        }

        if (field.field_type === "checkbox") {
            return (
                <label
                    key={field.field_key}
                    className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                >
                    <input
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={(event) =>
                            onChange?.(field.field_key, event.target.checked)
                        }
                        className={checkboxClass}
                        disabled={disabled || loading}
                    />
                    <span className="text-sm text-slate-700">
                        {field.field_label}
                    </span>
                </label>
            );
        }

        if (field.field_type === "file") {
            return (
                <div key={field.field_key} className="block">
                    {baseLabel}
                    <div className="mt-1 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
                        {value?.error ? (
                            <div className="space-y-3">
                                <p className="text-sm font-medium text-rose-600">
                                    {String(value.error)}
                                </p>
                                <input
                                    type="file"
                                    className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-500 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-sky-600"
                                    onChange={async (event) => {
                                        const file = event.target.files?.[0] ?? null;
                                        event.target.value = "";
                                        if (!file) return;
                                        try {
                                            await handleFileChange(field, file);
                                        } catch (error) {
                                            console.error("File upload failed:", error);
                                            onChange?.(field.field_key, {
                                                error:
                                                    error?.message ??
                                                    "Upload gagal",
                                            });
                                        }
                                    }}
                                    disabled={disabled || loading || Boolean(uploadingKey)}
                                />
                            </div>
                        ) : value ? (
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-slate-700">
                                        {getFileLabel(value)}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        {typeof value === "object"
                                            ? String(value.url ?? "")
                                            : String(value ?? "")}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onChange?.(field.field_key, null)}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                    disabled={disabled || loading}
                                >
                                    Hapus
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 text-sm text-slate-600">
                                    <Upload size={14} />
                                    <span>Unggah file untuk field ini.</span>
                                </div>
                                <input
                                    type="file"
                                    className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-500 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-sky-600"
                                    onChange={async (event) => {
                                        const file = event.target.files?.[0] ?? null;
                                        event.target.value = "";
                                        if (!file) return;
                                        try {
                                            await handleFileChange(field, file);
                                        } catch (error) {
                                            console.error("File upload failed:", error);
                                            onChange?.(
                                                field.field_key,
                                                {
                                                    error: error?.message ??
                                                        "Upload gagal",
                                                },
                                            );
                                        }
                                    }}
                                    disabled={disabled || loading || Boolean(uploadingKey)}
                                />
                                {uploadingKey === field.field_key ? (
                                    <p className="text-xs text-slate-500">
                                        Sedang mengunggah file...
                                    </p>
                                ) : null}
                            </div>
                        )}
                    </div>
                    {errors[field.field_key] ? (
                        <p className="mt-1 text-xs text-rose-500">
                            {errors[field.field_key]}
                        </p>
                    ) : null}
                </div>
            );
        }

        return (
            <label key={field.field_key} className="block">
                {baseLabel}
                <input
                    value={String(value ?? "")}
                    onChange={(event) =>
                        onChange?.(field.field_key, event.target.value)
                    }
                    placeholder={field.placeholder || ""}
                    className={inputClass}
                    disabled={disabled || loading}
                />
                {errors[field.field_key] ? (
                    <p className="mt-1 text-xs text-rose-500">
                        {errors[field.field_key]}
                    </p>
                ) : null}
            </label>
        );
    };

    if (loading) {
        return (
            <div className={className}>
                <p className="text-sm text-slate-500">
                    Memuat konfigurasi field...
                </p>
            </div>
        );
    }

    if (!fields.length) {
        return (
            <div className={className}>
                <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                    Belum ada konfigurasi field untuk scope ini.
                </p>
            </div>
        );
    }

    return (
        <div className={className}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {fields.map((field) => renderFieldValue(field))}
            </div>
        </div>
    );
}
