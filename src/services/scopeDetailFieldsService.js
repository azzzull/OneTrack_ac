import supabase from "../supabaseClient";
import { normalizeJobScopeCode } from "../utils/jobScopeCatalog";

const FIELD_TYPE_OPTIONS = [
    "text",
    "textarea",
    "number",
    "date",
    "select",
    "checkbox",
    "file",
];

const scopeConfigCache = new Map();

export const normalizeScopeDetailFieldType = (value) => {
    const raw = String(value ?? "").trim().toLowerCase();
    return FIELD_TYPE_OPTIONS.includes(raw) ? raw : "text";
};

export const slugifyFieldKey = (value) =>
    String(value ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_{2,}/g, "_");

export const parseScopeDetailFieldOptions = (value) => {
    if (Array.isArray(value)) {
        return value
            .map((item) => String(item ?? "").trim())
            .filter(Boolean);
    }

    if (typeof value === "string") {
        const raw = value.trim();
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parseScopeDetailFieldOptions(parsed);
            }
        } catch {
            // fall through to line split
        }
        return raw
            .split(/\r?\n|,/)
            .map((item) => item.trim())
            .filter(Boolean);
    }

    if (value && typeof value === "object") {
        return Object.values(value)
            .map((item) => String(item ?? "").trim())
            .filter(Boolean);
    }

    return [];
};

export const serializeScopeDetailFieldOptions = (value) => {
    const options = parseScopeDetailFieldOptions(value);
    return options.length ? options : null;
};

export const normalizeScopeDetailField = (row) => {
    if (!row) return null;

    return {
        id: row.id,
        scope_id: row.scope_id,
        field_key: String(row.field_key ?? "").trim(),
        field_label: String(row.field_label ?? "").trim(),
        field_type: normalizeScopeDetailFieldType(row.field_type),
        placeholder: String(row.placeholder ?? "").trim(),
        is_required: Boolean(row.is_required),
        options: parseScopeDetailFieldOptions(row.options),
        sort_order:
            Number.isFinite(Number(row.sort_order)) &&
            Number(row.sort_order) >= 0
                ? Number(row.sort_order)
                : 0,
        created_at: row.created_at ?? null,
        updated_at: row.updated_at ?? null,
    };
};

export const normalizeScopeDetailFields = (rows = []) =>
    rows.map(normalizeScopeDetailField).filter(Boolean);

export const normalizeScopeDetailChecklistItem = (row) => {
    if (!row) return null;
    return {
        id: row.id,
        scope_id: row.scope_id,
        item_label: String(row.item_label ?? "").trim(),
        sort_order:
            Number.isFinite(Number(row.sort_order)) &&
            Number(row.sort_order) >= 0
                ? Number(row.sort_order)
                : 0,
        created_at: row.created_at ?? null,
        updated_at: row.updated_at ?? null,
    };
};

export const normalizeScopeDetailChecklistItems = (rows = []) =>
    rows.map(normalizeScopeDetailChecklistItem).filter(Boolean);

