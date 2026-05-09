import useScopeDetailFields from "../hooks/useScopeDetailFields";
import ScopeDetailFieldsRenderer from "./scope-detail-fields/ScopeDetailFieldsRenderer";
import {
    JOB_SCOPES,
    getJobScopeLabel,
    normalizeJobScope,
} from "../utils/jobScopeCatalog";

const mergeDisplayValues = (dynamicData, acDetails) => ({
    ...(dynamicData && typeof dynamicData === "object" ? dynamicData : {}),
    ac_brand: acDetails?.brand ?? dynamicData?.ac_brand ?? "",
    ac_type: acDetails?.type ?? dynamicData?.ac_type ?? "",
    ac_capacity_pk:
        acDetails?.capacity ?? dynamicData?.ac_capacity_pk ?? "",
    room_location:
        acDetails?.roomLocation ?? dynamicData?.room_location ?? "",
    serial_number:
        acDetails?.serialNumber ?? dynamicData?.serial_number ?? "",
});

export default function ScopeDetailsCard({
    jobScope,
    dynamicData,
    acDetails,
    className = "",
}) {
    const normalizedScope = normalizeJobScope(jobScope || JOB_SCOPES.AC);
    const { fields, checklist, loading } =
        useScopeDetailFields(normalizedScope);
    const values = mergeDisplayValues(dynamicData, acDetails);
    const visibleChecklist = Array.isArray(values.checklist)
        ? values.checklist.map((item) =>
              typeof item === "object" && item
                  ? String(item.item_label ?? "").trim()
                  : String(item ?? "").trim(),
          )
        : checklist.map((item) =>
              typeof item === "object" && item
                  ? String(item.item_label ?? "").trim()
                  : String(item ?? "").trim(),
          );

    return (
        <div className={className}>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {`Detail ${getJobScopeLabel(normalizedScope)}`}
            </p>

            <div className="mt-3">
                <ScopeDetailFieldsRenderer
                    mode="display"
                    fields={fields}
                    values={values}
                    loading={loading}
                    scopeCode={normalizedScope}
                />
            </div>

            {visibleChecklist.length > 0 && (
                <div className="mt-4">
                    <p className="text-sm font-medium text-slate-700">
                        Checklist Pekerjaan
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                        {visibleChecklist.map((item, index) => (
                            <li key={`${item}-${index}`}>{item}</li>
                        ))}
                    </ul>
                </div>
            )}

            {!loading && fields.length === 0 && visibleChecklist.length === 0 && (
                <p className="mt-3 text-sm text-slate-500">-</p>
            )}
        </div>
    );
}
