/// <reference lib="deno.ns" />
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

async function isAdmin(authHeader: string) {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return { ok: false, message: "Unauthorized", userId: null };

    const requesterClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userError } =
        await requesterClient.auth.getUser(token);
    if (userError || !userData?.user) {
        return { ok: false, message: "Unauthorized", userId: null };
    }

    const { data: rpcData, error: rpcError } =
        await requesterClient.rpc("is_admin");
    if (!rpcError && rpcData === true) {
        return { ok: true, message: "ok", userId: userData.user.id };
    }

    const { data: profile, error: profileError } = await requesterClient
        .from("profiles")
        .select("role")
        .eq("id", userData.user.id)
        .single();

    if (profileError) {
        return { ok: false, message: "Forbidden", userId: userData.user.id };
    }
    if (!["admin", "management"].includes(String(profile?.role ?? ""))) {
        return { ok: false, message: "Forbidden", userId: userData.user.id };
    }
    return { ok: true, message: "ok", userId: userData.user.id };
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
    }

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
        return jsonResponse({ error: "Missing Supabase env vars" }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const adminCheck = await isAdmin(authHeader);
    if (!adminCheck.ok) {
        return jsonResponse(
            { error: adminCheck.message },
            adminCheck.message === "Unauthorized" ? 401 : 403,
        );
    }

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const userId = String(body.user_id ?? body.userId ?? "").trim();
    if (!isUuid(userId)) {
        return jsonResponse({ error: "user_id wajib berupa UUID valid" }, 400);
    }

    if (adminCheck.userId === userId) {
        return jsonResponse(
            { error: "Admin tidak bisa menghapus akun sendiri" },
            400,
        );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const cleanupErrors: Array<{ step: string; message: string }> = [];

    const deleteFrom = async (
        table: string,
        column: string,
        value: string,
        step: string,
    ) => {
        const { error } = await adminClient
            .from(table)
            .delete()
            .eq(column, value);
        if (error) cleanupErrors.push({ step, message: error.message });
    };

    await deleteFrom("user_push_tokens", "user_id", userId, "user_push_tokens");
    await deleteFrom("notifications", "user_id", userId, "notifications");

    const { error: unlinkCustomerError } = await adminClient
        .from("master_customers")
        .update({ user_id: null })
        .eq("user_id", userId);
    if (unlinkCustomerError) {
        cleanupErrors.push({
            step: "master_customers",
            message: unlinkCustomerError.message,
        });
    }

    const { error: profileDeleteError } = await adminClient
        .from("profiles")
        .delete()
        .eq("id", userId);
    let profileSoftDeleted = false;
    if (profileDeleteError) {
        const { error: profileUpdateError } = await adminClient
            .from("profiles")
            .update({
                is_active: false,
                customer_id: null,
            })
            .eq("id", userId);

        if (profileUpdateError) {
            cleanupErrors.push({
                step: "profiles",
                message: `${profileDeleteError.message}; soft delete failed: ${profileUpdateError.message}`,
            });
        } else {
            profileSoftDeleted = true;
        }
    }

    if (cleanupErrors.length > 0) {
        return jsonResponse(
            {
                success: false,
                error: "Gagal membersihkan data user",
                details: cleanupErrors,
            },
            400,
        );
    }

    const { error: deleteAuthError } =
        await adminClient.auth.admin.deleteUser(userId);
    if (deleteAuthError) {
        const message = String(deleteAuthError.message ?? "");
        if (!message.toLowerCase().includes("user not found")) {
            return jsonResponse(
                {
                    success: false,
                    error: message || "Gagal menghapus auth user",
                    details: deleteAuthError,
                },
                400,
            );
        }
    }

    return jsonResponse({
        success: true,
        user_id: userId,
        deleted: true,
        profile_soft_deleted: profileSoftDeleted,
    });
});
