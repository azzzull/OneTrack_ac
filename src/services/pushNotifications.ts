import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import supabase from "../supabaseClient";

type PushTokenRow = {
    id: string;
    user_id: string;
    token: string;
    platform: string;
    device_name: string | null;
    created_at: string;
    updated_at: string;
};

let isRegistering = false;
let listenersRegistered = false;
let registeredUserId: string | null = null;
let lastFcmToken: string | null = null;

const getDeviceName = () => {
    if (typeof navigator === "undefined") return null;
    return navigator.userAgent || null;
};

const getCurrentUserId = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
        console.warn("[Push] Failed to read Supabase auth user:", error.message);
        return null;
    }
    return data.user?.id ?? null;
};

const getCurrentUserRole = async () => {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

    if (error) {
        console.warn("[Push] Failed to read profile role:", error.message);
        return null;
    }

    return String(data?.role ?? "").trim().toLowerCase() || null;
};

const getNotificationTargetPath = (data: Record<string, unknown>, role: string | null) => {
    const table = String(data.referenceTable ?? data.reference_table ?? "")
        .trim()
        .toLowerCase();

    if (table === "requests" || table === "jobs") {
        if (role === "technician") return "/technician/requests";
        if (role === "customer") return "/services";
        return "/requests";
    }

    if (
        table === "accommodation_requests" ||
        table === "accommodation_realizations" ||
        table === "accommodations"
    ) {
        if (role === "technician") return "/accommodation";
        if (role === "management") return "/management/accommodation";
        return "/admin/accommodation";
    }

    if (role === "technician") return "/technician";
    if (role === "customer") return "/customer";
    return "/admin";
};

const saveFcmTokenToSupabase = async (token: string) => {
    const userId = await getCurrentUserId();
    if (!userId) {
        console.info("[Push] Token received but user is not logged in. Skipping save.");
        return null;
    }

    const { data, error } = await supabase
        .rpc("save_user_push_token", {
            p_token: token,
            p_platform: "android",
            p_device_name: getDeviceName(),
        })
        .single<PushTokenRow>();

    if (error) {
        console.error("[Push] Token save error:", error);
        return null;
    }

    console.log("[Push] Token saved to Supabase:", {
        id: data.id,
        user_id: data.user_id,
        platform: data.platform,
        updated_at: data.updated_at,
    });
    return data;
};

const registerPushListeners = () => {
    if (listenersRegistered) return;

    PushNotifications.addListener("registration", async (token) => {
        lastFcmToken = token.value;
        console.log("[Push] FCM token received:", token.value);
        await saveFcmTokenToSupabase(token.value);
    });

    PushNotifications.addListener("registrationError", (error) => {
        console.error("[Push] Registration error:", error);
    });

    PushNotifications.addListener("pushNotificationReceived", (notification) => {
        console.log("[Push] Notification received:", notification);
    });

    PushNotifications.addListener("pushNotificationActionPerformed", async (notification) => {
        console.log("[Push] Notification clicked:", notification);
        const role = await getCurrentUserRole();
        const targetPath = getNotificationTargetPath(
            notification.notification?.data ?? {},
            role,
        );
        window.location.assign(targetPath);
    });

    listenersRegistered = true;
};

export async function registerPushNotifications(userId?: string) {
    if (!Capacitor.isNativePlatform()) {
        console.info("[Push] Skipped: Capacitor native platform not detected.");
        return null;
    }

    const authUserId = userId ?? (await getCurrentUserId());
    if (!authUserId) {
        console.info("[Push] Skipped: Supabase auth user is not available.");
        return null;
    }

    if (registeredUserId === authUserId && lastFcmToken) {
        await saveFcmTokenToSupabase(lastFcmToken);
        return true;
    }

    if (isRegistering) {
        return null;
    }

    isRegistering = true;

    try {
        const permission = await PushNotifications.requestPermissions();

        if (permission.receive !== "granted") {
            console.log("[Push] Notification permission denied");
            return null;
        }

        console.log("[Push] Notification permission granted");
        registerPushListeners();

        await PushNotifications.register();
        registeredUserId = authUserId;
        return true;
    } catch (error) {
        console.error("[Push] Failed to register push notifications:", error);
        return false;
    } finally {
        isRegistering = false;
    }
}
