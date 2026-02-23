import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export default function CustomSelect({
    value,
    onChange,
    options,
    placeholder = "Pilih",
    disabled = false,
    className = "",
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);

    const selected = useMemo(
        () => options.find((item) => item.value === value) ?? null,
        [options, value],
    );

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (!rootRef.current?.contains(event.target)) {
                setOpen(false);
            }
        };

        const handleEscape = (event) => {
            if (event.key === "Escape") setOpen(false);
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, []);

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen((prev) => !prev)}
                className={`mt-1 flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-left text-sm text-slate-700 outline-none transition hover:border-sky-300 hover:bg-white focus:border-sky-300 focus:bg-white disabled:cursor-not-allowed disabled:opacity-70 ${className}`}
            >
                <span className={selected ? "text-slate-700" : "text-slate-400"}>
                    {selected?.label ?? placeholder}
                </span>
                <ChevronDown
                    size={16}
                    className={`text-slate-500 transition ${open ? "rotate-180" : ""}`}
                />
            </button>

            {open && !disabled && (
                <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                    {options.map((item) => (
                        <button
                            key={`${item.value}`}
                            type="button"
                            onMouseDown={(event) => {
                                // Prevent label default behavior from re-triggering toggle.
                                event.preventDefault();
                            }}
                            onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                onChange(item.value);
                                setOpen(false);
                            }}
                            className={`flex w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm transition ${
                                item.value === value
                                    ? "bg-sky-100 text-sky-700"
                                    : "text-slate-700 hover:bg-slate-100"
                            }`}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
