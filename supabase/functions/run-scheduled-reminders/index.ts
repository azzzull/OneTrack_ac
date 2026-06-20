import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const scheduledReminderSecret = Deno.env.get("SCHEDULED_REMINDER_SECRET") ?? "";

type ReminderType =
    | "job_unclaimed_reminder"
    | "job_no_progress_reminder"
    | "accommodation_unrealized_reminder"
    | "realization_unreviewed_reminder";

type Candidate = {
    type: ReminderType;
    referenceTable: string;
    referenceId: string | null;
    trackingReferenceId: string;
    title: string;
    body: string;
    recipientUserIds?: string[];
    recipientRoles?: string[];
    data: Record<string, unknown>;
};

type ReminderRow = {
    type: string;
    reference_table: string;
    reference_id: string;
    last_sent_at: string;
};

type ProfileRow = {
    id: string;
    role?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
};

const jsonResponse = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

const unique = (values: Array<string | null | undefined>) =>
    [...new Set(values.map((value) => String(value ?? "").trim()))].filter(
        Boolean,
    );

const formatRupiah = (value: unknown) =>
    new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
    })
        .format(Number(value ?? 0))
        .replace(/\s/g, " ");

const getProfileName = (profile?: ProfileRow | null, fallback = "Teknisi") => {
    const composed =
        `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();
    return (
        composed ||
        String(profile?.email ?? "").trim() ||
        fallback
    );
};

const getCustomerName = (row: Record<string, unknown>) =>
    String(
        row.customer_name ??
            row.title ??
            "customer",
    ).trim();

const createReminderKey = (candidate: Candidate) =>
    `${candidate.type}:${candidate.referenceTable}:${candidate.trackingReferenceId}`;

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") {
        return jsonResponse({ success: false, error: "Method not allowed" }, 405);
    }

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !scheduledReminderSecret) {
        return jsonResponse(
            {
                success: false,
                error: "Missing SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, or SCHEDULED_REMINDER_SECRET",
            },
            500,
        );
    }

    const input = await req.json().catch(() => ({}));
    const dryRun = Boolean(input?.dryRun);
    const errors: unknown[] = [];
    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const candidates: Candidate[] = [];

    const addCandidates = (items: Candidate[]) => candidates.push(...items);

    try {
        const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        const { data, error } = await admin
            .from("requests")
            .select("id, customer_name, title, customer_id, status, technician_id, created_at")
            .in("status", ["pending", "requested", "open_for_technician"])
            .is("technician_id", null)
            .lt("created_at", cutoff)
            .order("created_at", { ascending: true })
            .limit(100);

        if (error) throw error;
        addCandidates(
            (data ?? []).map((row) => {
                const customerName = getCustomerName(row);
                return {
                    type: "job_unclaimed_reminder",
                    referenceTable: "requests",
                    referenceId: row.id,
                    trackingReferenceId: row.id,
                    recipientRoles: ["technician"],
                    title: "Reminder Job Belum Diambil",
                    body: `Job untuk customer ${customerName} belum diambil oleh teknisi.`,
                    data: {
                        request_id: row.id,
                        customer_id: row.customer_id ?? null,
                        customer_name: customerName,
                    },
                };
            }),
        );
    } catch (error) {
        errors.push({ type: "job_unclaimed_reminder", message: String(error) });
    }

    try {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await admin
            .from("requests")
            .select("id, customer_name, title, customer_id, status, technician_id, updated_at")
            .in("status", ["pending", "requested", "taken", "in_progress"])
            .not("technician_id", "is", null)
            .lt("updated_at", cutoff)
            .order("updated_at", { ascending: true })
            .limit(100);

        if (error) throw error;
        addCandidates(
            (data ?? []).map((row) => {
                const customerName = getCustomerName(row);
                return {
                    type: "job_no_progress_reminder",
                    referenceTable: "requests",
                    referenceId: row.id,
                    trackingReferenceId: row.id,
                    recipientRoles: ["admin"],
                    recipientUserIds: unique([row.technician_id]),
                    title: "Reminder Progress Pekerjaan",
                    body: `Job customer ${customerName} belum memiliki update progress terbaru.`,
                    data: {
                        request_id: row.id,
                        customer_id: row.customer_id ?? null,
                        customer_name: customerName,
                        technician_id: row.technician_id ?? null,
                    },
                };
            }),
        );
    } catch (error) {
        errors.push({ type: "job_no_progress_reminder", message: String(error) });
    }

    try {
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await admin
            .from("accommodation_requests")
            .select("id, technician_id, requested_amount, approved_amount, status, reviewed_at, updated_at")
            .in("status", ["approved", "realization_process"])
            .lt("reviewed_at", cutoff)
            .order("reviewed_at", { ascending: true })
            .limit(100);

        if (error) throw error;
        const requestIds = unique((data ?? []).map((row) => row.id));
        const { data: realizations, error: realizationError } = requestIds.length
            ? await admin
                  .from("accommodation_realizations")
                  .select("accommodation_request_id")
                  .in("accommodation_request_id", requestIds)
            : { data: [], error: null };
        if (realizationError) throw realizationError;

        const realizedIds = new Set(
            (realizations ?? []).map((row) => String(row.accommodation_request_id)),
        );
        addCandidates(
            (data ?? [])
                .filter((row) => !realizedIds.has(String(row.id)))
                .map((row) => ({
                    type: "accommodation_unrealized_reminder",
                    referenceTable: "accommodation_requests",
                    referenceId: row.id,
                    trackingReferenceId: row.id,
                    recipientUserIds: unique([row.technician_id]),
                    title: "Reminder Realisasi Akomodasi",
                    body: `Pengajuan akomodasi sebesar ${formatRupiah(
                        row.approved_amount ?? row.requested_amount,
                    )} belum direalisasikan.`,
                    data: {
                        accommodation_id: row.id,
                        technician_id: row.technician_id ?? null,
                        amount: row.approved_amount ?? row.requested_amount ?? 0,
                    },
                })),
        );
    } catch (error) {
        errors.push({
            type: "accommodation_unrealized_reminder",
            message: String(error),
        });
    }

    try {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await admin
            .from("accommodation_realizations")
            .select("id, accommodation_request_id, created_by, amount, created_at, review_status")
            .eq("review_status", "pending_review")
            .lt("created_at", cutoff)
            .order("created_at", { ascending: true })
            .limit(100);

        if (error) throw error;
        const technicianIds = unique((data ?? []).map((row) => row.created_by));
        const { data: profiles, error: profileError } = technicianIds.length
            ? await admin
                  .from("profiles")
                  .select("id, first_name, last_name, email")
                  .in("id", technicianIds)
            : { data: [], error: null };
        if (profileError) throw profileError;
        const profileMap = new Map(
            (profiles ?? []).map((profile: ProfileRow) => [profile.id, profile]),
        );

        addCandidates(
            (data ?? []).map((row) => {
                const technicianName = getProfileName(
                    profileMap.get(String(row.created_by)),
                );
                return {
                    type: "realization_unreviewed_reminder",
                    referenceTable: "accommodation_requests",
                    referenceId: row.accommodation_request_id,
                    trackingReferenceId: row.accommodation_request_id,
                    recipientRoles: ["admin", "management"],
                    title: "Reminder Cek Realisasi",
                    body: `Realisasi akomodasi dari ${technicianName} menunggu pengecekan.`,
                    data: {
                        accommodation_id: row.accommodation_request_id,
                        realization_id: row.id,
                        technician_id: row.created_by ?? null,
                        technician_name: technicianName,
                        amount: row.amount ?? 0,
                    },
                };
            }),
        );
    } catch (error) {
        errors.push({
            type: "realization_unreviewed_reminder",
            message: String(error),
        });
    }

    const uniqueCandidates = [
        ...new Map(
            candidates.map((candidate) => [createReminderKey(candidate), candidate]),
        ).values(),
    ];

    const reminderKeys = uniqueCandidates.map((candidate) => ({
        type: candidate.type,
        reference_table: candidate.referenceTable,
        reference_id: candidate.trackingReferenceId,
    }));

    const { data: reminderRows, error: reminderError } = reminderKeys.length
        ? await admin
              .from("notification_reminders")
              .select("type, reference_table, reference_id, last_sent_at")
              .in("type", unique(reminderKeys.map((row) => row.type)))
        : { data: [], error: null };

    if (reminderError) {
        errors.push({
            type: "notification_reminders",
            message: reminderError.message,
        });
    }

    const now = Date.now();
    const cooldownMs = 24 * 60 * 60 * 1000;
    const reminderMap = new Map(
        ((reminderRows ?? []) as ReminderRow[]).map((row) => [
            `${row.type}:${row.reference_table}:${row.reference_id}`,
            row,
        ]),
    );
    const dueCandidates = uniqueCandidates.filter((candidate) => {
        const existing = reminderMap.get(createReminderKey(candidate));
        if (!existing) return true;
        return now - new Date(existing.last_sent_at).getTime() >= cooldownMs;
    });

    const allRecipientIds = unique(
        dueCandidates.flatMap((candidate) => candidate.recipientUserIds ?? []),
    );
    const roleRecipients = unique(
        dueCandidates.flatMap((candidate) => candidate.recipientRoles ?? []),
    );

    const roleProfilesResult = roleRecipients.length
        ? await admin
              .from("profiles")
              .select("id, role")
              .in("role", roleRecipients)
              .eq("is_active", true)
        : { data: [], error: null };

    if (roleProfilesResult.error) {
        errors.push({ type: "profiles", message: roleProfilesResult.error.message });
    }

    const roleProfileIds = unique(
        ((roleProfilesResult.data ?? []) as Array<{ id: string }>).map((row) => row.id),
    );

    const directProfilesResult = allRecipientIds.length
        ? await admin
              .from("profiles")
              .select("id")
              .in("id", allRecipientIds)
              .eq("is_active", true)
        : { data: [], error: null };

    if (directProfilesResult.error) {
        errors.push({ type: "profiles", message: directProfilesResult.error.message });
    }

    const activeDirectRecipientIds = unique(
        ((directProfilesResult.data ?? []) as Array<{ id: string }>).map((row) => row.id),
    );

    const [directTokenResult, roleTokenResult] = await Promise.all([
        activeDirectRecipientIds.length
            ? admin
                  .from("user_push_tokens")
                  .select("user_id")
                  .in("user_id", activeDirectRecipientIds)
            : Promise.resolve({ data: [], error: null }),
        roleProfileIds.length
            ? admin.from("user_push_tokens").select("user_id").in("user_id", roleProfileIds)
            : Promise.resolve({ data: [], error: null }),
    ]);

    if (directTokenResult.error) {
        errors.push({ type: "user_push_tokens", message: directTokenResult.error.message });
    }
    if (roleTokenResult.error) {
        errors.push({ type: "user_push_tokens", message: roleTokenResult.error.message });
    }

    const usersWithTokens = new Set([
        ...((directTokenResult.data ?? []) as Array<{ user_id: string }>).map((row) =>
            String(row.user_id),
        ),
        ...((roleTokenResult.data ?? []) as Array<{ user_id: string }>).map((row) =>
            String(row.user_id),
        ),
    ]);
    const rolesWithTokens = new Set(
        ((roleProfilesResult.data ?? []) as Array<{ id: string; role: string }>)
            .filter((row) => usersWithTokens.has(String(row.id)))
            .map((row) => String(row.role)),
    );

    let sent = 0;
    let skipped = uniqueCandidates.length - dueCandidates.length;
    const dryRunCandidates = [];

    for (const candidate of dueCandidates) {
        const directRecipientsWithTokens = unique(candidate.recipientUserIds ?? []).filter(
            (userId) => usersWithTokens.has(userId),
        );
        const roleRecipientsWithTokens = unique(
            ((roleProfilesResult.data ?? []) as Array<{ id: string; role: string }>)
                .filter(
                    (row) =>
                        usersWithTokens.has(String(row.id)) &&
                        unique(candidate.recipientRoles ?? []).includes(
                            String(row.role),
                        ) &&
                        rolesWithTokens.has(String(row.role)),
                )
                .map((row) => row.id),
        );
        const resolvedRecipientIds = unique([
            ...directRecipientsWithTokens,
            ...roleRecipientsWithTokens,
        ]);

        if (!resolvedRecipientIds.length) {
            skipped += 1;
            continue;
        }

        const payload = {
            recipientUserIds: resolvedRecipientIds,
            recipientRoles: [],
            title: candidate.title,
            body: candidate.body,
            type: candidate.type,
            referenceTable: candidate.referenceTable,
            referenceId: candidate.referenceId,
            data: candidate.data,
        };

        dryRunCandidates.push({
            type: candidate.type,
            referenceTable: candidate.referenceTable,
            referenceId: candidate.referenceId,
            trackingReferenceId: candidate.trackingReferenceId,
            recipientUserIds: payload.recipientUserIds,
            recipientRoles: payload.recipientRoles,
            title: candidate.title,
            body: candidate.body,
        });

        if (dryRun) continue;

        try {
            const response = await fetch(
                `${supabaseUrl}/functions/v1/send-push-notification`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${anonKey}`,
                        "Content-Type": "application/json",
                        "x-scheduled-reminder-secret": scheduledReminderSecret,
                    },
                    body: JSON.stringify(payload),
                },
            );
            const result = await response.json().catch(() => null);
            if (!response.ok || result?.success === false) {
                errors.push({
                    type: candidate.type,
                    referenceId: candidate.trackingReferenceId,
                    message:
                        result?.error ??
                        result?.message ??
                        `send-push-notification failed with ${response.status}`,
                    details: result,
                });
                skipped += 1;
                continue;
            }

            const { error: recordError } = await admin.rpc("record_notification_reminder", {
                p_type: candidate.type,
                p_reference_table: candidate.referenceTable,
                p_reference_id: candidate.trackingReferenceId,
            });
            if (recordError) throw recordError;
            sent += 1;
        } catch (error) {
            errors.push({
                type: candidate.type,
                referenceId: candidate.trackingReferenceId,
                message: error instanceof Error ? error.message : String(error),
            });
            skipped += 1;
        }
    }

    return jsonResponse({
        success: errors.length === 0,
        dryRun,
        checked: uniqueCandidates.length,
        sent: dryRun ? 0 : sent,
        skipped,
        errors,
        candidates: dryRun ? dryRunCandidates : undefined,
    });
});
