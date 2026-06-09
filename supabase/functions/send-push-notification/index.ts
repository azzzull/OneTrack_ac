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
};

type SendError = {
    token?: string;
    userId?: string;
    message: string;
    details?: unknown;
};

const jsonResponse = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

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

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
    }

    if (
        !supabaseUrl ||
        !anonKey ||
        !serviceRoleKey ||
        !firebaseProjectId ||
        !firebaseClientEmail ||
        !firebasePrivateKey
    ) {
        return jsonResponse(
            {
                success: false,
                error: "Missing Supabase or Firebase Edge Function secrets",
            },
            500,
        );
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return jsonResponse({ success: false, error: "Unauthorized" }, 401);

    const requesterClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } =
        await requesterClient.auth.getUser(jwt);
    if (userError || !userData?.user) {
        return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }

    const requesterId = userData.user.id;
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
            500,
        );
    }

    const requesterRole = String(requesterProfile?.role ?? "");
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

    if (
        (requestedRoles.length > 0 ||
            requestedUserIds.some((id) => id !== requesterId)) &&
        !canSendArbitrary
    ) {
        return jsonResponse(
            {
                success: false,
                error: "Forbidden. Only admin and management can send push notifications to roles or other users.",
            },
            403,
        );
    }

    const recipientMap = new Map<string, ResolvedUser>();
    for (const userId of requestedUserIds) recipientMap.set(userId, { id: userId });

    if (requestedRoles.length > 0) {
        const { data: roleUsers, error: roleUsersError } = await adminClient
            .from("profiles")
            .select("id, role")
            .in("role", requestedRoles);

        if (roleUsersError) {
            return jsonResponse(
                {
                    success: false,
                    error: "Failed to resolve recipient roles",
                    details: roleUsersError.message,
                },
                500,
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
        });
    }

    const { data: tokens, error: tokenError } = await adminClient
        .from("user_push_tokens")
        .select("user_id, token")
        .in("user_id", recipientIds);

    if (tokenError) {
        return jsonResponse(
            {
                success: false,
                error: "Failed to load push tokens",
                details: tokenError.message,
            },
            500,
        );
    }

    const tokenMap = new Map<string, PushToken>();
    for (const row of (tokens ?? []) as PushToken[]) {
        const token = String(row.token ?? "").trim();
        if (token) tokenMap.set(token, { user_id: row.user_id, token });
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

    const { data: insertedNotifications, error: notificationError } =
        await adminClient
            .from("notifications")
            .insert(notificationRows)
            .select("id");

    if (notificationError) {
        return jsonResponse(
            {
                success: false,
                error: "Failed to insert notifications",
                details: notificationError.message,
                recipientCount: recipientIds.length,
                tokenCount: uniqueTokens.length,
                notificationInsertedCount: 0,
                sentCount: 0,
                failedCount: 0,
                errors: [],
            },
            500,
        );
    }

    if (uniqueTokens.length === 0) {
        return jsonResponse({
            success: false,
            message: "No push tokens found for resolved recipients",
            recipientCount: recipientIds.length,
            tokenCount: 0,
            notificationInsertedCount: insertedNotifications?.length ?? 0,
            sentCount: 0,
            failedCount: 0,
            errors: [],
        });
    }

    let accessToken: string;
    try {
        accessToken = await getFirebaseAccessToken();
    } catch (error) {
        return jsonResponse(
            {
                success: false,
                error: error instanceof Error ? error.message : "Firebase OAuth failed",
                recipientCount: recipientIds.length,
                tokenCount: uniqueTokens.length,
                notificationInsertedCount: insertedNotifications?.length ?? 0,
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
            },
            502,
        );
    }

    const fcmData = toStringData(type, referenceTable, referenceId, data);
    const endpoint = `https://fcm.googleapis.com/v1/projects/${firebaseProjectId}/messages:send`;
    const errors: SendError[] = [];
    const invalidTokens: string[] = [];
    let sentCount = 0;

    for (const row of uniqueTokens) {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                message: {
                    token: row.token,
                    notification: { title, body },
                    data: fcmData,
                    android: { priority: "high" },
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
        notificationInsertedCount: insertedNotifications?.length ?? 0,
        sentCount,
        failedCount,
        errors,
    });
});
