import { createContext, useCallback, useMemo, useState } from "react";

const DialogContext = createContext(null);

const baseButtonClass =
    "inline-flex cursor-pointer items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition";

export function DialogProvider({ children }) {
    const [dialog, setDialog] = useState(null);

    const closeDialog = useCallback((result) => {
        setDialog((current) => {
            if (current?.resolve) {
                current.resolve(result);
            }
            return null;
        });
    }, []);

    const openDialog = useCallback((config) => {
        return new Promise((resolve) => {
            setDialog({ ...config, resolve });
        });
    }, []);

    const value = useMemo(
        () => ({
            alert: (message, options = {}) =>
                openDialog({
                    type: "alert",
                    title: options.title ?? "Informasi",
                    message,
                    confirmText: options.confirmText ?? "OK",
                }),
            confirm: (message, options = {}) =>
                openDialog({
                    type: "confirm",
                    title: options.title ?? "Konfirmasi",
                    message,
                    confirmText: options.confirmText ?? "Ya, lanjutkan",
                    cancelText: options.cancelText ?? "Batal",
                    danger: Boolean(options.danger),
                }),
        }),
        [openDialog],
    );

    return (
        <DialogContext.Provider value={value}>
            {children}

            {dialog && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
                        <h3 className="text-base font-semibold text-slate-900">
                            {dialog.title}
                        </h3>
                        <p className="mt-2 text-sm text-slate-600">
                            {dialog.message}
                        </p>
                        <div className="mt-5 flex items-center justify-end gap-2">
                            {dialog.type === "confirm" && (
                                <button
                                    type="button"
                                    onClick={() => closeDialog(false)}
                                    className={`${baseButtonClass} border border-slate-200 bg-white text-slate-700 hover:bg-slate-100`}
                                >
                                    {dialog.cancelText}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => closeDialog(true)}
                                className={`${baseButtonClass} ${
                                    dialog.danger
                                        ? "bg-red-500 text-white hover:bg-red-600"
                                        : "bg-sky-500 text-white hover:bg-sky-600"
                                }`}
                            >
                                {dialog.confirmText}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DialogContext.Provider>
    );
}

export default DialogContext;
