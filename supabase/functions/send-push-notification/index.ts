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
const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID") ?? "";
const firebaseClientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL") ?? "";
const firebasePrivateKey = Deno.env.get("FIREBASE_PRIVATE_KEY") ?? "";
const scheduledReminderSecret = Deno.env.get("SCHEDULED_REMINDER_SECRET") ?? "";
const vapidPublicKey = Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY") ?? "";
const vapidPrivateKey = Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY") ?? "";
const vapidSubject =
    Deno.env.get("WEB_PUSH_VAPID_SUBJECT") ?? "mailto:admin@onetrack.app";

type PushRequestBody = {
    recipientUserIds?: unknown;
    recipientRoles?: unknown;
    title?: unknown;
    body?: unknown;
    type?: unknown;
    referenceTable?: unknown;
    referenceId?: unknown;
    data?: unknown;
};

type ResolvedUser = {
    id: string;
    role?: string | null;
};

type PushToken = {
    user_id: string;
    token: string;
    platform?: string | null;
    web_push_subscription?: unknown;
};

type SendError = {
    token?: string;
    userId?: string;
    message: string;
    details?: unknown;
};

type PushDiagnostics = {
    tokenPlatformCounts: Record<string, number>;
    fcmTokenCount: number;
    webPushTokenCount: number;
    firebaseProjectId?: string;
};

type WebPushClient = {
    setVapidDetails: (
        subject: string,
        publicKey: string,
        privateKey: string,
    ) => void;
    sendNotification: (subscription: unknown, payload: string) => Promise<unknown>;
};

const getErrorMessage = (error: unknown, fallback = "Unexpected error") =>
    error instanceof Error ? error.message : fallback;

const getErrorDetails = (error: unknown) => {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
        };
    }
    return error;
};

const logFunctionResult = (payload: unknown, status: number) => {
    if (!payload || typeof payload !== "object") return;

    const result = payload as {
        success?: unknown;
        error?: unknown;
        details?: unknown;
        message?: unknown;
        recipientCount?: unknown;
        tokenCount?: unknown;
        sentCount?: unknown;
        failedCount?: unknown;
        errors?: unknown;
        diagnostics?: unknown;
    };

    const summary = {
        status,
        success: result.success,
        error: result.error,
        details: result.details,
        message: result.message,
        recipientCount: result.recipientCount,
        tokenCount: result.tokenCount,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        errors: result.errors,
        diagnostics: result.diagnostics,
    };

    if (result.success === false) {
        console.warn("[send-push-notification] result:", summary);
    } else {
        console.info("[send-push-notification] result:", summary);
    }
};

const jsonResponse = (payload: unknown, status = 200) => {
    logFunctionResult(payload, status);
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
};

const isUuid = (value: unknown) =>
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.trim(),
    );

const uniqueStrings = (values: unknown) => {
    if (!Array.isArray(values)) return [];
    return [...new Set(values.map((value) => String(value ?? "").trim()))].filter(
        Boolean,
    );
};

const normalizePrivateKey = (value: string) =>
    value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;

