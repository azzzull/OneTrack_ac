import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Plus, UserPlus } from "lucide-react";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import supabase from "../../supabaseClient";

const inputClass =
    "mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-300 focus:bg-white";

const SectionTitle = ({ children }) => (
    <h2 className="mb-4 inline-flex items-center gap-2 text-base font-semibold text-sky-500 md:text-lg">
        <CheckCircle2 size={16} />
        {children}
    </h2>
);

export default function AdminMasterDataPage() {
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const [customers, setCustomers] = useState([]);
    const [projects, setProjects] = useState([]);

    const [accountForm, setAccountForm] = useState({
        email: "",
        password: "",
        role: "customer",
        fullName: "",
    });

    const [customerForm, setCustomerForm] = useState({
        name: "",
        phone: "",
        address: "",
    });

    const [projectForm, setProjectForm] = useState({
        customerId: "",
        projectName: "",
        location: "",
        phone: "",
        address: "",
    });

    const [submittingAccount, setSubmittingAccount] = useState(false);
    const [submittingCustomer, setSubmittingCustomer] = useState(false);
    const [submittingProject, setSubmittingProject] = useState(false);

    const loadMasterData = useCallback(async () => {
        try {
            const [customersRes, projectsRes] = await Promise.all([
                supabase
                    .from("master_customers")
                    .select("*")
                    .order("created_at", { ascending: false }),
                supabase
                    .from("master_projects")
                    .select("*")
                    .order("created_at", { ascending: false }),
            ]);

            if (customersRes.error) throw customersRes.error;
            if (projectsRes.error) throw projectsRes.error;

            setCustomers(customersRes.data ?? []);
            setProjects(projectsRes.data ?? []);
        } catch (error) {
            console.error("Error loading master data:", error);
            setCustomers([]);
            setProjects([]);
        }
    }, []);

    useEffect(() => {
        const timerId = setTimeout(() => {
            loadMasterData();
        }, 0);

        return () => {
            clearTimeout(timerId);
        };
    }, [loadMasterData]);

    const customerNameById = useMemo(() => {
        const map = {};
        customers.forEach((item) => {
            map[item.id] = item.name;
        });
        return map;
    }, [customers]);

    const submitCreateAccount = async (event) => {
        event.preventDefault();
        setSubmittingAccount(true);

        try {
            const { error } = await supabase.functions.invoke("admin-create-user", {
                body: {
                    email: accountForm.email,
                    password: accountForm.password,
                    role: accountForm.role,
                    full_name: accountForm.fullName,
                },
            });

            if (error) throw error;
            setAccountForm({
                email: "",
                password: "",
                role: "customer",
                fullName: "",
            });
            alert("Akun berhasil dibuat.");
        } catch (error) {
            console.error("Error creating account:", error);
            alert(
                "Gagal membuat akun. Pastikan Edge Function 'admin-create-user' sudah dibuat di Supabase.",
            );
        } finally {
            setSubmittingAccount(false);
        }
    };

    const submitCustomer = async (event) => {
        event.preventDefault();
        setSubmittingCustomer(true);

        try {
            const { error } = await supabase.from("master_customers").insert({
                name: customerForm.name,
                phone: customerForm.phone,
                address: customerForm.address,
            });

            if (error) throw error;
            setCustomerForm({ name: "", phone: "", address: "" });
            await loadMasterData();
        } catch (error) {
            console.error("Error creating customer:", error);
            alert("Gagal menyimpan customer.");
        } finally {
            setSubmittingCustomer(false);
        }
    };

    const submitProject = async (event) => {
        event.preventDefault();
        setSubmittingProject(true);

        try {
            const { error } = await supabase.from("master_projects").insert({
                customer_id: projectForm.customerId,
                project_name: projectForm.projectName,
                location: projectForm.location,
                phone: projectForm.phone,
                address: projectForm.address,
            });

            if (error) throw error;
            setProjectForm({
                customerId: "",
                projectName: "",
                location: "",
                phone: "",
                address: "",
            });
            await loadMasterData();
        } catch (error) {
            console.error("Error creating project:", error);
            alert("Gagal menyimpan proyek.");
        } finally {
            setSubmittingProject(false);
        }
    };

    return (
        <div className="min-h-screen bg-sky-50">
            <div className="flex min-h-screen">
                <Sidebar
                    collapsed={sidebarCollapsed}
                    onToggle={toggleSidebar}
                />

                <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8">
                    <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">
                        Master Data
                    </h1>
                    <p className="mt-1 text-slate-600">
                        Kelola akun, customer, dan data proyek untuk input New Job.
                    </p>

                    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
                        <SectionTitle>Buat Akun Customer / Technician</SectionTitle>
                        <form
                            onSubmit={submitCreateAccount}
                            className="grid grid-cols-1 gap-4 md:grid-cols-2"
                        >
                            <label>
                                <span className="text-sm font-medium text-slate-700">
                                    Nama Lengkap
                                </span>
                                <input
                                    value={accountForm.fullName}
                                    onChange={(e) =>
                                        setAccountForm((prev) => ({
                                            ...prev,
                                            fullName: e.target.value,
                                        }))
                                    }
                                    className={inputClass}
                                    required
                                />
                            </label>
                            <label>
                                <span className="text-sm font-medium text-slate-700">
                                    Role
                                </span>
                                <select
                                    value={accountForm.role}
                                    onChange={(e) =>
                                        setAccountForm((prev) => ({
                                            ...prev,
                                            role: e.target.value,
                                        }))
                                    }
                                    className={inputClass}
                                >
                                    <option value="customer">Customer</option>
                                    <option value="technician">Technician</option>
                                </select>
                            </label>
                            <label>
                                <span className="text-sm font-medium text-slate-700">
                                    Email
                                </span>
                                <input
                                    type="email"
                                    value={accountForm.email}
                                    onChange={(e) =>
                                        setAccountForm((prev) => ({
                                            ...prev,
                                            email: e.target.value,
                                        }))
                                    }
                                    className={inputClass}
                                    required
                                />
                            </label>
                            <label>
                                <span className="text-sm font-medium text-slate-700">
                                    Password
                                </span>
                                <input
                                    type="password"
                                    value={accountForm.password}
                                    onChange={(e) =>
                                        setAccountForm((prev) => ({
                                            ...prev,
                                            password: e.target.value,
                                        }))
                                    }
                                    className={inputClass}
                                    required
                                />
                            </label>
                            <button
                                type="submit"
                                disabled={submittingAccount}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-70"
                            >
                                <UserPlus size={16} />
                                {submittingAccount
                                    ? "Membuat Akun..."
                                    : "Buat Akun"}
                            </button>
                        </form>
                    </section>

                    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
                        <SectionTitle>Master Customer</SectionTitle>
                        <form
                            onSubmit={submitCustomer}
                            className="grid grid-cols-1 gap-4 md:grid-cols-2"
                        >
                            <label>
                                <span className="text-sm font-medium text-slate-700">
                                    Nama Customer
                                </span>
                                <input
                                    value={customerForm.name}
                                    onChange={(e) =>
                                        setCustomerForm((prev) => ({
                                            ...prev,
                                            name: e.target.value,
                                        }))
                                    }
                                    className={inputClass}
                                    required
                                />
                            </label>
                            <label>
                                <span className="text-sm font-medium text-slate-700">
                                    Nomor Telepon
                                </span>
                                <input
                                    value={customerForm.phone}
                                    onChange={(e) =>
                                        setCustomerForm((prev) => ({
                                            ...prev,
                                            phone: e.target.value,
                                        }))
                                    }
                                    className={inputClass}
                                    required
                                />
                            </label>
                            <label className="md:col-span-2">
                                <span className="text-sm font-medium text-slate-700">
                                    Alamat
                                </span>
                                <textarea
                                    value={customerForm.address}
                                    onChange={(e) =>
                                        setCustomerForm((prev) => ({
                                            ...prev,
                                            address: e.target.value,
                                        }))
                                    }
                                    className={`${inputClass} min-h-24`}
                                    required
                                />
                            </label>
                            <button
                                type="submit"
                                disabled={submittingCustomer}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-70"
                            >
                                <Plus size={16} />
                                {submittingCustomer
                                    ? "Menyimpan..."
                                    : "Tambah Customer"}
                            </button>
                        </form>

                        <div className="mt-4 overflow-x-auto">
                            <table className="w-full min-w-[560px] text-left text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 text-slate-500">
                                        <th className="px-2 py-2">Nama</th>
                                        <th className="px-2 py-2">Telepon</th>
                                        <th className="px-2 py-2">Alamat</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {customers.map((item) => (
                                        <tr
                                            key={item.id}
                                            className="border-b border-slate-100"
                                        >
                                            <td className="px-2 py-2 font-medium text-slate-800">
                                                {item.name}
                                            </td>
                                            <td className="px-2 py-2 text-slate-600">
                                                {item.phone}
                                            </td>
                                            <td className="px-2 py-2 text-slate-600">
                                                {item.address}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
                        <SectionTitle>Master Proyek</SectionTitle>
                        <form
                            onSubmit={submitProject}
                            className="grid grid-cols-1 gap-4 md:grid-cols-2"
                        >
                            <label>
                                <span className="text-sm font-medium text-slate-700">
                                    Customer
                                </span>
                                <select
                                    value={projectForm.customerId}
                                    onChange={(e) =>
                                        setProjectForm((prev) => ({
                                            ...prev,
                                            customerId: e.target.value,
                                        }))
                                    }
                                    className={inputClass}
                                    required
                                >
                                    <option value="">Pilih customer</option>
                                    {customers.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                <span className="text-sm font-medium text-slate-700">
                                    Nama Proyek
                                </span>
                                <input
                                    value={projectForm.projectName}
                                    onChange={(e) =>
                                        setProjectForm((prev) => ({
                                            ...prev,
                                            projectName: e.target.value,
                                        }))
                                    }
                                    className={inputClass}
                                    required
                                />
                            </label>
                            <label>
                                <span className="text-sm font-medium text-slate-700">
                                    Lokasi Proyek
                                </span>
                                <input
                                    value={projectForm.location}
                                    onChange={(e) =>
                                        setProjectForm((prev) => ({
                                            ...prev,
                                            location: e.target.value,
                                        }))
                                    }
                                    className={inputClass}
                                    required
                                />
                            </label>
                            <label>
                                <span className="text-sm font-medium text-slate-700">
                                    Nomor Telepon
                                </span>
                                <input
                                    value={projectForm.phone}
                                    onChange={(e) =>
                                        setProjectForm((prev) => ({
                                            ...prev,
                                            phone: e.target.value,
                                        }))
                                    }
                                    className={inputClass}
                                    required
                                />
                            </label>
                            <label className="md:col-span-2">
                                <span className="text-sm font-medium text-slate-700">
                                    Alamat
                                </span>
                                <textarea
                                    value={projectForm.address}
                                    onChange={(e) =>
                                        setProjectForm((prev) => ({
                                            ...prev,
                                            address: e.target.value,
                                        }))
                                    }
                                    className={`${inputClass} min-h-24`}
                                    required
                                />
                            </label>
                            <button
                                type="submit"
                                disabled={submittingProject}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-70"
                            >
                                <Plus size={16} />
                                {submittingProject ? "Menyimpan..." : "Tambah Proyek"}
                            </button>
                        </form>

                        <div className="mt-4 overflow-x-auto">
                            <table className="w-full min-w-[680px] text-left text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 text-slate-500">
                                        <th className="px-2 py-2">Customer</th>
                                        <th className="px-2 py-2">Nama Proyek</th>
                                        <th className="px-2 py-2">Lokasi</th>
                                        <th className="px-2 py-2">Telepon</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {projects.map((item) => (
                                        <tr
                                            key={item.id}
                                            className="border-b border-slate-100"
                                        >
                                            <td className="px-2 py-2 text-slate-700">
                                                {customerNameById[item.customer_id] ??
                                                    "-"}
                                            </td>
                                            <td className="px-2 py-2 font-medium text-slate-800">
                                                {item.project_name}
                                            </td>
                                            <td className="px-2 py-2 text-slate-600">
                                                {item.location}
                                            </td>
                                            <td className="px-2 py-2 text-slate-600">
                                                {item.phone}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </main>
            </div>

            <MobileBottomNav />
        </div>
    );
}
