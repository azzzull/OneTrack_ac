import supabase from "../supabaseClient";

const WEB_PUSH_VAPID_PUBLIC_KEY = import.meta.env
    .VITE_WEB_PUSH_VAPID_PUBLIC_KEY;

export const isStandalonePwa = () =>
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true;

export const isIosBrowser = () =>
    /iphone|ipad|ipod/i.test(window.navigator.userAgent || "");

export const isWebPushSupported = () =>
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

const urlBase64ToUint8Array = (base64String) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = `${base64String}${padding}`
        .replace(/-/g, "+")
        .replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i += 1) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
};

const getDeviceName = () => navigator.userAgent || "Web Push";

export const getWebPushReadiness = () => {
    if (!isWebPushSupported()) {
        return {
            canEnable: false,
            reason: "Browser belum mendukung Web Push API.",
        };
    }

    if (!isStandalonePwa()) {
        return {
            canEnable: false,
            reason: isIosBrowser()
                ? "Tambahkan OneTrack ke Home Screen, lalu buka dari icon Home Screen untuk mengaktifkan notifikasi."
                : "Buka OneTrack sebagai installed app/standalone untuk mengaktifkan notifikasi.",
        };
    }

    if (!WEB_PUSH_VAPID_PUBLIC_KEY) {
        return {
            canEnable: false,
            reason: "VITE_WEB_PUSH_VAPID_PUBLIC_KEY belum dikonfigurasi.",
        };
    }

    return { canEnable: true, reason: "" };
};

export const getExistingWebPushSubscription = async () => {
    if (!isWebPushSupported()) return null;
    const registration = await navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
};

export const registerWebPushNotifications = async () => {
    const readiness = getWebPushReadiness();
    if (!readiness.canEnable) {
        throw new Error(readiness.reason);
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
        throw new Error("Izin notifikasi tidak diberikan.");
    }

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
        existing ||
        (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(
                WEB_PUSH_VAPID_PUBLIC_KEY,
            ),
        }));

    const subscriptionJson = subscription.toJSON();
    const { endpoint, keys } = subscriptionJson;

    const { data, error } = await supabase
        .rpc("save_user_web_push_subscription", {
            p_endpoint: endpoint,
            p_p256dh: keys?.p256dh ?? "",
            p_auth: keys?.auth ?? "",
            p_subscription: subscriptionJson,
            p_device_name: getDeviceName(),
        })
        .single();

    if (error) throw error;
    return data;
};
