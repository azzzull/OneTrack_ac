import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pencil, Plus, Save, Settings2, Trash2, X } from "lucide-react";
import { useDialog } from "../../context/useDialog";
import useScopeDetailFields from "../../hooks/useScopeDetailFields";
import {
    createScopeDetailChecklistItem,
    createScopeDetailField,
    deleteScopeDetailChecklistItem,
    deleteScopeDetailField,
    invalidateScopeDetailConfigCache,
    normalizeScopeDetailFieldType,
    slugifyFieldKey,
    updateScopeDetailChecklistItem,
    updateScopeDetailField,
} from "../../services/scopeDetailFieldsService";

const inputClass =
    "mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-300 focus:bg-white";

const initialFieldForm = {
    field_label: "",
    field_key: "",
    field_type: "text",
    placeholder: "",
    is_required: false,
    options_text: "",
    sort_order: 0,
};

const initialChecklistForm = {
    item_label: "",
    sort_order: 0,
};

const typeOptions = [
    { value: "text", label: "Text" },
    { value: "textarea", label: "Textarea" },
    { value: "number", label: "Number" },
    { value: "date", label: "Date" },
    { value: "select", label: "Select" },
    { value: "checkbox", label: "Checkbox" },
    { value: "file", label: "File" },
];

const parseOptionsText = (value) =>
    String(value ?? "")
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);

const stringifyOptions = (value) => (value ?? []).join("\n");

