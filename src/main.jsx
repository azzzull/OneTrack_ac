import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { DialogProvider } from "./context/DialogContext";
import "./index.css";

class AppErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error) {
        console.error("[App] render failed", error);
    }

    render() {
        if (this.state.error) {
            return (
                <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5">
                    <section className="max-w-md rounded-xl border border-red-200 bg-white p-5 text-center shadow-sm">
                        <h1 className="text-base font-bold text-red-700">
                            Halaman gagal dimuat
                        </h1>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                            Terjadi error render pada halaman. Silakan refresh
                            halaman setelah dev server selesai memuat ulang.
                        </p>
                        {import.meta.env.DEV && (
                            <p className="mt-3 rounded-lg bg-red-50 p-3 text-left text-xs font-semibold text-red-700">
                                {this.state.error?.message}
                            </p>
                        )}
                    </section>
                </main>
            );
        }

        return this.props.children;
    }
}

ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
        <AppErrorBoundary>
            <BrowserRouter>
                <DialogProvider>
                    <AuthProvider>
                        <App />
                    </AuthProvider>
                </DialogProvider>
            </BrowserRouter>
        </AppErrorBoundary>
    </React.StrictMode>,
);

// Register Service Worker for offline support and Web Push in production only.
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
}

if (import.meta.env.DEV && "serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
        try {
            const registrations =
                await navigator.serviceWorker.getRegistrations();
            await Promise.all(
                registrations.map((registration) => registration.unregister()),
            );

            if ("caches" in window) {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map((name) => caches.delete(name)));
            }
        } catch (error) {
            console.warn("Development Service Worker cleanup failed:", error);
        }
    });
}
