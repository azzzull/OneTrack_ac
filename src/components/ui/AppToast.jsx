import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { observeToastPosition } from "../../utils/toastPosition";

const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-700",
    sky: "border-sky-200 bg-sky-50 text-sky-800",
};

export default function AppToast({ children, tone = "sky", className = "" }) {
    const toastRef = useRef(null);
    useLayoutEffect(() => observeToastPosition(toastRef.current), []);
    if (typeof document === "undefined") return null;

    return createPortal(
        <div
            ref={toastRef}
            className={`fixed z-[2147483647] rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${tones[tone] ?? tones.sky} ${className}`}
        >
            {children}
        </div>,
        document.body,
    );
}
