const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const eventLabels: Record<string, string> = {
    request_created: "Accommodation request baru",
    request_approved: "Accommodation request approved",
    request_rejected: "Accommodation request rejected",
    realization_created: "Realisasi accommodation baru",
};

const formatCurrency = (value: unknown) =>
    new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
    }).format(Number(value ?? 0));

const buildMessage = (event: string, payload: Record<string, unknown>) => {
    const title =
        String(
            payload.request_title ??
                payload.title ??
                payload.accommodation_request_id ??
                "-",
        ).trim() || "-";
    const amount =
        payload.approved_amount ?? payload.requested_amount ?? payload.amount;
    const lines = [
        `OneTrack - ${eventLabels[event] ?? "Accommodation update"}`,
        `Title: ${title}`,
    ];

    if (amount !== undefined && amount !== null) {
        lines.push(`Amount: ${formatCurrency(amount)}`);
    }

    if (payload.status) lines.push(`Status: ${payload.status}`);
    if (payload.rejection_reason) {
        lines.push(`Reason: ${payload.rejection_reason}`);
    }

    return lines.join("\n");
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
    const chatId = Deno.env.get("TELEGRAM_CHAT_ID") ?? "";

    if (!botToken || !chatId) {
        return new Response(
            JSON.stringify({
                success: false,
                skipped: true,
                reason: "Telegram env vars are not configured",
            }),
            {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    }

    let body: { event?: string; payload?: Record<string, unknown> };
    try {
        body = await req.json();
    } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const event = String(body.event ?? "update");
    const payload = body.payload ?? {};
    const text = buildMessage(event, payload);

    const telegramResponse = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                disable_web_page_preview: true,
            }),
        },
    );

    const telegramPayload = await telegramResponse.json().catch(() => null);
    if (!telegramResponse.ok) {
        return new Response(
            JSON.stringify({
                error: "Telegram notification failed",
                details: telegramPayload,
            }),
            {
                status: 502,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    }

    return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
});
