export const JOB_SCOPES = {
    AC: "AC",
    ELECTRICAL: "ELECTRICAL",
    ELEVATOR: "ELEVATOR",
    GENSET: "GENSET",
    PLUMBING: "PLUMBING",
    FIRE_ALARM: "FIRE_ALARM",
    CIVIL: "CIVIL",
    ACCESS_CONTROL: "ACCESS_CONTROL",
};

export const JOB_SCOPE_LABELS = {
    AC: "Air Conditioning",
    ELECTRICAL: "Electrical",
    ELEVATOR: "Elevator",
    GENSET: "Generator Set",
    PLUMBING: "Plumbing",
    FIRE_ALARM: "Fire System",
    CIVIL: "Civil Works",
    ACCESS_CONTROL: "Access Control / Door Lock",
};

export const DEFAULT_JOB_SCOPE_ROWS = Object.values(JOB_SCOPES).map((code) => ({
    code,
    label: JOB_SCOPE_LABELS[code] ?? code,
}));

export const normalizeJobScopeCode = (value) =>
    String(value ?? "")
        .trim()
        .toUpperCase()
        .replaceAll("-", "_")
        .replaceAll(" ", "_");

export const getJobScopeLabel = (scope, labels = JOB_SCOPE_LABELS) => {
    const normalizedScope = normalizeJobScope(scope);
    return labels?.[normalizedScope] ?? JOB_SCOPE_LABELS[normalizedScope] ?? normalizedScope;
};

export const buildJobScopeLabels = (rows = DEFAULT_JOB_SCOPE_ROWS) =>
    rows.reduce((acc, row) => {
        const code = normalizeJobScopeCode(row?.code);
        if (!code) return acc;
        acc[code] = String(row?.label ?? "").trim() || code;
        return acc;
    }, {});

export const buildJobScopeOptions = (rows = DEFAULT_JOB_SCOPE_ROWS) =>
    rows
        .map((row) => {
            const value = normalizeJobScopeCode(row?.code);
            if (!value) return null;
            return {
                value,
                label: String(row?.label ?? "").trim() || value,
            };
        })
        .filter(Boolean);

export const SCOPE_DETAIL_CONFIG = {
    ELECTRICAL: {
        checklist: [
            "Inspeksi breaker",
            "Inspeksi pilot lamp",
            "Inspeksi power meter",
            "Pemeriksaan korosi / karat box konektor",
            "Thermal scanning seluruh koneksi",
            "Cek tegangan",
            "Cek system",
            "Cek jaringan",
            "Cek power supply",
            "Cleaning body",
            "Cek terminasi & koneksi kabel busbar",
            "Test insulation resistance",
            "Pengecekan tegangan UPS",
            "Pengecekan battery UPS",
        ],
    },
    ELEVATOR: {
        checklist: [
            "Pengecekan controller dan inverter",
            "Pengecekan mesin",
            "Pengecekan signalization",
            "Pengecekan box lift",
            "Pengecekan elevator shaft",
            "Pengecekan pit lift",
        ],
    },
    GENSET: {
        checklist: [
            "Pembersihan genset",
            "Ganti oli",
            "Ganti filter oli",
            "Isi air radiator",
            "Isi air aki",
            "Pengecekan beban",
        ],
    },
    PLUMBING: {
        checklist: [
            "Pemeriksaan rutin",
            "Perawatan dan perbaikan pipa air kotor dan pembuangan",
            "Perawatan dan perbaikan pipa toilet dan saluran closet",
            "Perawatan dan perbaikan bak kontrol",
            "Perawatan dan perbaikan motor pompa",
            "Perawatan dan perbaikan instalasi air bersih",
            "Perawatan dan perbaikan keran air dan jet shower",
        ],
    },
    FIRE_ALARM: {
        checklist: [
            "Pemeriksaan & test annunciator",
            "Pemeriksaan & test detector beserta accessories",
            "Pemeriksaan & test module",
            "Pemeriksaan & test MCFA ruang MCFA",
            "Pemeriksaan & test interlock system",
            "Simulation test",
            "Pemeriksaan tabung hydrant dan pengisian kembali",
        ],
    },
    CIVIL: {
        checklist: [],
    },
    ACCESS_CONTROL: {
        checklist: [
            "Pemeriksaan electric lock / maglock",
            "Pemeriksaan access reader / credential",
            "Pemeriksaan push button / exit switch",
            "Pemeriksaan power supply",
            "Pemeriksaan wiring dan koneksi",
            "Pemeriksaan door closer & alignment",
            "Test buka/tutup dan akses user",
        ],
    },
    AC: {
        checklist: [],
    },
};

export const getScopeChecklist = (scope) =>
    SCOPE_DETAIL_CONFIG[normalizeJobScope(scope)]?.checklist ?? [];

export const normalizeJobScope = (value) => {
    const raw = normalizeJobScopeCode(value);
    return JOB_SCOPES[raw] ?? raw ?? JOB_SCOPES.AC;
};

export const getScopeSummaryMeta = (jobScope, dynamicData, roomLocation) => {
    const normalizedScope = normalizeJobScope(jobScope);
    const details =
        dynamicData && typeof dynamicData === "object" ? dynamicData : {};

    const stringifyValue = (value) => {
        if (value === null || value === undefined) return "";
        if (Array.isArray(value)) return value.filter(Boolean).join(", ");
        if (typeof value === "object") {
            return String(value?.name ?? value?.label ?? value?.url ?? "");
        }
        return String(value).trim();
    };

    if (normalizedScope === JOB_SCOPES.AC) {
        return {
            label: "Ruangan",
            value: roomLocation || "-",
        };
    }

    const fieldPriority = {
        ELECTRICAL: ["panel_location", "panel_name"],
        ELEVATOR: ["unit_location", "unit_name"],
        GENSET: ["unit_name", "capacity"],
        PLUMBING: ["work_area", "line_type"],
        FIRE_ALARM: ["zone_name", "device_name"],
        CIVIL: ["work_area", "damage_type"],
        ACCESS_CONTROL: ["location", "door_name"],
    };

    const labelMap = {
        ELECTRICAL: "Panel",
        ELEVATOR: "Unit",
        GENSET: "Unit",
        PLUMBING: "Area",
        FIRE_ALARM: "Zone",
        CIVIL: "Area",
        ACCESS_CONTROL: "Lokasi",
    };

    const candidates = fieldPriority[normalizedScope] ?? [];
    const value =
        candidates
            .map((key) => stringifyValue(details[key]))
            .find((item) => String(item ?? "").trim() !== "") || "-";

    if (value !== "-") {
        return {
            label: labelMap[normalizedScope] ?? "Detail",
            value,
        };
    }

    const fallback = Object.values(details)
        .map((item) => stringifyValue(item))
        .find((item) => String(item ?? "").trim() !== "");

    return {
        label: labelMap[normalizedScope] ?? "Detail",
        value: fallback || "-",
    };
};
