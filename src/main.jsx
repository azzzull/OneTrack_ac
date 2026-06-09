import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { DialogProvider } from "./context/DialogContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
        <BrowserRouter>
            <DialogProvider>
                <AuthProvider>
                    <App />
                </AuthProvider>
            </DialogProvider>
        </BrowserRouter>
    </React.StrictMode>,
);

// Register Service Worker for offline support.
// In Vite dev, a stale SW can cache optimized React chunks and cause invalid hook calls.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker
            .register("/sw.js")
            .then((registration) => {
                console.log("Service Worker registered:", registration);
            })
            .catch((error) => {
                console.error("Service Worker registration failed:", error);
            });
    });
} else if ("serviceWorker" in navigator) {
    navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
            Promise.all(registrations.map((registration) => registration.unregister())),
        )
        .catch((error) => {
            console.warn("Service Worker unregister skipped:", error);
        });

    if ("caches" in window) {
        caches
            .keys()
            .then((cacheNames) =>
                Promise.all(
                    cacheNames
                        .filter((cacheName) => cacheName.startsWith("onetrack-"))
                        .map((cacheName) => caches.delete(cacheName)),
                ),
            )
            .catch((error) => {
                console.warn("Service Worker cache cleanup skipped:", error);
            });
    }
}