export const getScopeDetailConfig = async (scopeCode) => {
    const normalizedScope = normalizeJobScopeCode(scopeCode);
    if (!normalizedScope) {
        return { scope: null, fields: [] };
    }

    const cached = scopeConfigCache.get(normalizedScope);
    if (cached) return cached;

    const { data: scopeRow, error: scopeError } = await supabase
        .from("master_job_scopes")
        .select("id, code, label")
        .eq("code", normalizedScope)
        .maybeSingle();

    if (scopeError) throw scopeError;
    if (!scopeRow) {
        const fallback = { scope: null, fields: [] };
        scopeConfigCache.set(normalizedScope, fallback);
        return fallback;
    }

    const { data: fieldRows, error: fieldError } = await supabase
        .from("scope_detail_fields")
        .select("*")
        .eq("scope_id", scopeRow.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

    if (fieldError) throw fieldError;

    const { data: checklistRows, error: checklistError } = await supabase
        .from("scope_detail_checklist_items")
        .select("*")
        .eq("scope_id", scopeRow.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

    if (checklistError) throw checklistError;

    const result = {
        scope: scopeRow,
        fields: normalizeScopeDetailFields(fieldRows ?? []),
        checklist: normalizeScopeDetailChecklistItems(checklistRows ?? []),
    };
    scopeConfigCache.set(normalizedScope, result);
    return result;
};

export const getScopeDetailFields = async (scopeCode) => {
    const result = await getScopeDetailConfig(scopeCode);
    return result.fields;
};

export const getScopeDetailChecklist = async (scopeCode) => {
    const result = await getScopeDetailConfig(scopeCode);
    return result.checklist ?? [];
};

export const invalidateScopeDetailConfigCache = (scopeCode = null) => {
    if (!scopeCode) {
        scopeConfigCache.clear();
        return;
    }

    scopeConfigCache.delete(normalizeJobScopeCode(scopeCode));
};

export const createScopeDetailChecklistItem = async (scopeId, payload) => {
    const insertPayload = {
        scope_id: scopeId,
        item_label: String(payload.item_label ?? "").trim(),
        sort_order:
            Number.isFinite(Number(payload.sort_order)) &&
            Number(payload.sort_order) >= 0
                ? Number(payload.sort_order)
                : 0,
    };

    const { data, error } = await supabase
        .from("scope_detail_checklist_items")
        .insert(insertPayload)
        .select("*")
        .single();

    if (error) throw error;
    return normalizeScopeDetailChecklistItem(data);
};

export const updateScopeDetailChecklistItem = async (itemId, payload) => {
    const updatePayload = {
        item_label: String(payload.item_label ?? "").trim(),
        sort_order:
            Number.isFinite(Number(payload.sort_order)) &&
            Number(payload.sort_order) >= 0
                ? Number(payload.sort_order)
                : 0,
    };

    const { data, error } = await supabase
        .from("scope_detail_checklist_items")
        .update(updatePayload)
        .eq("id", itemId)
        .select("*")
        .single();

    if (error) throw error;
    return normalizeScopeDetailChecklistItem(data);
};

export const deleteScopeDetailChecklistItem = async (itemId) => {
    const { error } = await supabase
        .from("scope_detail_checklist_items")
        .delete()
        .eq("id", itemId);

    if (error) throw error;
    return true;
};

export const createScopeDetailField = async (scopeId, payload) => {
    const insertPayload = {
        scope_id: scopeId,
        field_key: slugifyFieldKey(payload.field_key ?? payload.field_label ?? ""),
        field_label: String(payload.field_label ?? "").trim(),
        field_type: normalizeScopeDetailFieldType(payload.field_type),
        placeholder: String(payload.placeholder ?? "").trim() || null,
        is_required: Boolean(payload.is_required),
        options: serializeScopeDetailFieldOptions(payload.options),
        sort_order:
            Number.isFinite(Number(payload.sort_order)) &&
            Number(payload.sort_order) >= 0
                ? Number(payload.sort_order)
                : 0,
    };

    const { data, error } = await supabase
        .from("scope_detail_fields")
        .insert(insertPayload)
        .select("*")
        .single();

    if (error) throw error;
    return normalizeScopeDetailField(data);
};

export const updateScopeDetailField = async (fieldId, payload) => {
    const updatePayload = {
        field_key: slugifyFieldKey(payload.field_key ?? payload.field_label ?? ""),
        field_label: String(payload.field_label ?? "").trim(),
        field_type: normalizeScopeDetailFieldType(payload.field_type),
        placeholder: String(payload.placeholder ?? "").trim() || null,
        is_required: Boolean(payload.is_required),
        options: serializeScopeDetailFieldOptions(payload.options),
        sort_order:
            Number.isFinite(Number(payload.sort_order)) &&
            Number(payload.sort_order) >= 0
                ? Number(payload.sort_order)
                : 0,
    };

    const { data, error } = await supabase
        .from("scope_detail_fields")
        .update(updatePayload)
        .eq("id", fieldId)
        .select("*")
        .single();

    if (error) throw error;
    return normalizeScopeDetailField(data);
};

export const deleteScopeDetailField = async (fieldId) => {
    const { error } = await supabase
        .from("scope_detail_fields")
        .delete()
        .eq("id", fieldId);

    if (error) throw error;
    return true;
};

export const buildScopeDetailValuesPayload = (fields = [], values = {}) =>
    fields.reduce((acc, field) => {
        const value = values?.[field.field_key];
        const hasValue =
            value === 0 || value === false
                ? true
                : Array.isArray(value)
                  ? value.length > 0
                  : typeof value === "object" && value !== null
                    ? Boolean(value.url || value.name || value.label)
                    : value !== null &&
                      value !== undefined &&
                      String(value).trim() !== "";

        if (!hasValue) return acc;
        acc[field.field_key] = value;
        return acc;
    }, {});

export const validateScopeDetailValues = (fields = [], values = {}) => {
    const missingFields = [];

    fields.forEach((field) => {
        if (!field.is_required) return;
        const value = values?.[field.field_key];
        const hasValue =
            field.field_type === "checkbox"
                ? value === true
                : value === 0
                  ? true
                  : (Array.isArray(value) && value.length > 0) ||
                    (typeof value === "object" && value !== null
                        ? Boolean(value.url || value.name || value.label)
                        : String(value ?? "").trim() !== "");

        if (!hasValue) {
            missingFields.push(field);
        }
    });

    return missingFields;
};

export const uploadScopeDetailFile = async ({
    supabaseClient = supabase,
    userId,
    scopeCode,
    fieldKey,
    file,
}) => {
    if (!supabaseClient) throw new Error("Supabase client tidak tersedia.");
    if (!userId) throw new Error("User belum login.");
    if (!file) throw new Error("File belum dipilih.");

    const extension = String(file.name ?? "")
        .split(".")
        .pop()
        ?.toLowerCase() || "bin";
    const safeScope = slugifyFieldKey(scopeCode) || "scope";
    const safeFieldKey = slugifyFieldKey(fieldKey) || "field";
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
    const uploadPath = `${userId}/scope-fields/${safeScope}/${safeFieldKey}/${fileName}`;

    const { error: uploadError } = await supabaseClient.storage
        .from("job-photos")
        .upload(uploadPath, file, { upsert: false });

    if (uploadError) throw uploadError;

    const { data } = supabaseClient.storage
        .from("job-photos")
        .getPublicUrl(uploadPath);

    return {
        url: data?.publicUrl ?? "",
        path: uploadPath,
        name: file.name ?? fileName,
        type: file.type ?? "",
        size: file.size ?? null,
    };
};
