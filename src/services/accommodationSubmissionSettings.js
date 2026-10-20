import supabase from "../supabaseClient";

const normalizeSetting = (setting) => ({
    enabled: setting?.enabled !== false,
    note: setting?.note ?? "",
    updatedAt: setting?.updated_at ?? null,
    updatedBy: setting?.updated_by ?? null,
});

export const getAccommodationSubmissionBlockSetting = async () => {
    const { data, error } = await supabase.rpc(
        "get_accommodation_submission_block_setting",
    );

    if (error) throw error;
    return normalizeSetting(Array.isArray(data) ? data[0] : data);
};

export const saveAccommodationSubmissionBlockSetting = async ({
    enabled,
    note,
}) => {
    const { data, error } = await supabase.rpc(
        "set_accommodation_submission_block_setting",
        {
            p_enabled: Boolean(enabled),
            p_note: String(note ?? "").trim() || null,
        },
    );

    if (error) throw error;
    return normalizeSetting(Array.isArray(data) ? data[0] : data);
};
