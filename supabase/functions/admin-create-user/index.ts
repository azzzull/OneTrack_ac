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

async function isAdmin(authHeader: string) {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return { ok: false, message: "Unauthorized" };

    const requesterClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userError } =
        await requesterClient.auth.getUser(token);
    if (userError || !userData?.user)
        return { ok: false, message: "Unauthorized" };

    const { data: rpcData, error: rpcError } =
        await requesterClient.rpc("is_admin");
    if (!rpcError && rpcData === true) return { ok: true, message: "ok" };

    const { data: profile, error: profileError } = await requesterClient
        .from("profiles")
        .select("role")
        .eq("id", userData.user.id)
        .single();

    if (profileError) return { ok: false, message: "Forbidden" };
    if (profile?.role !== "admin") return { ok: false, message: "Forbidden" };
    return { ok: true, message: "ok" };
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS")
        return new Response("ok", { headers: corsHeaders });

    if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
        return new Response(
            JSON.stringify({ error: "Missing Supabase env vars" }),
            {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const adminCheck = await isAdmin(authHeader);
    if (!adminCheck.ok) {
        return new Response(JSON.stringify({ error: adminCheck.message }), {
            status: adminCheck.message === "Unauthorized" ? 401 : 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const email = String(body.email ?? "")
        .trim()
        .toLowerCase();
    const password = String(body.password ?? "");
    const roleInput = String(body.role ?? "customer")
        .trim()
        .toLowerCase();

    const firstName = String(body.first_name ?? body.firstName ?? "").trim();
    const lastName = String(body.last_name ?? body.lastName ?? "").trim();
    const fullNameInput = String(
        body.full_name ?? body.fullName ?? body.name ?? "",
    ).trim();
    const fullName = fullNameInput || `${firstName} ${lastName}`.trim();
    const phone = String(body.phone ?? "").trim();

    if (!email || !password) {
        return new Response(
            JSON.stringify({ error: "email and password are required" }),
            {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    }

    if (password.length < 6) {
        return new Response(
            JSON.stringify({ error: "Password minimal 6 karakter" }),
            {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    // Validasi role terhadap master_roles supaya trigger profile tidak gagal FK
    const { data: roleRow, error: roleError } = await adminClient
        .from("master_roles")
        .select("name")
        .eq("name", roleInput)
        .maybeSingle();

    if (roleError) {
        return new Response(
            JSON.stringify({
                error: `Role validation failed: ${roleError.message}`,
                details: roleError.details,
                hint: roleError.hint,
            }),
            {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    }

    if (!roleRow?.name) {
        return new Response(
            JSON.stringify({ error: `Role tidak valid: ${roleInput}` }),
            {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    }

    const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
            role: roleRow.name,
            first_name: firstName,
            last_name: lastName,
            full_name: fullName,
            phone,
        },
    });

    if (error) {
        console.error("admin-create-user error", error);
        return new Response(
            JSON.stringify({
                error: error.message,
                details: error.details,
                hint: error.hint,
            }),
            {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    }

    // User created successfully; now insert profile directly (bypass trigger)
    const profileName =
        `${firstName} ${lastName}`.trim() || email.split("@")[0];
    const { error: profileError } = await adminClient
        .from("profiles")
        .insert({
            id: data.user?.id,
            name: profileName,
            email: data.user?.email,
            first_name: firstName,
            last_name: lastName,
            phone,
            role: roleRow.name,
        })
        .select()
        .single();

    if (profileError) {
        console.error("profile insert error", profileError);
        // Log it but don't fail; user is already created
    }

    return new Response(
        JSON.stringify({
            success: true,
            user_id: data.user?.id ?? null,
            email: data.user?.email ?? email,
            role: roleRow.name,
        }),
        {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
    );
});
