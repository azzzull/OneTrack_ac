import supabase from "../supabaseClient";

const normalizeProfileDisplayName = (profile) => {
    const composed =
        `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();
    return (
        composed ||
        String(profile?.name ?? "").trim() ||
        String(profile?.full_name ?? "").trim() ||
        String(profile?.email ?? "").trim() ||
        "-"
    );
};

const normalizeJobTechnicianRow = (row) => ({
    id: row.id,
    job_id: row.job_id,
    technician_id: row.technician_id,
    role: row.role === "creator" ? "creator" : "member",
    added_by: row.added_by ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    technician: row.technician ?? null,
    added_by_profile: row.added_by_profile ?? null,
    technician_name: normalizeProfileDisplayName(row.technician),
    added_by_name: normalizeProfileDisplayName(row.added_by_profile),
  });

const profileSelectQueries = [
    "id, first_name, last_name, email, technician_type, customer_id, role",
    "id, first_name, last_name, email, customer_id, role",
    "id, email, role",
];

export const getTechnicianProfiles = async () => {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
        "get_technician_directory",
    );

    if (!rpcError) {
        return (rpcData ?? []).sort((left, right) =>
            normalizeProfileDisplayName(left).localeCompare(
                normalizeProfileDisplayName(right),
            ),
        );
    }

    let lastError = null;

    for (const selectClause of profileSelectQueries) {
        const { data, error } = await supabase
            .from("profiles")
            .select(selectClause)
            .eq("role", "technician");

        if (!error) {
            return (data ?? []).sort((left, right) =>
                normalizeProfileDisplayName(left).localeCompare(
                    normalizeProfileDisplayName(right),
                ),
            );
        }

        lastError = error;
        if (
            error.code !== "42703" &&
            error.code !== "PGRST204" &&
            error.code !== "42501"
        ) {
            break;
        }
    }

    if (lastError) throw lastError;
    return [];
};

export const getJobTechnicians = async (jobId) => {
    if (!jobId) return [];

    const [{ data: rows, error: rowsError }, profiles] = await Promise.all([
        supabase
            .from("job_technicians")
            .select(
                `
                id,
                job_id,
                technician_id,
                role,
                added_by,
                created_at,
                updated_at
            `,
            )
            .eq("job_id", jobId)
            .order("role", { ascending: true })
            .order("created_at", { ascending: true }),
        getTechnicianProfiles().catch((error) => {
            console.warn("Failed to load technician directory for job rows:", error);
            return [];
        }),
    ]);

    if (rowsError) throw rowsError;

    const profileMap = new Map((profiles ?? []).map((profile) => [String(profile.id), profile]));
    const addedByMap = profileMap;

    return (rows ?? []).map((row) =>
        normalizeJobTechnicianRow({
            ...row,
            technician: profileMap.get(String(row.technician_id)) ?? null,
            added_by_profile: addedByMap.get(String(row.added_by)) ?? null,
        }),
    );
};

export const getTechnicianJobIds = async (technicianId) => {
    if (!technicianId) return [];

    const { data: rpcData, error: rpcError } = await supabase.rpc(
        "get_technician_job_ids",
        { p_technician_id: technicianId },
    );

    if (!rpcError) {
        return [...new Set((rpcData ?? []).map((item) => item.job_id).filter(Boolean))];
    }

    const { data, error } = await supabase
        .from("job_technicians")
        .select("job_id")
        .eq("technician_id", technicianId);

    if (error) throw error;
    return [...new Set((data ?? []).map((item) => item.job_id).filter(Boolean))];
};

export const addJobTechnician = async ({
    jobId,
    technicianId,
    role = "member",
    addedBy = null,
}) => {
    if (!jobId || !technicianId) return null;

    const { data: existing, error: existingError } = await supabase
        .from("job_technicians")
        .select("id, role")
        .eq("job_id", jobId)
        .eq("technician_id", technicianId)
        .maybeSingle();

    if (existingError) throw existingError;
    if (existing?.role === "creator") {
        return existing;
    }

    const payload = {
        job_id: jobId,
        technician_id: technicianId,
        role: role === "creator" ? "creator" : "member",
        added_by: addedBy,
    };

    const { data, error } = await supabase
        .from("job_technicians")
        .upsert(payload, {
            onConflict: "job_id,technician_id",
        })
        .select("*")
        .single();

    if (error) throw error;
    return normalizeJobTechnicianRow(data);
};

export const removeJobTechnician = async ({ jobId, technicianId }) => {
    if (!jobId || !technicianId) return false;

    const { data: existing, error: existingError } = await supabase
        .from("job_technicians")
        .select("id, role")
        .eq("job_id", jobId)
        .eq("technician_id", technicianId)
        .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) return true;
    if (existing.role === "creator") {
        throw new Error("Pembuat job tidak bisa dihapus.");
    }

    const { error } = await supabase
        .from("job_technicians")
        .delete()
        .eq("job_id", jobId)
        .eq("technician_id", technicianId);

    if (error) throw error;
    return true;
};

export const syncJobTechnicians = async ({
    jobId,
    creatorId,
    technicianIds = [],
    addedBy = null,
}) => {
    if (!jobId) throw new Error("jobId wajib diisi.");
    if (!creatorId) throw new Error("creatorId wajib diisi.");

    const normalizedMemberIds = [
        ...new Set(
            technicianIds
                .filter(Boolean)
                .map((id) => String(id))
                .filter((id) => id && id !== String(creatorId)),
        ),
    ];

    const desiredIds = new Set([String(creatorId), ...normalizedMemberIds]);

    const { data: existingRows, error: existingError } = await supabase
        .from("job_technicians")
        .select("technician_id, role")
        .eq("job_id", jobId);

    if (existingError) throw existingError;

    const existingCreatorRow = (existingRows ?? []).find(
        (row) => row.role === "creator",
    );
    if (
        existingCreatorRow &&
        String(existingCreatorRow.technician_id) !== String(creatorId)
    ) {
        const { error: deleteCreatorError } = await supabase
            .from("job_technicians")
            .delete()
            .eq("job_id", jobId)
            .eq("technician_id", existingCreatorRow.technician_id);
        if (deleteCreatorError) throw deleteCreatorError;
    }

    const upsertRows = [
        {
            job_id: jobId,
            technician_id: creatorId,
            role: "creator",
            added_by: addedBy,
        },
        ...normalizedMemberIds.map((technicianId) => ({
            job_id: jobId,
            technician_id: technicianId,
            role: "member",
            added_by: addedBy,
        })),
    ];

    const { error: upsertError } = await supabase
        .from("job_technicians")
        .upsert(upsertRows, {
            onConflict: "job_id,technician_id",
        });

    if (upsertError) throw upsertError;

    const idsToDelete =
        (existingRows ?? [])
            .map((row) => row.technician_id)
            .filter((technicianId) => !desiredIds.has(String(technicianId)));

    const { error: deleteError } = idsToDelete.length
        ? await supabase
              .from("job_technicians")
              .delete()
              .eq("job_id", jobId)
              .in("technician_id", idsToDelete)
        : { error: null };

    if (deleteError) throw deleteError;

    return getJobTechnicians(jobId);
};