const base64UrlEncode = (input: string | Uint8Array) => {
    const bytes =
        typeof input === "string" ? new TextEncoder().encode(input) : input;
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const pemToArrayBuffer = (pem: string) => {
    const base64 = normalizePrivateKey(pem)
        .replace("-----BEGIN PRIVATE KEY-----", "")
        .replace("-----END PRIVATE KEY-----", "")
        .replace(/\s/g, "");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
};

const getFirebaseAccessToken = async () => {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const claimSet = {
        iss: firebaseClientEmail,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
    };

    const unsignedJwt = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
        JSON.stringify(claimSet),
    )}`;

    const key = await crypto.subtle.importKey(
        "pkcs8",
        pemToArrayBuffer(firebasePrivateKey),
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        new TextEncoder().encode(unsignedJwt),
    );
    const jwt = `${unsignedJwt}.${base64UrlEncode(new Uint8Array(signature))}`;

    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: jwt,
        }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.access_token) {
        throw new Error(
            `Firebase OAuth failed: ${payload?.error_description ?? payload?.error ?? response.statusText}`,
        );
    }

    return String(payload.access_token);
};

const toStringData = (
    type: string,
    referenceTable: string | null,
    referenceId: string | null,
    data: Record<string, unknown>,
) => {
    const output: Record<string, string> = { type };
    if (referenceTable) output.referenceTable = referenceTable;
    if (referenceId) output.referenceId = referenceId;

    for (const [key, value] of Object.entries(data)) {
        if (value === undefined || value === null) continue;
        output[key] =
            typeof value === "string" ? value : JSON.stringify(value);
    }

    return output;
};

const isInvalidFcmToken = (payload: unknown) => {
    const json = JSON.stringify(payload ?? {}).toUpperCase();
    return (
        json.includes("UNREGISTERED") ||
        json.includes("NOT_FOUND") ||
        json.includes("INVALID_ARGUMENT")
    );
};

const loadWebPush = async (): Promise<WebPushClient> => {
    const module = await import("https://esm.sh/web-push@3.6.7");
    return (module.default ?? module) as WebPushClient;
};

const getTokenPlatformCounts = (tokens: PushToken[]) =>
    tokens.reduce<Record<string, number>>((counts, token) => {
        const platform = String(token.platform ?? "unknown").trim() || "unknown";
        counts[platform] = (counts[platform] ?? 0) + 1;
        return counts;
    }, {});

const BUSINESS_EVENT_ALLOWED_ROLES: Record<string, string[]> = {
    job_requested: ["admin", "management", "technician"],
    job_created_by_technician: ["admin", "management"],
    job_taken: ["admin", "management"],
    job_status_changed: ["admin", "management"],
    accommodation_requested: ["admin", "management"],
    realization_need_review: ["admin", "management"],
    job_unclaimed_reminder: ["technician"],
    job_no_progress_reminder: ["admin", "management", "technician"],
    accommodation_unrealized_reminder: ["technician"],
    realization_unreviewed_reminder: ["admin", "management"],
    overtime_requested: ["admin", "management"],
    overtime_approved: ["technician"],
    overtime_rejected: ["technician"],
    overtime_status_changed: ["technician", "admin", "management"],
    reimbursement_requested: ["admin", "management"],
    reimbursement_approved: ["technician"],
    reimbursement_rejected: ["technician"],
    loan_requested: ["admin", "management"],
    loan_approved: ["technician"],
    loan_rejected: ["technician"],
    loan_repayment_created: ["admin", "management"],
    loan_repayment_approved: ["technician"],
    loan_repayment_rejected: ["technician"],
    loan_deducted: ["technician"],
};

const canUseBusinessRecipients = (
    type: string,
    requestedRoles: string[],
    requestedUserIds: string[],
) => {
    const allowedRoles = BUSINESS_EVENT_ALLOWED_ROLES[type];
    if (!allowedRoles) return false;
    const rolesAllowed =
        requestedRoles.length === 0 ||
        requestedRoles.every((role) => allowedRoles.includes(role));
    return rolesAllowed && requestedUserIds.length <= 25;
};

const RELATED_CUSTOMER_EVENT_TYPES = [
    "job_created_by_technician",
    "job_taken",
    "job_status_changed",
];

const handleRequest = async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
    }

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
        return jsonResponse(
            {
                success: false,
                error: "Missing Supabase Edge Function secrets",
            },
        );
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return jsonResponse({ success: false, error: "Unauthorized" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const internalSecret = req.headers.get("x-scheduled-reminder-secret") ?? "";
    const isInternalScheduledCall =
        Boolean(scheduledReminderSecret) &&
        internalSecret === scheduledReminderSecret &&
        (jwt === serviceRoleKey || jwt === anonKey);

    let requesterId: string | null = null;
    let requesterRole = "admin";

    if (!isInternalScheduledCall) {
        const requesterClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: `Bearer ${jwt}` } },
        });

        const { data: userData, error: userError } =
            await requesterClient.auth.getUser(jwt);
        if (userError || !userData?.user) {
            return jsonResponse({ success: false, error: "Unauthorized" }, 401);
        }

        requesterId = userData.user.id;
        const { data: requesterProfile, error: requesterProfileError } =
            await adminClient
                .from("profiles")
                .select("id, role")
                .eq("id", requesterId)
                .maybeSingle();

        if (requesterProfileError) {
            return jsonResponse(
                {
                    success: false,
                    error: "Failed to load requester profile",
                    details: requesterProfileError.message,
                },
            );
        }

        requesterRole = String(requesterProfile?.role ?? "");
    }

    const canSendArbitrary = ["admin", "management"].includes(requesterRole);

    let input: PushRequestBody;
    try {
        input = await req.json();
    } catch {
        return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }

    const title = String(input.title ?? "").trim();
    const body = String(input.body ?? "").trim();
    const type = String(input.type ?? "").trim();
    const referenceTable = String(input.referenceTable ?? "").trim() || null;
    const rawReferenceId = input.referenceId;
    const referenceId = isUuid(rawReferenceId) ? String(rawReferenceId).trim() : null;
    const data =
        input.data && typeof input.data === "object" && !Array.isArray(input.data)
            ? (input.data as Record<string, unknown>)
            : {};

    if (!title || !body || !type) {
        return jsonResponse(
            { success: false, error: "title, body, and type are required" },
            400,
        );
    }

    const requestedUserIds = uniqueStrings(input.recipientUserIds).filter(isUuid);
    const requestedRoles = uniqueStrings(input.recipientRoles)
        .map((role) => role.toLowerCase())
        .filter((role) =>
            ["admin", "management", "technician", "customer"].includes(role),
        );

    const usesArbitraryRecipients =
        requestedRoles.length > 0 ||
        requestedUserIds.some((id) => id !== requesterId);
    const canSendBusinessEvent = canUseBusinessRecipients(
        type,
        requestedRoles,
        requestedUserIds,
    );

    if (usesArbitraryRecipients && !canSendArbitrary && !canSendBusinessEvent) {
        return jsonResponse(
            {
                success: false,
                error: "Forbidden. Recipient targets are not allowed for this user or event type.",
            },
            403,
        );
    }

    const recipientMap = new Map<string, ResolvedUser>();
    for (const userId of requestedUserIds) recipientMap.set(userId, { id: userId });

    const relatedCustomerId = String(data.customer_id ?? "").trim();
    if (
        relatedCustomerId &&
        RELATED_CUSTOMER_EVENT_TYPES.includes(type)
    ) {
        const { data: customerProfiles, error: customerProfileError } =
            await adminClient
                .from("profiles")
                .select("id, role")
                .eq("role", "customer")
                .eq("customer_id", relatedCustomerId);

        if (customerProfileError) {
            console.warn(
                "[send-push-notification] customer profile lookup skipped:",
                customerProfileError.message,
            );
        } else {
            for (const user of (customerProfiles ?? []) as ResolvedUser[]) {
                if (isUuid(user.id)) recipientMap.set(user.id, user);
            }
        }

        const { data: customer, error: customerError } = await adminClient
            .from("master_customers")
            .select("user_id, email")
            .eq("id", relatedCustomerId)
            .maybeSingle();

        if (customerError) {
            console.warn(
                "[send-push-notification] master customer lookup skipped:",
                customerError.message,
            );
        } else {
            if (isUuid(customer?.user_id)) {
                recipientMap.set(customer.user_id, {
                    id: customer.user_id,
                    role: "customer",
                });
            }

            const customerEmail = String(customer?.email ?? "").trim();
            if (customerEmail) {
                const { data: emailProfiles, error: emailProfileError } =
                    await adminClient
                        .from("profiles")
                        .select("id, role")
                        .eq("role", "customer")
                        .eq("email", customerEmail);

                if (emailProfileError) {
                    console.warn(
                        "[send-push-notification] customer email profile lookup skipped:",
                        emailProfileError.message,
                    );
                } else {
                    for (const user of (emailProfiles ?? []) as ResolvedUser[]) {
                        if (isUuid(user.id)) recipientMap.set(user.id, user);
                    }
                }
            }
        }
    }

    const genericRequestedRoles = [...requestedRoles];

    if (type === "job_requested") {
        const technicianIndex = genericRequestedRoles.indexOf("technician");
        if (technicianIndex >= 0) {
            genericRequestedRoles.splice(technicianIndex, 1);
        }

        if (referenceId) {
            const { data: jobTechnicians, error: jobTechniciansError } =
                await adminClient
                    .from("job_technicians")
                    .select("technician_id")
                    .eq("job_id", referenceId);

            if (jobTechniciansError) {
                console.warn(
                    "[send-push-notification] job technician lookup skipped:",
                    jobTechniciansError.message,
                );
            } else {
                for (const row of (jobTechnicians ?? []) as Array<{ technician_id?: string }>) {
                    if (isUuid(row.technician_id)) {
                        recipientMap.set(row.technician_id, {
                            id: row.technician_id,
                            role: "technician",
                        });
                    }
                }
            }
        }

        if (relatedCustomerId) {
            const { data: assignmentRows, error: assignmentRowsError } =
                await adminClient
                    .from("technician_customer_assignments")
                    .select("technician_id")
                    .eq("customer_id", relatedCustomerId)
                    .eq("is_active", true);

            if (assignmentRowsError) {
                console.warn(
                    "[send-push-notification] technician assignment lookup skipped:",
                    assignmentRowsError.message,
                );
            } else {
                for (const row of (assignmentRows ?? []) as Array<{ technician_id?: string }>) {
                    if (isUuid(row.technician_id)) {
                        recipientMap.set(row.technician_id, {
                            id: row.technician_id,
                            role: "technician",
                        });
                    }
                }
            }

            const { data: externalTechnicians, error: externalTechniciansError } =
                await adminClient
                    .from("profiles")
                    .select("id, role")
                    .eq("role", "technician")
                    .eq("technician_type", "external")
                    .eq("customer_id", relatedCustomerId);

            if (externalTechniciansError) {
                console.warn(
                    "[send-push-notification] external technician lookup skipped:",
                    externalTechniciansError.message,
                );
            } else {
                for (const user of (externalTechnicians ?? []) as ResolvedUser[]) {
                    if (isUuid(user.id)) recipientMap.set(user.id, user);
                }
            }
        }
    }

    if (genericRequestedRoles.length > 0) {
        const { data: roleUsers, error: roleUsersError } = await adminClient
            .from("profiles")
            .select("id, role")
            .in("role", genericRequestedRoles);

        if (roleUsersError) {
            return jsonResponse(
                {
                    success: false,
                    error: "Failed to resolve recipient roles",
                    details: roleUsersError.message,
                },
            );
        }

        for (const user of (roleUsers ?? []) as ResolvedUser[]) {
            if (isUuid(user.id)) recipientMap.set(user.id, user);
        }
    }

    const recipientIds = [...recipientMap.keys()];
    if (recipientIds.length === 0) {
        return jsonResponse({
            success: false,
            message: "No recipients found",
            recipientCount: 0,
            tokenCount: 0,
            notificationInsertedCount: 0,
            sentCount: 0,
            failedCount: 0,
            errors: [],
            diagnostics: {
                tokenPlatformCounts: {},
                fcmTokenCount: 0,
                webPushTokenCount: 0,
                firebaseProjectId: firebaseProjectId || undefined,
            },
        });
    }

    const { data: tokens, error: tokenError } = await adminClient
        .from("user_push_tokens")
        .select("user_id, token, platform, web_push_subscription")
        .in("user_id", recipientIds);

    if (tokenError) {
        return jsonResponse(
            {
                success: false,
                error: "Failed to load push tokens",
                details: tokenError.message,
            },
        );
    }

    const tokenMap = new Map<string, PushToken>();
    for (const row of (tokens ?? []) as PushToken[]) {
        const token = String(row.token ?? "").trim();
        if (token) tokenMap.set(token, row);
    }
    const uniqueTokens = [...tokenMap.values()];

    const notificationRows = recipientIds.map((userId) => ({
        user_id: userId,
        title,
        body,
        type,
        reference_table: referenceTable,
        reference_id: referenceId,
        data,
    }));

    const notificationInsertErrors: SendError[] = [];
    let insertedNotifications: Array<{ id: string }> = [];
    const { data: bulkInsertedNotifications, error: notificationError } =
        await adminClient
            .from("notifications")
            .insert(notificationRows)
            .select("id");

    if (notificationError) {
        notificationInsertErrors.push({
            message: "Failed to insert in-app notifications; push delivery will still be attempted",
            details: {
                message: notificationError.message,
                code: notificationError.code,
                details: notificationError.details,
                hint: notificationError.hint,
            },
        });

        for (const row of notificationRows) {
            const { data: insertedNotification, error: singleInsertError } =
                await adminClient
                    .from("notifications")
                    .insert(row)
                    .select("id")
                    .maybeSingle();

            if (singleInsertError) {
                notificationInsertErrors.push({
                    userId: row.user_id,
                    message: "Failed to insert in-app notification for recipient",
                    details: {
                        message: singleInsertError.message,
                        code: singleInsertError.code,
                        details: singleInsertError.details,
                        hint: singleInsertError.hint,
                    },
                });
            } else if (insertedNotification?.id) {
                insertedNotifications.push(insertedNotification);
            }
        }
    } else {
        insertedNotifications = bulkInsertedNotifications ?? [];
    }
    const notificationInsertedCount = insertedNotifications?.length ?? 0;

    if (uniqueTokens.length === 0) {
        return jsonResponse({
            success: false,
            message: "No push tokens found for resolved recipients",
            recipientCount: recipientIds.length,
            tokenCount: 0,
            notificationInsertedCount,
            sentCount: 0,
            failedCount: 0,
            errors: notificationInsertErrors,
            diagnostics: {
                tokenPlatformCounts: {},
                fcmTokenCount: 0,
                webPushTokenCount: 0,
                firebaseProjectId: firebaseProjectId || undefined,
            },
        });
    }

    const webPushTokens = uniqueTokens.filter(
        (row) => row.platform === "web" && row.web_push_subscription,
    );
    const fcmTokens = uniqueTokens.filter((row) => row.platform !== "web");
    const diagnostics: PushDiagnostics = {
        tokenPlatformCounts: getTokenPlatformCounts(uniqueTokens),
        fcmTokenCount: fcmTokens.length,
        webPushTokenCount: webPushTokens.length,
        firebaseProjectId: firebaseProjectId || undefined,
    };

    let accessToken: string | null = null;
    if (fcmTokens.length > 0) {
        if (!firebaseProjectId || !firebaseClientEmail || !firebasePrivateKey) {
            return jsonResponse({
                success: false,
                error: "Missing Firebase Edge Function secrets",
                recipientCount: recipientIds.length,
                tokenCount: uniqueTokens.length,
                notificationInsertedCount,
                sentCount: 0,
                failedCount: fcmTokens.length,
                errors: [
                    {
                        message: "FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are required for FCM tokens",
                    },
                ],
                diagnostics,
            });
        }

        try {
            accessToken = await getFirebaseAccessToken();
        } catch (error) {
            return jsonResponse({
                success: false,
                error: error instanceof Error ? error.message : "Firebase OAuth failed",
                recipientCount: recipientIds.length,
                tokenCount: uniqueTokens.length,
                notificationInsertedCount,
                sentCount: 0,
                failedCount: uniqueTokens.length,
                errors: [
                    {
                        message:
                            error instanceof Error
                                ? error.message
                                : "Firebase OAuth failed",
                    },
                ],
                diagnostics,
            });
        }
    }

    let webpush: WebPushClient | null = null;
    if (webPushTokens.length > 0 && vapidPublicKey && vapidPrivateKey) {
        try {
            webpush = await loadWebPush();
            webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
        } catch (error) {
            return jsonResponse({
                success: false,
                error: getErrorMessage(error, "Invalid Web Push VAPID configuration"),
                recipientCount: recipientIds.length,
                tokenCount: uniqueTokens.length,
                notificationInsertedCount,
                sentCount: 0,
                failedCount: webPushTokens.length,
                errors: [
                    {
                        message: getErrorMessage(
                            error,
                            "Invalid Web Push VAPID configuration",
                        ),
                        details: getErrorDetails(error),
                    },
                ],
                diagnostics,
            });
        }
    } else if (webPushTokens.length > 0) {
        return jsonResponse({
            success: false,
            error: "Missing Web Push VAPID keys",
            recipientCount: recipientIds.length,
            tokenCount: uniqueTokens.length,
            notificationInsertedCount,
            sentCount: 0,
            failedCount: webPushTokens.length,
            errors: [
                {
                    message: "WEB_PUSH_VAPID_PUBLIC_KEY and WEB_PUSH_VAPID_PRIVATE_KEY are required",
                },
            ],
            diagnostics,
        });
    }

    const fcmData = toStringData(type, referenceTable, referenceId, data);
    const endpoint = `https://fcm.googleapis.com/v1/projects/${firebaseProjectId}/messages:send`;
    const errors: SendError[] = [...notificationInsertErrors];
    const invalidTokens: string[] = [];
    let sentCount = 0;

    for (const row of fcmTokens) {
        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken ?? ""}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    message: {
                        token: row.token,
                        notification: { title, body },
                        data: fcmData,
                        android: {
                            priority: "high",
                            notification: {
                                icon: "ic_stat_onetrack",
                                color: "#008AEF",
                            },
                        },
                    },
                }),
            });

            const responsePayload = await response.json().catch(() => null);
            if (response.ok) {
                sentCount += 1;
                continue;
            }

            errors.push({
                token: row.token,
                userId: row.user_id,
                message:
                    responsePayload?.error?.message ??
                    response.statusText ??
                    "FCM send failed",
                details: responsePayload,
            });

            if (isInvalidFcmToken(responsePayload)) {
                invalidTokens.push(row.token);
            }
        } catch (error) {
            errors.push({
                token: row.token,
                userId: row.user_id,
                message: getErrorMessage(error, "FCM send failed"),
                details: getErrorDetails(error),
            });
        }
    }

    const webPayload = JSON.stringify({
        title,
        body,
        type,
        referenceTable,
        referenceId,
        data: fcmData,
        icon: "/icons/icon-192.webp",
        badge: "/icons/icon-96.webp",
    });

    for (const row of webPushTokens) {
        if (!webpush) break;

        try {
            await webpush.sendNotification(
                row.web_push_subscription,
                webPayload,
            );
            sentCount += 1;
        } catch (error) {
            errors.push({
                token: row.token,
                userId: row.user_id,
                message: getErrorMessage(error, "Web Push send failed"),
                details: getErrorDetails(error),
            });
            if (
                typeof error === "object" &&
                error &&
                "statusCode" in error &&
                [404, 410].includes(Number(error.statusCode))
            ) {
                invalidTokens.push(row.token);
            }
        }
    }

    if (invalidTokens.length > 0) {
        const { error: deleteError } = await adminClient
            .from("user_push_tokens")
            .delete()
            .in("token", [...new Set(invalidTokens)]);

        if (deleteError) {
            errors.push({
                message: "Failed to delete invalid push tokens",
                details: deleteError.message,
            });
        }
    }

    const failedCount = uniqueTokens.length - sentCount;
    return jsonResponse({
        success: sentCount > 0,
        recipientCount: recipientIds.length,
        tokenCount: uniqueTokens.length,
        notificationInsertedCount,
        sentCount,
        failedCount,
        errors,
        diagnostics,
    });
};

Deno.serve(async (req) => {
    try {
        return await handleRequest(req);
    } catch (error) {
        console.error("[send-push-notification] unhandled error:", error);
        return jsonResponse(
            {
                success: false,
                error: getErrorMessage(error),
                details: getErrorDetails(error),
            },
        );
    }
});
