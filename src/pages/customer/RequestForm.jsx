import { useCallback, useEffect, useMemo, useState } from "react";
import { List } from "lucide-react";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import { useAuth } from "../../context/useAuth";
import { useDialog } from "../../context/useDialog";
import useJobScopeOptions from "../../hooks/useJobScopeOptions";
import useScopeDetailFields from "../../hooks/useScopeDetailFields";
import CustomSelect from "../../components/ui/CustomSelect";
import ScopeDetailFieldsRenderer from "../../components/scope-detail-fields/ScopeDetailFieldsRenderer";
import supabase from "../../supabaseClient";
import {
    JOB_SCOPES,
    JOB_SCOPE_LABELS,
    normalizeJobScope,
} from "../../utils/jobScopeCatalog";
import {
    buildScopeDetailValuesPayload,
    validateScopeDetailValues,
} from "../../services/scopeDetailFieldsService";

const inputClass =
    "mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-300 focus:bg-white";

export default function CustomerRequestFormPage() {
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const { user } = useAuth();
    const { alert: showAlert } = useDialog();
    const { labels: jobScopeLabels } = useJobScopeOptions();

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [linkedCustomers, setLinkedCustomers] = useState([]);
    const [projects, setProjects] = useState([]);
    const [acBrands, setAcBrands] = useState([]);
    const [acTypes, setAcTypes] = useState([]);
    const [acPks, setAcPks] = useState([]);
    const [form, setForm] = useState({
        customerId: "",
        projectId: "",
        acBrand: "",
        acType: "",
        acCapacityPk: "",
        roomLocation: "",
        troubleDescription: "",
        scopeDetails: {},
    });

    const availableProjects = useMemo(() => {
        return projects;
    }, [projects]);

    const selectedProject = useMemo(
        () =>
            availableProjects.find((item) => item.id === form.projectId) ??
            null,
        [availableProjects, form.projectId],
    );
    const activeJobScope = normalizeJobScope(
        selectedProject?.job_scope ?? JOB_SCOPES.AC,
    );
    const {
        fields: activeScopeDetailFields,
        checklist: activeScopeChecklist,
        loading: scopeFieldsLoading,
    } =
        useScopeDetailFields(activeJobScope);
    const activeScopeChecklistItems = useMemo(
        () =>
            activeScopeChecklist.map((item) =>
                typeof item === "object" && item
                    ? {
                          key: String(item.id ?? item.item_label ?? ""),
                          label: String(item.item_label ?? "").trim(),
                      }
                    : {
                          key: String(item ?? ""),
                          label: String(item ?? "").trim(),
                      },
            ),
        [activeScopeChecklist],
    );
    const scopeFieldSelectOptions = useMemo(
        () => ({
            ac_brand: acBrands.map((item) => ({
                value: item.name,
                label: item.name,
            })),
            ac_type: acTypes.map((item) => ({
                value: item.name,
                label: item.name,
            })),
            ac_capacity_pk: acPks.map((item) => ({
                value: item.label,
                label: item.label,
            })),
        }),
        [acBrands, acTypes, acPks],
    );

    const selectedCustomer = useMemo(
        () =>
            linkedCustomers.find(
                (item) =>
                    item.id ===
                    (selectedProject?.customer_id ?? form.customerId),
            ) ?? null,
        [form.customerId, linkedCustomers, selectedProject?.customer_id],
    );

    useEffect(() => {
        setForm((prev) => {
            if (!prev.scopeDetails || Object.keys(prev.scopeDetails).length === 0) {
                return prev;
            }
            return {
                ...prev,
                scopeDetails: {},
            };
        });
    }, [activeJobScope]);

    const fetchCustomerContext = useCallback(async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            const email = String(user.email ?? "").trim();

            const [
                customersByUserRes,
                customersByEmailRes,
                brandsRes,
                typesRes,
                pksRes,
            ] = await Promise.all([
                supabase
                    .from("master_customers")
                    .select("*")
                    .eq("user_id", user.id),
                email
                    ? supabase
                          .from("master_customers")
                          .select("*")
                          .eq("email", email)
                    : Promise.resolve({ data: [], error: null }),
                supabase
                    .from("master_ac_brands")
                    .select("*")
                    .order("name", { ascending: true }),
                supabase
                    .from("master_ac_types")
                    .select("*")
                    .order("name", { ascending: true }),
                supabase
                    .from("master_ac_pks")
                    .select("*")
                    .order("label", { ascending: true }),
            ]);

            if (customersByUserRes.error) throw customersByUserRes.error;
            if (customersByEmailRes?.error) throw customersByEmailRes.error;
            if (brandsRes.error) throw brandsRes.error;
            if (typesRes.error) throw typesRes.error;
            if (pksRes.error) throw pksRes.error;

            const customerMap = new Map();
            for (const item of [
                ...(customersByUserRes.data ?? []),
                ...(customersByEmailRes?.data ?? []),
            ]) {
                customerMap.set(item.id, item);
            }
            const customers = Array.from(customerMap.values()).sort((a, b) =>
                String(a.name ?? "").localeCompare(String(b.name ?? "")),
            );

            setLinkedCustomers(customers);
            setAcBrands(brandsRes.data ?? []);
            setAcTypes(typesRes.data ?? []);
            setAcPks(pksRes.data ?? []);

            const customerIds = customers.map((item) => item.id);
            if (customerIds.length === 0) {
                setProjects([]);
                return;
            }

            const { data: projectsData, error: projectsError } = await supabase
                .from("master_projects")
                .select("*")
                .in("customer_id", customerIds)
                .order("project_name", { ascending: true });
            if (projectsError) throw projectsError;
            setProjects(projectsData ?? []);
        } catch (error) {
            console.error("Error loading customer request context:", error);
            setLinkedCustomers([]);
            setProjects([]);
            setAcBrands([]);
            setAcTypes([]);
            setAcPks([]);
        } finally {
            setLoading(false);
        }
    }, [user?.email, user?.id]);

    useEffect(() => {
        fetchCustomerContext();
    }, [fetchCustomerContext]);

    useEffect(() => {
        const isValid = availableProjects.some(
            (item) => item.id === form.projectId,
        );
        if (!isValid && form.projectId) {
            setForm((prev) => ({
                ...prev,
                projectId: "",
            }));
        }
    }, [availableProjects, form.projectId]);

    const setScopeDetail = useCallback((key, value) => {
        setForm((prev) => ({
            ...prev,
            scopeDetails: {
                ...(prev.scopeDetails ?? {}),
                [key]: value,
            },
        }));
    }, []);

    const toggleScopeChecklist = useCallback((item) => {
        setForm((prev) => {
            const current = Array.isArray(prev.scopeDetails?.checklist)
                ? prev.scopeDetails.checklist
                : [];
            const nextChecklist = current.includes(item)
                ? current.filter((value) => value !== item)
                : [...current, item];
            return {
                ...prev,
                scopeDetails: {
                    ...(prev.scopeDetails ?? {}),
                    checklist: nextChecklist,
                },
            };
        });
    }, []);

    const submitRequest = async (event) => {
        event.preventDefault();

        if (!selectedCustomer) {
            await showAlert("Data customer belum terhubung. Hubungi admin.", {
                title: "Customer Belum Terdaftar",
            });
            return;
        }

        if (scopeFieldsLoading) {
            await showAlert("Konfigurasi field scope masih dimuat.", {
                title: "Mohon Tunggu",
            });
            return;
        }

        const missingFields = validateScopeDetailValues(
            activeScopeDetailFields,
            form.scopeDetails,
        );

        if (missingFields.length > 0) {
            await showAlert(
                `Lengkapi field berikut: ${missingFields
                    .map((field) => field.field_label)
                    .join(", ")}`,
                {
                    title: "Data Belum Lengkap",
                },
            );
            return;
        }

        setSubmitting(true);
        try {
            const detailValues = buildScopeDetailValuesPayload(
                activeScopeDetailFields,
                form.scopeDetails,
            );
            const payload = {
                title: selectedProject?.project_name ?? "",
                status: "requested",
                job_scope: activeJobScope,
                location:
                    selectedProject?.location ??
                    selectedCustomer?.location ??
                    "",
                customer_name:
                    selectedCustomer.name ?? user?.email ?? "Customer",
                customer_phone:
                    selectedProject?.phone ?? selectedCustomer?.phone ?? "",
                address:
                    selectedProject?.address ?? selectedCustomer?.address ?? "",
                customer_id: selectedCustomer.id,
                project_id: selectedProject?.id ?? null,
                ac_brand: detailValues.ac_brand ?? null,
                ac_type: detailValues.ac_type ?? null,
                ac_capacity_pk: detailValues.ac_capacity_pk ?? null,
                room_location: detailValues.room_location ?? null,
                serial_number: detailValues.serial_number ?? null,
                trouble_description: form.troubleDescription,
                dynamic_data: {
                    ...detailValues,
                    ...(Array.isArray(form.scopeDetails?.checklist) &&
                    form.scopeDetails.checklist.length > 0
                        ? { checklist: form.scopeDetails.checklist }
                        : {}),
                },
                created_by: user?.id ?? null,
            };

            const { error } = await supabase.from("requests").insert(payload);
            if (error) throw error;

            setForm((prev) => ({
                ...prev,
                acBrand: "",
                acType: "",
                acCapacityPk: "",
                roomLocation: "",
                troubleDescription: "",
                scopeDetails: {},
            }));

            await showAlert("Request pekerjaan berhasil dikirim.", {
                title: "Request Terkirim",
            });
        } catch (error) {
            console.error("Error creating customer request:", error);
            await showAlert("Gagal mengirim request. Silahkan hubungi Admin.", {
                title: "Request Gagal",
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-sky-50">
            <div className="flex min-h-screen">
                <Sidebar
                    collapsed={sidebarCollapsed}
                    onToggle={toggleSidebar}
                />

                <main className="min-w-0 flex-1 p-4 pb-24 md:p-8 md:pb-8">
                    <h1 className="text-2xl font-semibold text-slate-800 md:text-3xl">
                        Request Pekerjaan
                    </h1>
                    <p className="mt-1 text-slate-600">
                        Buat request pekerjaan baru untuk proyek anda.
                    </p>

                    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
                        {loading ? (
                            <p className="text-sm text-slate-500">
                                Memuat data referensi...
                            </p>
                        ) : (
                            <form
                                onSubmit={submitRequest}
                                className="grid grid-cols-1 gap-4 md:grid-cols-2"
                            >
                                <label className="md:col-span-2">
                                    <span className="text-sm font-medium text-slate-700">
                                        Proyek Customer
                                    </span>
                                    <CustomSelect
                                        value={form.projectId}
                                        onChange={(nextValue) =>
                                            setForm((prev) => {
                                                const picked =
                                                    availableProjects.find(
                                                        (item) =>
                                                            item.id ===
                                                            nextValue,
                                                    );
                                                return {
                                                    ...prev,
                                                    projectId: nextValue,
                                                    customerId:
                                                        picked?.customer_id ??
                                                        prev.customerId,
                                                };
                                            })
                                        }
                                        options={[
                                            {
                                                value: "",
                                                label: "Pilih proyek",
                                            },
                                            ...availableProjects.map(
                                                (item) => ({
                                                    value: item.id,
                                                    label: `${item.project_name} - ${item.location}`,
                                                }),
                                            ),
                                        ]}
                                        placeholder="Pilih proyek customer"
                                    />
                                </label>
                                <label className="md:col-span-2">
                                    <span className="text-sm font-medium text-slate-700">
                                        Scope Proyek
                                    </span>
                                    <input
                                        value={
                                            jobScopeLabels[activeJobScope] ??
                                            JOB_SCOPE_LABELS[activeJobScope] ??
                                            activeJobScope
                                        }
                                        readOnly
                                        className={inputClass}
                                    />
                                </label>

                                <div className="md:col-span-2">
                                    <ScopeDetailFieldsRenderer
                                        scopeCode={activeJobScope}
                                        fields={activeScopeDetailFields}
                                        values={form.scopeDetails}
                                        onChange={setScopeDetail}
                                        selectOptionsByFieldKey={
                                            scopeFieldSelectOptions
                                        }
                                        supabaseClient={supabase}
                                        loading={scopeFieldsLoading}
                                    />
                                </div>

                                {activeScopeChecklist.length > 0 && (
                                    <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-sm font-medium text-slate-700">
                                            Checklist Pekerjaan
                                        </p>
                                        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                                            {activeScopeChecklistItems.map((item) => {
                                                const checked =
                                                    Array.isArray(
                                                        form.scopeDetails
                                                            ?.checklist,
                                                    ) &&
                                                    form.scopeDetails.checklist.includes(
                                                        item.label,
                                                    );
                                                return (
                                                    <label
                                                        key={item.key}
                                                        className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() =>
                                                                toggleScopeChecklist(
                                                                    item.label,
                                                                )
                                                            }
                                                            className="mt-1"
                                                        />
                                                        <span>{item.label}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <label className="md:col-span-2">
                                    <span className="text-sm font-medium text-slate-700">
                                        Keterangan Trouble
                                    </span>
                                    <textarea
                                        value={form.troubleDescription}
                                        onChange={(e) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                troubleDescription:
                                                    e.target.value,
                                            }))
                                        }
                                        className={`${inputClass} min-h-24`}
                                        placeholder="Jelaskan keluhan kerusakan"
                                    />
                                </label>

                                <button
                                    type="submit"
                                    disabled={submitting || scopeFieldsLoading}
                                    className="md:col-span-2 inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <List size={16} />
                                    {submitting
                                        ? "Mengirim..."
                                        : "Kirim Request"}
                                </button>
                            </form>
                        )}
                    </section>
                </main>
            </div>

            <MobileBottomNav />
        </div>
    );
}