export default function ScopeDetailFieldsManagerModal({
    isOpen,
    scope,
    onClose,
}) {
    const { alert: showAlert, confirm } = useDialog();
    const { fields, checklist, loading, error, reload } =
        useScopeDetailFields(scope?.code);
    const [activeTab, setActiveTab] = useState("fields");
    const [editingFieldId, setEditingFieldId] = useState(null);
    const [editingChecklistId, setEditingChecklistId] = useState(null);
    const [autoGenerateKey, setAutoGenerateKey] = useState(true);
    const [saving, setSaving] = useState(false);
    const [fieldForm, setFieldForm] = useState(initialFieldForm);
    const [checklistForm, setChecklistForm] = useState(initialChecklistForm);

    const sortedFields = useMemo(
        () =>
            [...fields].sort((a, b) => {
                if (a.sort_order !== b.sort_order) {
                    return a.sort_order - b.sort_order;
                }
                return String(a.field_label).localeCompare(String(b.field_label));
            }),
        [fields],
    );

    const sortedChecklist = useMemo(
        () =>
            [...checklist].sort((a, b) => {
                if (a.sort_order !== b.sort_order) {
                    return a.sort_order - b.sort_order;
                }
                return String(a.item_label).localeCompare(String(b.item_label));
            }),
        [checklist],
    );

    useEffect(() => {
        if (!isOpen) {
            setActiveTab("fields");
            setEditingFieldId(null);
            setEditingChecklistId(null);
            setAutoGenerateKey(true);
            setFieldForm(initialFieldForm);
            setChecklistForm(initialChecklistForm);
            return;
        }

        const nextFieldOrder =
            (sortedFields[sortedFields.length - 1]?.sort_order ?? -1) + 1;
        const nextChecklistOrder =
            (sortedChecklist[sortedChecklist.length - 1]?.sort_order ?? -1) + 1;
        setFieldForm({
            ...initialFieldForm,
            sort_order: nextFieldOrder,
        });
        setChecklistForm({
            ...initialChecklistForm,
            sort_order: nextChecklistOrder,
        });
    }, [isOpen, sortedFields, sortedChecklist]);

    if (!isOpen || !scope) return null;

    const openFieldEditor = (field = null) => {
        setActiveTab("fields");
        if (!field) {
            const nextOrder =
                (sortedFields[sortedFields.length - 1]?.sort_order ?? -1) + 1;
            setEditingFieldId(null);
            setAutoGenerateKey(true);
            setFieldForm({
                ...initialFieldForm,
                sort_order: nextOrder,
            });
            return;
        }

        setEditingFieldId(field.id);
        setAutoGenerateKey(false);
        setFieldForm({
            field_label: field.field_label ?? "",
            field_key: field.field_key ?? "",
            field_type: normalizeScopeDetailFieldType(field.field_type),
            placeholder: field.placeholder ?? "",
            is_required: Boolean(field.is_required),
            options_text: stringifyOptions(field.options),
            sort_order: Number(field.sort_order ?? 0),
        });
    };

    const openChecklistEditor = (item = null) => {
        setActiveTab("checklist");
        if (!item) {
            const nextOrder =
                (sortedChecklist[sortedChecklist.length - 1]?.sort_order ??
                    -1) + 1;
            setEditingChecklistId(null);
            setChecklistForm({
                ...initialChecklistForm,
                sort_order: nextOrder,
            });
            return;
        }

        setEditingChecklistId(item.id);
        setChecklistForm({
            item_label: item.item_label ?? "",
            sort_order: Number(item.sort_order ?? 0),
        });
    };

    const validateFieldForm = () => {
        const label = String(fieldForm.field_label ?? "").trim();
        const key = slugifyFieldKey(fieldForm.field_key || label);

        if (!label) return "Field label wajib diisi.";
        if (!key) return "Field key wajib diisi.";
        if (!fieldForm.field_type) return "Field type wajib dipilih.";
        if (
            sortedFields.some(
                (item) =>
                    item.field_key === key &&
                    String(item.id) !== String(editingFieldId ?? ""),
            )
        ) {
            return "Field key harus unik dalam scope ini.";
        }
        return "";
    };

    const validateChecklistForm = () => {
        const label = String(checklistForm.item_label ?? "").trim();
        if (!label) return "Checklist wajib diisi.";
        if (
            sortedChecklist.some(
                (item) =>
                    String(item.item_label).toLowerCase() ===
                        label.toLowerCase() &&
                    String(item.id) !== String(editingChecklistId ?? ""),
            )
        ) {
            return "Checklist tidak boleh duplicate dalam scope ini.";
        }
        return "";
    };

    const handleFieldSave = async () => {
        const validationMessage = validateFieldForm();
        if (validationMessage) {
            await showAlert(validationMessage, { title: "Validasi Field" });
            return;
        }

        setSaving(true);
        try {
            const payload = {
                field_label: String(fieldForm.field_label ?? "").trim(),
                field_key: slugifyFieldKey(
                    fieldForm.field_key || fieldForm.field_label,
                ),
                field_type: fieldForm.field_type,
                placeholder: String(fieldForm.placeholder ?? "").trim(),
                is_required: Boolean(fieldForm.is_required),
                options:
                    fieldForm.field_type === "select"
                        ? parseOptionsText(fieldForm.options_text)
                        : [],
                sort_order: Number(fieldForm.sort_order ?? 0),
            };

            if (editingFieldId) {
                await updateScopeDetailField(editingFieldId, payload);
            } else {
                await createScopeDetailField(scope.id, payload);
            }

            invalidateScopeDetailConfigCache(scope.code);
            await reload();
            await showAlert("Field berhasil disimpan.", { title: "Sukses" });
            openFieldEditor(null);
        } catch (err) {
            console.error("Failed to save scope detail field:", err);
            await showAlert(
                err?.message ?? "Gagal menyimpan konfigurasi field.",
                { title: "Gagal" },
            );
        } finally {
            setSaving(false);
        }
    };

    const handleFieldDelete = async (field) => {
        const confirmed = await confirm(
            `Hapus field "${field.field_label}" dari scope ini?`,
            { title: "Hapus Field", danger: true },
        );
        if (!confirmed) return;

        setSaving(true);
        try {
            await deleteScopeDetailField(field.id);
            invalidateScopeDetailConfigCache(scope.code);
            await reload();
            if (String(editingFieldId) === String(field.id)) {
                openFieldEditor(null);
            }
        } catch (err) {
            console.error("Failed to delete scope detail field:", err);
            await showAlert(err?.message ?? "Gagal menghapus field.", {
                title: "Gagal",
            });
        } finally {
            setSaving(false);
        }
    };

    const handleChecklistSave = async () => {
        const validationMessage = validateChecklistForm();
        if (validationMessage) {
            await showAlert(validationMessage, {
                title: "Validasi Checklist",
            });
            return;
        }

        setSaving(true);
        try {
            const payload = {
                item_label: String(checklistForm.item_label ?? "").trim(),
                sort_order: Number(checklistForm.sort_order ?? 0),
            };

            if (editingChecklistId) {
                await updateScopeDetailChecklistItem(editingChecklistId, payload);
            } else {
                await createScopeDetailChecklistItem(scope.id, payload);
            }

            invalidateScopeDetailConfigCache(scope.code);
            await reload();
            await showAlert("Checklist berhasil disimpan.", {
                title: "Sukses",
            });
            openChecklistEditor(null);
        } catch (err) {
            console.error("Failed to save checklist item:", err);
            await showAlert(err?.message ?? "Gagal menyimpan checklist.", {
                title: "Gagal",
            });
        } finally {
            setSaving(false);
        }
    };

    const handleChecklistDelete = async (item) => {
        const confirmed = await confirm(
            `Hapus checklist "${item.item_label}" dari scope ini?`,
            { title: "Hapus Checklist", danger: true },
        );
        if (!confirmed) return;

        setSaving(true);
        try {
            await deleteScopeDetailChecklistItem(item.id);
            invalidateScopeDetailConfigCache(scope.code);
            await reload();
            if (String(editingChecklistId) === String(item.id)) {
                openChecklistEditor(null);
            }
        } catch (err) {
            console.error("Failed to delete checklist item:", err);
            await showAlert(err?.message ?? "Gagal menghapus checklist.", {
                title: "Gagal",
            });
        } finally {
            setSaving(false);
        }
    };

    const renderLeftList = () => {
        const isFields = activeTab === "fields";
        const currentList = isFields ? sortedFields : sortedChecklist;

        return (
            <div className="border-b border-slate-200 p-5 md:border-b-0 md:border-r">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-sm font-semibold text-slate-800">
                            {isFields ? "Field List" : "Checklist List"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                            {isFields
                                ? "Urutkan field dengan `sort_order`."
                                : "Urutkan checklist dengan `sort_order`."}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setActiveTab("fields")}
                            className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                                isFields
                                    ? "bg-sky-500 text-white"
                                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                        >
                            Fields
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab("checklist")}
                            className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                                !isFields
                                    ? "bg-sky-500 text-white"
                                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                        >
                            Checklist
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                isFields
                                    ? openFieldEditor(null)
                                    : openChecklistEditor(null)
                            }
                            className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
                        >
                            <Plus size={14} />
                            {isFields ? "Tambah Field" : "Tambah Item"}
                        </button>
                    </div>
                </div>

                <div className="mt-4 space-y-3">
                    {loading ? (
                        <p className="text-sm text-slate-500">Memuat data...</p>
                    ) : error ? (
                        <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                            Gagal memuat data.
                        </p>
                    ) : currentList.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
                            {isFields
                                ? "Belum ada field untuk scope ini."
                                : "Belum ada checklist untuk scope ini."}
                        </div>
                    ) : (
                        currentList.map((item) => (
                            <div
                                key={item.id}
                                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        {isFields ? (
                                            <>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="truncate text-sm font-semibold text-slate-800">
                                                        {item.field_label}
                                                    </p>
                                                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                                        {item.field_type}
                                                    </span>
                                                    {item.is_required ? (
                                                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                                                            Required
                                                        </span>
                                                    ) : null}
                                                </div>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    Key: {item.field_key} - Sort:{" "}
                                                    {item.sort_order}
                                                </p>
                                                {item.placeholder ? (
                                                    <p className="mt-1 text-xs text-slate-500">
                                                        Placeholder:{" "}
                                                        {item.placeholder}
                                                    </p>
                                                ) : null}
                                            </>
                                        ) : (
                                            <>
                                                <p className="truncate text-sm font-semibold text-slate-800">
                                                    {item.item_label}
                                                </p>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    Sort: {item.sort_order}
                                                </p>
                                            </>
                                        )}
                                    </div>

                                    <div className="flex shrink-0 items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                isFields
                                                    ? openFieldEditor(item)
                                                    : openChecklistEditor(item)
                                            }
                                            className="rounded-lg p-2 text-slate-500 hover:bg-white"
                                            title="Edit"
                                        >
                                            <Pencil size={14} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                isFields
                                                    ? handleFieldDelete(item)
                                                    : handleChecklistDelete(item)
                                            }
                                            className="rounded-lg p-2 text-rose-500 hover:bg-white"
                                            title="Hapus"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    };

    const renderRightForm = () => {
        if (activeTab === "fields") {
            const canEditSelectOptions = fieldForm.field_type === "select";
            return (
                <div className="p-5">
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => openFieldEditor(null)}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            <ArrowLeft size={14} />
                            Form Baru
                        </button>
                        {editingFieldId ? (
                            <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                                Mode Edit
                            </span>
                        ) : (
                            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                                Mode Tambah
                            </span>
                        )}
                    </div>

                    <div className="mt-4 space-y-4">
                        <label className="block">
                            <span className="text-sm font-medium text-slate-700">
                                Field Label
                            </span>
                            <input
                                value={fieldForm.field_label}
                                onChange={(event) => {
                                    const nextLabel = event.target.value;
                                    setFieldForm((prev) => {
                                        const nextKey = autoGenerateKey
                                            ? slugifyFieldKey(nextLabel)
                                            : prev.field_key;
                                        return {
                                            ...prev,
                                            field_label: nextLabel,
                                            field_key: nextKey,
                                        };
                                    });
                                }}
                                onBlur={() => {
                                    if (autoGenerateKey) {
                                        setFieldForm((prev) => ({
                                            ...prev,
                                            field_key: slugifyFieldKey(
                                                prev.field_label,
                                            ),
                                        }));
                                    }
                                }}
                                className={inputClass}
                                placeholder="Contoh: Nama Customer"
                            />
                        </label>

                        <label className="block">
                            <span className="text-sm font-medium text-slate-700">
                                Field Key
                            </span>
                            <input
                                value={fieldForm.field_key}
                                onChange={(event) => {
                                    setAutoGenerateKey(false);
                                    setFieldForm((prev) => ({
                                        ...prev,
                                        field_key: slugifyFieldKey(
                                            event.target.value,
                                        ),
                                    }));
                                }}
                                className={inputClass}
                                placeholder="nama_customer"
                            />
                            <p className="mt-1 text-xs text-slate-500">
                                Key harus unik per scope.
                            </p>
                        </label>

                        <label className="block">
                            <span className="text-sm font-medium text-slate-700">
                                Field Type
                            </span>
                            <select
                                value={fieldForm.field_type}
                                onChange={(event) =>
                                    setFieldForm((prev) => ({
                                        ...prev,
                                        field_type: normalizeScopeDetailFieldType(
                                            event.target.value,
                                        ),
                                    }))
                                }
                                className={inputClass}
                            >
                                {typeOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="block">
                            <span className="text-sm font-medium text-slate-700">
                                Placeholder
                            </span>
                            <input
                                value={fieldForm.placeholder}
                                onChange={(event) =>
                                    setFieldForm((prev) => ({
                                        ...prev,
                                        placeholder: event.target.value,
                                    }))
                                }
                                className={inputClass}
                                placeholder="Contoh: PT ABC"
                            />
                        </label>

                        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                            <input
                                type="checkbox"
                                checked={fieldForm.is_required}
                                onChange={(event) =>
                                    setFieldForm((prev) => ({
                                        ...prev,
                                        is_required: event.target.checked,
                                    }))
                                }
                                className="h-4 w-4 rounded border-slate-300 text-sky-500 focus:ring-sky-400"
                            />
                            <span className="text-sm font-medium text-slate-700">
                                Required
                            </span>
                        </label>

                        {canEditSelectOptions ? (
                            <label className="block">
                                <span className="text-sm font-medium text-slate-700">
                                    Select Options
                                </span>
                                <textarea
                                    value={fieldForm.options_text}
                                    onChange={(event) =>
                                        setFieldForm((prev) => ({
                                            ...prev,
                                            options_text: event.target.value,
                                        }))
                                    }
                                    className={`${inputClass} min-h-28`}
                                    placeholder={"Pending\nApproved\nRejected"}
                                />
                                <p className="mt-1 text-xs text-slate-500">
                                    Opsional. Satu opsi per baris jika ingin mengisi
                                    opsi manual.
                                </p>
                            </label>
                        ) : null}

                        <label className="block">
                            <span className="text-sm font-medium text-slate-700">
                                Sort Order
                            </span>
                            <input
                                type="number"
                                value={fieldForm.sort_order}
                                onChange={(event) =>
                                    setFieldForm((prev) => ({
                                        ...prev,
                                        sort_order: event.target.value,
                                    }))
                                }
                                className={inputClass}
                                min={0}
                            />
                        </label>

                        <div className="flex items-center gap-2 pt-2">
                            <button
                                type="button"
                                onClick={handleFieldSave}
                                disabled={saving}
                                className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-70"
                            >
                                <Save size={14} />
                                {saving ? "Menyimpan..." : "Simpan"}
                            </button>
                            <button
                                type="button"
                                onClick={() => openFieldEditor(null)}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            >
                                Reset
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="p-5">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => openChecklistEditor(null)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                        <ArrowLeft size={14} />
                        Item Baru
                    </button>
                    {editingChecklistId ? (
                        <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                            Mode Edit
                        </span>
                    ) : (
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                            Mode Tambah
                        </span>
                    )}
                </div>

                <div className="mt-4 space-y-4">
                    <label className="block">
                        <span className="text-sm font-medium text-slate-700">
                            Checklist Item
                        </span>
                        <input
                            value={checklistForm.item_label}
                            onChange={(event) =>
                                setChecklistForm((prev) => ({
                                    ...prev,
                                    item_label: event.target.value,
                                }))
                            }
                            className={inputClass}
                            placeholder="Contoh: Pengecekan controller dan inverter"
                        />
                    </label>

                    <label className="block">
                        <span className="text-sm font-medium text-slate-700">
                            Sort Order
                        </span>
                        <input
                            type="number"
                            value={checklistForm.sort_order}
                            onChange={(event) =>
                                setChecklistForm((prev) => ({
                                    ...prev,
                                    sort_order: event.target.value,
                                }))
                            }
                            className={inputClass}
                            min={0}
                        />
                    </label>

                    <div className="flex items-center gap-2 pt-2">
                        <button
                            type="button"
                            onClick={handleChecklistSave}
                            disabled={saving}
                            className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-70"
                        >
                            <Save size={14} />
                            {saving ? "Menyimpan..." : "Simpan"}
                        </button>
                        <button
                            type="button"
                            onClick={() => openChecklistEditor(null)}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            Reset
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 p-4">
            <div className="flex min-h-full items-start justify-center py-6 md:items-center md:py-0">
                <div className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                    <div>
                        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <Settings2 size={14} />
                            Manage Detail Fields
                        </p>
                        <h2 className="mt-1 text-lg font-semibold text-slate-900">
                            {scope.label ?? scope.code ?? "Scope"}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="grid max-h-[80vh] grid-cols-1 gap-0 overflow-auto md:grid-cols-[1.2fr_0.8fr]">
                    {renderLeftList()}
                    {renderRightForm()}
                </div>
                </div>
            </div>
        </div>
    );
}
