import { useEffect } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useLocation, useNavigate } from "react-router-dom";

const DASHBOARD_PATHS = new Set(["/admin", "/technician", "/customer"]);

const dispatchBackEvent = () => {
    const event = new Event("onetrack:android-back", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
};

const clickCloseButtonInTopOverlay = () => {
    const overlays = Array.from(
        document.querySelectorAll(".fixed.inset-0, [role='dialog']"),
    ).filter((element) => {
        const style = window.getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
    });

    const overlay = overlays.at(-1);
    if (!overlay) return false;

    const closeButton = Array.from(
        overlay.querySelectorAll("button"),
    ).find((button) => {
        if (!(button instanceof HTMLButtonElement)) return false;

        const label = [
            button.getAttribute("aria-label"),
            button.getAttribute("title"),
            button.textContent,
        ]
            .filter(Boolean)
            .join(" ")
            .trim()
            .toLowerCase();

        if (/\b(close|cancel)\b|tutup|batal|kembali/.test(label)) return true;

        const hasOnlyIcon =
            button.querySelector("svg") &&
            button.textContent?.trim().length === 0;
        if (!hasOnlyIcon) return false;

        const overlayRect = overlay.getBoundingClientRect();
        const buttonRect = button.getBoundingClientRect();
        return buttonRect.top <= overlayRect.top + Math.max(96, overlayRect.height * 0.2);
    });

    if (!closeButton) return false;
    closeButton.click();
    return true;
};

const getDashboardPath = (role) => {
    if (role === "technician") return "/technician";
    if (role === "customer") return "/customer";
    return "/admin";
};

export default function useAndroidBackButton(role) {
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return undefined;

        let listenerHandle;
        const setupBackButton = async () => {
            listenerHandle = await CapacitorApp.addListener(
                "backButton",
                ({ canGoBack }) => {
                    if (dispatchBackEvent()) return;
                    if (clickCloseButtonInTopOverlay()) return;

                    if (DASHBOARD_PATHS.has(location.pathname)) {
                        CapacitorApp.exitApp();
                        return;
                    }

                    if (location.pathname === "/") {
                        CapacitorApp.exitApp();
                        return;
                    }

                    if (canGoBack) {
                        navigate(-1);
                        return;
                    }

                    navigate(getDashboardPath(role), { replace: true });
                },
            );
        };

        setupBackButton();

        return () => {
            listenerHandle?.remove?.();
        };
    }, [location.pathname, navigate, role]);
}
