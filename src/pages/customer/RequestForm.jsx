import { useCallback, useEffect, useMemo, useState } from "react";
import { List } from "lucide-react";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import { useAuth } from "../../context/useAuth";
import { useDialog } from "../../context/useDialog";
import CustomSelect from "../../components/ui/CustomSelect";
import supabase from "../../supabaseClient";

const inputClass =
    "mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-300 focus:bg-white";

export default function CustomerRequestFormPage() {
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const { user } = useAuth();
    const { alert: showAlert } = useDialog();

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
    });

    const availableProjects = useMemo(() => {
        return projects;
    }, [projects]);

    const selectedProject = useMemo(
        () => availableProjects.find((item) => item.id === form.projectId) ?? null,
        [availableProjects, form.projectId],
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
        if (availableProjects.length === 0) return;
        const isValid = availableProjects.some((item) => item.id === form.projectId);
        if (!isValid) {
            const firstProject = availableProjects[0];
            setForm((prev) => ({
                ...prev,
                projectId: firstProject.id,
                customerId: firstProject.customer_id ?? prev.customerId,
            }));
        }
    }, [availableProjects, form.projectId]);

    const submitRequest = async (event) => {
        event.preventDefault();

        if (!selectedCustomer) {
            await showAlert("Data customer belum terhubung. Hubungi admin.", {
                title: "Customer Belum Terdaftar",
            });
            return;
        }

        if (
            !form.acBrand ||
            !form.acType ||
            !form.acCapacityPk ||
            !form.roomLocation
        ) {
            await showAlert("Lengkapi merk, tipe, PK, dan lokasi ruangan.", {
                title: "Data Belum Lengkap",
            });
            return;
        }

        setSubmitting(true);
        try {
            const payload = {
                title: selectedProject?.project_name ?? "",
                status: "pending",
                location:
                    selectedProject?.location ?? selectedCustomer?.location ?? "",
                customer_name:
                    selectedCustomer.name ?? user?.email ?? "Customer",
                customer_phone:
                    selectedProject?.phone ?? selectedCustomer?.phone ?? "",
                address:
                    selectedProject?.address ?? selectedCustomer?.address ?? "",
                customer_id: selectedCustomer.id,
                project_id: selectedProject?.id ?? null,
                ac_brand: form.acBrand,
                ac_type: form.acType,
                ac_capacity_pk: form.acCapacityPk,
                room_location: form.roomLocation,
                trouble_description: form.troubleDescription,
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
            }));

            await showAlert(
                "Request pekerjaan berhasil dikirim dengan status Pending.",
                {
                    title: "Request Terkirim",
                },
            );
        } catch (error) {
            console.error("Error creating customer request:", error);
            await showAlert(
                "Gagal mengirim request. Cek policy customer pada tabel requests.",
                {
                    title: "Request Gagal",
                },
            );
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
                                                            item.id === nextValue,
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
                                            { value: "", label: "Pilih proyek" },
                                            ...availableProjects.map((item) => ({
                                                value: item.id,
                                                label: `${item.project_name} - ${item.location}`,
                                            })),
                                        ]}
                                        placeholder="Pilih proyek customer"
                                    />
                                </label>

                                <label>
                                    <span className="text-sm font-medium text-slate-700">
                                        Merk AC
                                    </span>
                                    <CustomSelect
                                        value={form.acBrand}
                                        onChange={(nextValue) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                acBrand: nextValue,
                                            }))
                                        }
                                        options={[
                                            { value: "", label: "Pilih Merk" },
                                            ...acBrands.map((item) => ({
                                                value: item.name,
                                                label: item.name,
                                            })),
                                        ]}
                                    />
                                </label>

                                <label>
                                    <span className="text-sm font-medium text-slate-700">
                                        Tipe AC
                                    </span>
                                    <CustomSelect
                                        value={form.acType}
                                        onChange={(nextValue) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                acType: nextValue,
                                            }))
                                        }
                                        options={[
                                            { value: "", label: "Pilih Tipe" },
                                            ...acTypes.map((item) => ({
                                                value: item.name,
                                                label: item.name,
                                            })),
                                        ]}
                                    />
                                </label>

                                <label>
                                    <span className="text-sm font-medium text-slate-700">
                                        Kapasitas AC (PK)
                                    </span>
                                    <CustomSelect
                                        value={form.acCapacityPk}
                                        onChange={(nextValue) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                acCapacityPk: nextValue,
                                            }))
                                        }
                                        options={[
                                            { value: "", label: "Pilih PK" },
                                            ...acPks.map((item) => ({
                                                value: item.label,
                                                label: item.label,
                                            })),
                                        ]}
                                    />
                                </label>

                                <label>
                                    <span className="text-sm font-medium text-slate-700">
                                        Lokasi Ruangan
                                    </span>
                                    <input
                                        value={form.roomLocation}
                                        onChange={(e) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                roomLocation: e.target.value,
                                            }))
                                        }
                                        className={inputClass}
                                        placeholder="Contoh: Ruang Meeting A"
                                        required
                                    />
                                </label>

                                <label className="md:col-span-2">
                                    <span className="text-sm font-medium text-slate-700">
                                        Keterangan Trouble
                                    </span>
                                    <textarea
                                        value={form.troubleDescription}
                                        onChange={(e) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                troubleDescription: e.target.value,
                                            }))
                                        }
                                        className={`${inputClass} min-h-24`}
                                        placeholder="Jelaskan keluhan kerusakan"
                                    />
                                </label>

                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="md:col-span-2 inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <List size={16} />
                                    {submitting ? "Mengirim..." : "Kirim Request"}
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
