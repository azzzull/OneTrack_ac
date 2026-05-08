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
        fields: [
            { key: "equipment_type", label: "Tipe Aset", type: "select", options: [
                { value: "panel", label: "Panel" },
                { value: "ups", label: "UPS" },
            ]},
            { key: "panel_name", label: "Nama Panel / Unit", placeholder: "Panel SDP-A / UPS LT 2" },
            { key: "panel_location", label: "Lokasi Panel / Unit", placeholder: "Ruang listrik LT 2" },
            { key: "voltage_notes", label: "Catatan Tegangan", placeholder: "220V stabil" },
        ],
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
        fields: [
            { key: "unit_name", label: "Nama Unit Lift", placeholder: "Lift A / Service Lift" },
            { key: "unit_location", label: "Lokasi / Tower", placeholder: "Tower A" },
            { key: "serving_floor", label: "Lantai Layanan", placeholder: "B1 - 10" },
        ],
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
        fields: [
            { key: "unit_name", label: "Nama Unit Genset", placeholder: "GEN-01" },
            { key: "capacity", label: "Kapasitas", placeholder: "500 kVA" },
            { key: "load_check", label: "Catatan Beban", placeholder: "Load 68%" },
        ],
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
        fields: [
            { key: "work_area", label: "Area Pekerjaan", placeholder: "Toilet LT 3 / pantry" },
            { key: "line_type", label: "Jenis Saluran", placeholder: "Air bersih / air kotor / closet" },
            { key: "pump_unit", label: "Unit Pompa Terkait", placeholder: "Pompa transfer 1" },
        ],
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
        fields: [
            { key: "zone_name", label: "Zone / Area", placeholder: "Zone 4 / Gedung A" },
            { key: "device_name", label: "Panel / Device", placeholder: "MCFA / detector / hydrant" },
            { key: "interlock_note", label: "Catatan Interlock", placeholder: "PA, press fan, BAS" },
        ],
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
        fields: [
            { key: "work_area", label: "Area Pekerjaan", placeholder: "Atap / toilet / parkiran" },
            { key: "damage_type", label: "Jenis Kerusakan", placeholder: "Retak / bocor / finishing" },
            { key: "material_note", label: "Catatan Material", placeholder: "Cat / semen / waterproofing" },
        ],
        checklist: [],
    },
    ACCESS_CONTROL: {
        fields: [
            { key: "door_name", label: "Nama Pintu / Device", placeholder: "Main Entrance / Door A" },
            { key: "device_type", label: "Tipe Device", placeholder: "Maglock / reader / push button" },
            { key: "location", label: "Lokasi", placeholder: "Lobby / ruang server" },
        ],
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
};

export const normalizeJobScope = (value) => {
    const raw = normalizeJobScopeCode(value);
    return JOB_SCOPES[raw] ?? raw ?? JOB_SCOPES.AC;
};

export const getScopeSummaryMeta = (jobScope, dynamicData, roomLocation) => {
    const normalizedScope = normalizeJobScope(jobScope);
    const details =
        dynamicData && typeof dynamicData === "object" ? dynamicData : {};

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
            .map((key) => details[key])
            .find((item) => String(item ?? "").trim() !== "") || "-";

    return {
        label: labelMap[normalizedScope] ?? "Detail",
        value,
    };
};
