import React from "react";
import {
    JOB_SCOPE_LABELS,
    JOB_SCOPES,
    SCOPE_DETAIL_CONFIG,
    normalizeJobScope,
} from "../utils/jobScopeCatalog";

const getDisplayValue = (value) => {
    const normalized = String(value ?? "").trim();
    return normalized || "-";
};

export default function ScopeDetailsCard({
    jobScope,
    dynamicData,
    acDetails,
    className = "",
}) {
    const normalizedScope = normalizeJobScope(jobScope || JOB_SCOPES.AC);

    if (normalizedScope === JOB_SCOPES.AC) {
        return (
            <div className={className}>
                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Detail Unit AC
                </p>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                    <p><span className="font-medium">Merk AC:</span> {getDisplayValue(acDetails?.brand)}</p>
                    <p><span className="font-medium">Tipe AC:</span> {getDisplayValue(acDetails?.type)}</p>
                    <p><span className="font-medium">Kapasitas AC:</span> {getDisplayValue(acDetails?.capacity)}</p>
                    <p><span className="font-medium">Lokasi Ruangan:</span> {getDisplayValue(acDetails?.roomLocation)}</p>
                    <p><span className="font-medium">Serial Number:</span> {getDisplayValue(acDetails?.serialNumber)}</p>
                </div>
            </div>
        );
    }

    const config = SCOPE_DETAIL_CONFIG[normalizedScope];
    const details = dynamicData && typeof dynamicData === "object" ? dynamicData : {};
    const checklist = Array.isArray(details.checklist) ? details.checklist : [];

    return (
        <div className={className}>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {`Detail ${JOB_SCOPE_LABELS[normalizedScope] ?? normalizedScope}`}
            </p>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
                {(config?.fields ?? []).map((field) => (
                    <p key={field.key}>
                        <span className="font-medium">{field.label}:</span>{" "}
                        {getDisplayValue(details[field.key])}
                    </p>
                ))}
                {checklist.length > 0 && (
                    <div>
                        <p className="font-medium">Checklist ARB:</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5">
                            {checklist.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </div>
                )}
                {(config?.fields?.length ?? 0) === 0 && checklist.length === 0 && (
                    <p>-</p>
                )}
            </div>
        </div>
    );
}
