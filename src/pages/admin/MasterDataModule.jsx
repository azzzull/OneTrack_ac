import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pencil, Plus, Trash2, X } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import CustomSelect from "../../components/ui/CustomSelect";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import { useAuth } from "../../context/useAuth";
import { useDialog } from "../../context/useDialog";
import supabase from "../../supabaseClient";

const inputClass =
    "mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-300 focus:bg-white";

const resolveErrorMessage = async (error) => {
    if (error?.context && typeof error.context.json === "function") {
        try {
            const payload = await error.context.json();
            if (payload?.error) return String(payload.error);
        } catch {
            // no-op
        }
    }

    const message = String(error?.message ?? "");
    if (
        message.includes("FunctionsFetchError") ||
        message.includes("Failed to send a request")
    ) {
        return "Gagal memanggil Edge Function. Pastikan function `admin-create-user` sudah di-deploy di Supabase.";
    }
    return message || "Gagal menyimpan data.";
};

const getProfileDisplayName = (profile) => {
    const composed = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();
    return (
        composed ||
        String(profile?.name ?? "").trim() ||
        String(profile?.full_name ?? "").trim() ||
        String(profile?.email ?? "").trim() ||
        "-"
    );
};

const moduleConfig = {
    users: { title: "Daftar User", table: "profiles", readOnly: true },
    roles: { title: "Role", table: "master_roles" },
    customers: { title: "Customer", table: "master_customers" },
    ac_brands: { title: "Merk AC", table: "master_ac_brands" },
    ac_types: { title: "Tipe AC", table: "master_ac_types" },
    ac_pks: { title: "Jumlah PK", table: "master_ac_pks" },
};

export default function AdminMasterDataModulePage() {
    const { moduleKey } = useParams();
    const cfg = moduleConfig[moduleKey];
    const { user: currentUser } = useAuth();
    const { alert: showAlert, confirm } = useDialog();

    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const [items, setItems] = useState([]);
    const [roles, setRoles] = useState([]);
    const [roleFilter, setRoleFilter] = useState("all");
    const [userSearch, setUserSearch] = useState("");
    const [openModal, setOpenModal] = useState(false);
    const [editUserId, setEditUserId] = useState(null);
    const [editSimpleId, setEditSimpleId] = useState(null);
    const [loading, setLoading] = useState(false);

    const [userForm, setUserForm] = useState({
        firstName: "",
        lastName: "",
        email: "",
        password: "",
        role: "customer",
        phone: "",
    });
    const [simpleForm, setSimpleForm] = useState({
        name: "",
        projectName: "",
        location: "",
        phone: "",
        email: "",
        password: "",
        address: "",
        label: "",
    });

    const splitName = (fullName) => {
        const normalized = String(fullName ?? "").trim();
        if (!normalized) return { firstName: "", lastName: "" };
        const [firstName, ...rest] = normalized.split(/\s+/);
        return { firstName, lastName: rest.join(" ") };
    };

    const invokeAdminFunction = useCallback(async (name, body) => {
        const {
            data: { session },
            error: sessionError,
        } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session?.access_token) {
            throw new Error("Sesi login tidak valid. Silakan login ulang.");
        }
        const projectAnonKey = import.meta.env.VITE_SUPABASE_KEY;
        if (!projectAnonKey) {
            throw new Error("VITE_SUPABASE_KEY tidak ditemukan di environment.");
        }

        return supabase.functions.invoke(name, {
            body,
            headers: {
                Authorization: `Bearer ${session.access_token}`,
                apikey: projectAnonKey,
            },
        });
    }, []);

    const loadRoles = useCallback(async () => {
        const { data, error } = await supabase
            .from("master_roles")
            .select("*")
            .order("name", { ascending: true });
        if (error) throw error;
        setRoles(data ?? []);
    }, []);

    const loadItems = useCallback(async () => {
        if (!cfg) return;
        let query = supabase.from(cfg.table).select("*");

        if (moduleKey === "users") {
            query = query.order("created_at", { ascending: false });
        } else if (moduleKey === "customers") {
            query = query.order("created_at", { ascending: false });
        } else if (moduleKey === "ac_pks") {
            query = query.order("label", { ascending: true });
        } else {
            query = query.order("name", { ascending: true });
        }

        const { data, error } = await query;
        if (error) throw error;
        setItems(data ?? []);
    }, [cfg, moduleKey]);

    useEffect(() => {
        const timerId = setTimeout(async () => {
            try {
                setLoading(true);
                await Promise.all([loadItems(), loadRoles()]);
            } catch (error) {
                console.error("Load module failed:", error);
                setItems([]);
            } finally {
                setLoading(false);
            }
        }, 0);
        return () => clearTimeout(timerId);
    }, [loadItems, loadRoles]);

    const roleOptions = useMemo(() => {
        const fromDb = roles.map((r) => r.name);
        return fromDb.length ? fromDb : ["admin", "customer", "technician"];
    }, [roles]);

    const filteredItems = useMemo(() => {
        let data = items;

        if (moduleKey === "users" && roleFilter !== "all") {
            data = data.filter((item) => item.role === roleFilter);
        }

        if (moduleKey === "users") {
            const keyword = userSearch.trim().toLowerCase();
            if (keyword) {
                data = data.filter((item) => {
                    const fullName = getProfileDisplayName(item);
                    const haystack =
                        `${fullName} ${item.email ?? ""} ${item.phone ?? ""} ${item.role ?? ""}`.toLowerCase();
                    return haystack.includes(keyword);
                });
            }
        }
        return data;
    }, [items, moduleKey, roleFilter, userSearch]);

    const addUser = async () => {
        const { error } = await invokeAdminFunction("admin-create-user", {
                email: userForm.email,
                password: userForm.password,
                role: userForm.role,
                first_name: userForm.firstName,
                last_name: userForm.lastName,
                full_name:
                    `${userForm.firstName} ${userForm.lastName}`.trim() || null,
                phone: userForm.phone,
        });
        if (error) throw error;
        setUserForm({
            firstName: "",
            lastName: "",
            email: "",
            password: "",
            role: "customer",
            phone: "",
        });
    };

    const updateUser = async () => {
        if (!editUserId) return;
        const payload = {
            first_name: userForm.firstName,
            last_name: userForm.lastName,
            full_name:
                `${userForm.firstName} ${userForm.lastName}`.trim() || null,
            email: userForm.email,
            role: userForm.role,
            phone: userForm.phone,
        };
        const { error } = await supabase
            .from("profiles")
            .update(payload)
            .eq("id", editUserId);
        if (error) throw error;

        const nextPassword = userForm.password.trim();
        if (!nextPassword) return;

        if (editUserId === currentUser?.id) {
            const { error: passwordError } = await supabase.auth.updateUser({
                password: nextPassword,
            });
            if (passwordError) throw passwordError;
            return;
        }

        const { error: adminPasswordError } = await invokeAdminFunction(
            "admin-update-user-password",
            {
                user_id: editUserId,
                password: nextPassword,
            },
        );
        if (adminPasswordError) throw adminPasswordError;
    };

    const addSimple = async () => {
        if (moduleKey === "roles") {
            const { error } = await supabase
                .from("master_roles")
                .insert({ name: simpleForm.name });
            if (error) throw error;
        } else if (moduleKey === "customers") {
            let linkedUserId = null;
            const { firstName, lastName } = splitName(simpleForm.name);

            if (!editSimpleId) {
                if (!simpleForm.email || !simpleForm.password) {
                    throw new Error("Email dan password customer wajib diisi.");
                }

                const { error: createUserError } = await invokeAdminFunction(
                    "admin-create-user",
                    {
                        email: simpleForm.email,
                        password: simpleForm.password,
                        role: "customer",
                        first_name: firstName,
                        last_name: lastName,
                        full_name: simpleForm.name,
                        phone: simpleForm.phone,
                    },
                );
                if (createUserError) throw createUserError;

                const { data: createdProfile, error: profileLookupError } =
                    await supabase
                        .from("profiles")
                        .select("id")
                        .eq("email", simpleForm.email)
                        .maybeSingle();
                if (profileLookupError) throw profileLookupError;
                linkedUserId = createdProfile?.id ?? null;
            }

            const { error } = await supabase.from("master_customers").insert({
                name: simpleForm.name,
                pic_name: simpleForm.name,
                project_name: simpleForm.projectName,
                location: simpleForm.location,
                phone: simpleForm.phone,
                email: simpleForm.email || null,
                user_id: linkedUserId,
                address: simpleForm.address,
            });
            if (error) throw error;
        } else if (moduleKey === "ac_brands") {
            const { error } = await supabase
                .from("master_ac_brands")
                .insert({ name: simpleForm.name });
            if (error) throw error;
        } else if (moduleKey === "ac_types") {
            const { error } = await supabase
                .from("master_ac_types")
                .insert({ name: simpleForm.name });
            if (error) throw error;
        } else if (moduleKey === "ac_pks") {
            const { error } = await supabase
                .from("master_ac_pks")
                .insert({ label: simpleForm.label });
            if (error) throw error;
        }

        setSimpleForm({
            name: "",
            projectName: "",
            location: "",
            phone: "",
            email: "",
            password: "",
            address: "",
            label: "",
        });
    };

    const updateSimple = async () => {
        if (!editSimpleId) return;

        if (moduleKey === "roles") {
            const { error } = await supabase
                .from("master_roles")
                .update({ name: simpleForm.name })
                .eq("id", editSimpleId);
            if (error) throw error;
        } else if (moduleKey === "customers") {
            const { error } = await supabase
                .from("master_customers")
                .update({
                    name: simpleForm.name,
                    pic_name: simpleForm.name,
                    project_name: simpleForm.projectName,
                    location: simpleForm.location,
                    phone: simpleForm.phone,
                    email: simpleForm.email || null,
                    address: simpleForm.address,
                })
                .eq("id", editSimpleId);
            if (error) throw error;
        } else if (moduleKey === "ac_brands") {
            const { error } = await supabase
                .from("master_ac_brands")
                .update({ name: simpleForm.name })
                .eq("id", editSimpleId);
            if (error) throw error;
        } else if (moduleKey === "ac_types") {
            const { error } = await supabase
                .from("master_ac_types")
                .update({ name: simpleForm.name })
                .eq("id", editSimpleId);
            if (error) throw error;
        } else if (moduleKey === "ac_pks") {
            const { error } = await supabase
                .from("master_ac_pks")
                .update({ label: simpleForm.label })
                .eq("id", editSimpleId);
            if (error) throw error;
        }
    };

    const deleteItem = async (itemId) => {
        try {
            if (moduleKey === "users") {
                const confirmed = await confirm(
                    "Hapus user ini dari sistem login (auth) dan profile?",
                    {
                        title: "Konfirmasi Hapus User",
                        confirmText: "Hapus User",
                        cancelText: "Batal",
                        danger: true,
                    },
                );
                if (!confirmed) return;

                const { error } = await invokeAdminFunction(
                    "admin-delete-user",
                    { user_id: itemId },
                );
                if (error) {
                    const detail = await resolveErrorMessage(error);
                    if (!detail.toLowerCase().includes("user not found")) {
                        throw error;
                    }

                    const { error: deleteProfileError } = await supabase
                        .from("profiles")
                        .delete()
                        .eq("id", itemId);
                    if (deleteProfileError) throw deleteProfileError;
                }

                // Keep customer master data in sync when linked login is deleted.
                const { error: deleteCustomerError } = await supabase
                    .from("master_customers")
                    .delete()
                    .eq("user_id", itemId);
                if (deleteCustomerError) throw deleteCustomerError;
            } else if (moduleKey === "customers") {
                const { count, error: countError } = await supabase
                    .from("requests")
                    .select("id", { head: true, count: "exact" })
                    .eq("customer_id", itemId);
                if (countError) throw countError;

                const totalJobs = count ?? 0;
                const confirmed = await confirm(
                    totalJobs > 0
                        ? `Customer ini punya ${totalJobs} pekerjaan. Jika dihapus, semua record pekerjaan customer ini juga akan terhapus permanen. Lanjutkan?`
                        : "Yakin ingin menghapus customer ini?",
                    {
                        title: "Konfirmasi Hapus Customer",
                        confirmText: "Hapus Data",
                        cancelText: "Batal",
                        danger: true,
                    },
                );
                if (!confirmed) return;

                if (totalJobs > 0) {
                    const { error: deleteRequestsError } = await supabase
                        .from("requests")
                        .delete()
                        .eq("customer_id", itemId);
                    if (deleteRequestsError) throw deleteRequestsError;
                }

                const { error: deleteCustomerError } = await supabase
                    .from("master_customers")
                    .delete()
                    .eq("id", itemId);
                if (deleteCustomerError) throw deleteCustomerError;
            } else {
                const confirmed = await confirm("Yakin ingin menghapus data ini?", {
                    title: "Konfirmasi Hapus",
                    confirmText: "Hapus",
                    cancelText: "Batal",
                    danger: true,
                });
                if (!confirmed) return;

                const { error } = await supabase
                    .from(cfg.table)
                    .delete()
                    .eq("id", itemId);
                if (error) throw error;
            }

            await loadItems();
        } catch (error) {
            console.error("Delete data failed:", error);
            await showAlert(await resolveErrorMessage(error), {
                title: "Hapus Gagal",
            });
        }
    };

    const resetForms = () => {
        setUserForm({
            firstName: "",
            lastName: "",
            email: "",
            password: "",
            role: "customer",
            phone: "",
        });
        setSimpleForm({
            name: "",
            projectName: "",
            location: "",
            phone: "",
            email: "",
            password: "",
            address: "",
            label: "",
        });
    };

    const submitNew = async (event) => {
        event.preventDefault();
        try {
            if (moduleKey === "users") {
                if (editUserId) {
                    await updateUser();
                } else {
                    await addUser();
                }
            } else {
                if (editSimpleId) {
                    await updateSimple();
                } else {
                    await addSimple();
                }
            }
            setOpenModal(false);
            setEditUserId(null);
            setEditSimpleId(null);
            await loadItems();
        } catch (error) {
            console.error("Add data failed:", error);
            await showAlert(await resolveErrorMessage(error), {
                title: "Simpan Gagal",
            });
        }
    };

    if (!cfg) {
        return (
            <div className="min-h-screen bg-sky-50 p-8">
                <p>Module tidak ditemukan.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-sky-50">
            <div className="flex min-h-screen">
                <Sidebar
                    collapsed={sidebarCollapsed}
                    onToggle={toggleSidebar}
                />

                <main className="min-w-0 flex-1 overflow-x-hidden p-4 pb-24 md:p-8 md:pb-8">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-2">
                            <Link
                                to="/master-data"
                                className="inline-flex rounded-lg p-2 text-slate-600 no-underline hover:bg-slate-100"
                                style={{ textDecoration: "none" }}
                            >
                                <ArrowLeft size={16} />
                            </Link>
                            <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">
                                {cfg.title}
                            </h1>
                        </div>

                        <div className="flex items-center gap-2">
                            {moduleKey === "users" && (
                                <CustomSelect
                                    value={roleFilter}
                                    onChange={(nextValue) => setRoleFilter(nextValue)}
                                    options={[
                                        { value: "all", label: "Semua Role" },
                                        ...roleOptions.map((role) => ({
                                            value: role,
                                            label: role,
                                        })),
                                    ]}
                                    className="mt-0 min-w-[170px] bg-white"
                                />
                            )}
                            <button
                                type="button"
                                onClick={() => {
                                    setEditUserId(null);
                                    setEditSimpleId(null);
                                    resetForms();
                                    setOpenModal(true);
                                }}
                                className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
                            >
                                <Plus size={14} />
                                {moduleKey === "users"
                                    ? "Tambah User"
                                    : "Tambah Data"}
                            </button>
                        </div>
                    </div>

                    <section className="mt-6 w-full overflow-hidden rounded-2xl bg-white shadow-sm">
                        {moduleKey === "users" && (
                            <div className="border-b border-slate-200 px-4 py-3">
                                <input
                                    value={userSearch}
                                    onChange={(e) => setUserSearch(e.target.value)}
                                    placeholder="Cari nama, email, phone..."
                                    className="w-full max-w-sm rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-300 focus:bg-white"
                                />
                            </div>
                        )}
                        {loading ? (
                            <p className="p-4 text-sm text-slate-500">
                                Memuat data...
                            </p>
                        ) : (
                            <div className="w-full overflow-x-auto">
                                <table className="w-full min-w-[640px] text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-200 text-slate-500">
                                            {moduleKey === "users" && (
                                                <>
                                                    <th className="px-3 py-3">
                                                        Nama
                                                    </th>
                                                    <th className="px-3 py-3">
                                                        Email
                                                    </th>
                                                    <th className="px-3 py-3">
                                                        Role
                                                    </th>
                                                    <th className="px-3 py-3">
                                                        Phone
                                                    </th>
                                                    <th className="px-3 py-3">
                                                        Aksi
                                                    </th>
                                                </>
                                            )}
                                            {moduleKey === "roles" && (
                                                <>
                                                    <th className="px-3 py-3">
                                                        Nama Role
                                                    </th>
                                                    <th className="px-3 py-3">
                                                        Aksi
                                                    </th>
                                                </>
                                            )}
                                            {moduleKey === "customers" && (
                                                <>
                                                    <th className="px-3 py-3">
                                                        PIC / Customer
                                                    </th>
                                                    <th className="px-3 py-3">
                                                        Nama Proyek
                                                    </th>
                                                    <th className="px-3 py-3">
                                                        Lokasi Proyek
                                                    </th>
                                                    <th className="px-3 py-3">
                                                        Telepon
                                                    </th>
                                                    <th className="px-3 py-3">
                                                        Email
                                                    </th>
                                                    <th className="px-3 py-3">
                                                        Alamat
                                                    </th>
                                                    <th className="px-3 py-3">
                                                        Aksi
                                                    </th>
                                                </>
                                            )}
                                            {(moduleKey === "ac_brands" ||
                                                moduleKey === "ac_types") && (
                                                <>
                                                    <th className="px-3 py-3">
                                                        Nama
                                                    </th>
                                                    <th className="px-3 py-3">
                                                        Aksi
                                                    </th>
                                                </>
                                            )}
                                            {moduleKey === "ac_pks" && (
                                                <>
                                                    <th className="px-3 py-3">
                                                        Label PK
                                                    </th>
                                                    <th className="px-3 py-3">
                                                        Aksi
                                                    </th>
                                                </>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredItems.map((item) => (
                                            <tr
                                                key={item.id}
                                                className="border-b border-slate-100"
                                            >
                                                {moduleKey === "users" && (
                                                    <>
                                                        <td className="px-3 py-3 font-medium text-slate-800">
                                                            {getProfileDisplayName(item)}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600">
                                                            {item.email ?? "-"}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600">
                                                            {item.role ?? "-"}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600">
                                                            {item.phone ?? "-"}
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const { firstName, lastName } = splitName(
                                                                            getProfileDisplayName(item),
                                                                        );
                                                                        setEditSimpleId(
                                                                            null,
                                                                        );
                                                                        setEditUserId(
                                                                            item.id,
                                                                        );
                                                                        setUserForm(
                                                                            {
                                                                                firstName:
                                                                                    item.first_name ??
                                                                                    firstName,
                                                                                lastName:
                                                                                    item.last_name ??
                                                                                    lastName,
                                                                                email:
                                                                                    item.email ??
                                                                                    "",
                                                                                password:
                                                                                    "",
                                                                                role:
                                                                                    item.role ??
                                                                                    "customer",
                                                                                phone:
                                                                                    item.phone ??
                                                                                    "",
                                                                            },
                                                                        );
                                                                        setOpenModal(
                                                                            true,
                                                                        );
                                                                    }}
                                                                    className="inline-flex cursor-pointer rounded-md p-1 text-slate-500 hover:bg-slate-100"
                                                                    title="Edit"
                                                                >
                                                                    <Pencil
                                                                        size={14}
                                                                    />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        deleteItem(
                                                                            item.id,
                                                                        )
                                                                    }
                                                                    className="inline-flex cursor-pointer rounded-md p-1 text-rose-500 hover:bg-rose-50"
                                                                    title="Hapus"
                                                                >
                                                                    <Trash2
                                                                        size={14}
                                                                    />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </>
                                                )}
                                                {moduleKey === "roles" && (
                                                    <>
                                                        <td className="px-3 py-3 text-slate-700">
                                                            {item.name}
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setEditUserId(
                                                                            null,
                                                                        );
                                                                        setEditSimpleId(
                                                                            item.id,
                                                                        );
                                                                        setSimpleForm(
                                                                            {
                                                                                name:
                                                                                    item.name ??
                                                                                    "",
                                                                                projectName:
                                                                                    "",
                                                                                location:
                                                                                    "",
                                                                                phone:
                                                                                    "",
                                                                                address:
                                                                                    "",
                                                                                label:
                                                                                    "",
                                                                            },
                                                                        );
                                                                        setOpenModal(
                                                                            true,
                                                                        );
                                                                    }}
                                                                    className="inline-flex cursor-pointer rounded-md p-1 text-slate-500 hover:bg-slate-100"
                                                                    title="Edit"
                                                                >
                                                                    <Pencil
                                                                        size={14}
                                                                    />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        deleteItem(
                                                                            item.id,
                                                                        )
                                                                    }
                                                                    className="inline-flex cursor-pointer rounded-md p-1 text-rose-500 hover:bg-rose-50"
                                                                    title="Hapus"
                                                                >
                                                                    <Trash2
                                                                        size={14}
                                                                    />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </>
                                                )}
                                                {moduleKey === "customers" && (
                                                    <>
                                                        <td className="px-3 py-3 font-medium text-slate-800">
                                                            {item.pic_name ?? item.name ?? "-"}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600">
                                                            {item.project_name ?? "-"}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600">
                                                            {item.location ?? "-"}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600">
                                                            {item.phone ?? "-"}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600">
                                                            {item.email ?? "-"}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600">
                                                            {item.address ?? "-"}
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setEditUserId(
                                                                            null,
                                                                        );
                                                                        setEditSimpleId(
                                                                            item.id,
                                                                        );
                                                                        setSimpleForm(
                                                                            {
                                                                                name:
                                                                                    item.pic_name ??
                                                                                    item.name ??
                                                                                    "",
                                                                                projectName:
                                                                                    item.project_name ??
                                                                                    "",
                                                                                location:
                                                                                    item.location ??
                                                                                    "",
                                                                                phone:
                                                                                    item.phone ??
                                                                                    "",
                                                                                email:
                                                                                    item.email ??
                                                                                    "",
                                                                                password:
                                                                                    "",
                                                                                address:
                                                                                    item.address ??
                                                                                    "",
                                                                                label:
                                                                                    "",
                                                                            },
                                                                        );
                                                                        setOpenModal(
                                                                            true,
                                                                        );
                                                                    }}
                                                                    className="inline-flex cursor-pointer rounded-md p-1 text-slate-500 hover:bg-slate-100"
                                                                    title="Edit"
                                                                >
                                                                    <Pencil
                                                                        size={14}
                                                                    />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        deleteItem(
                                                                            item.id,
                                                                        )
                                                                    }
                                                                    className="inline-flex cursor-pointer rounded-md p-1 text-rose-500 hover:bg-rose-50"
                                                                    title="Hapus"
                                                                >
                                                                    <Trash2
                                                                        size={14}
                                                                    />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </>
                                                )}
                                                {(moduleKey === "ac_brands" ||
                                                    moduleKey ===
                                                        "ac_types") && (
                                                    <>
                                                        <td className="px-3 py-3 text-slate-700">
                                                            {item.name}
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setEditUserId(
                                                                            null,
                                                                        );
                                                                        setEditSimpleId(
                                                                            item.id,
                                                                        );
                                                                        setSimpleForm(
                                                                            {
                                                                                name:
                                                                                    item.name ??
                                                                                    "",
                                                                                projectName:
                                                                                    "",
                                                                                location:
                                                                                    "",
                                                                                phone:
                                                                                    "",
                                                                                address:
                                                                                    "",
                                                                                label:
                                                                                    "",
                                                                            },
                                                                        );
                                                                        setOpenModal(
                                                                            true,
                                                                        );
                                                                    }}
                                                                    className="inline-flex cursor-pointer rounded-md p-1 text-slate-500 hover:bg-slate-100"
                                                                    title="Edit"
                                                                >
                                                                    <Pencil
                                                                        size={14}
                                                                    />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        deleteItem(
                                                                            item.id,
                                                                        )
                                                                    }
                                                                    className="inline-flex cursor-pointer rounded-md p-1 text-rose-500 hover:bg-rose-50"
                                                                    title="Hapus"
                                                                >
                                                                    <Trash2
                                                                        size={14}
                                                                    />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </>
                                                )}
                                                {moduleKey === "ac_pks" && (
                                                    <>
                                                        <td className="px-3 py-3 text-slate-700">
                                                            {item.label}
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setEditUserId(
                                                                            null,
                                                                        );
                                                                        setEditSimpleId(
                                                                            item.id,
                                                                        );
                                                                        setSimpleForm(
                                                                            {
                                                                                name:
                                                                                    "",
                                                                                projectName:
                                                                                    "",
                                                                                location:
                                                                                    "",
                                                                                phone:
                                                                                    "",
                                                                                address:
                                                                                    "",
                                                                                label:
                                                                                    item.label ??
                                                                                    "",
                                                                            },
                                                                        );
                                                                        setOpenModal(
                                                                            true,
                                                                        );
                                                                    }}
                                                                    className="inline-flex cursor-pointer rounded-md p-1 text-slate-500 hover:bg-slate-100"
                                                                    title="Edit"
                                                                >
                                                                    <Pencil
                                                                        size={14}
                                                                    />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        deleteItem(
                                                                            item.id,
                                                                        )
                                                                    }
                                                                    className="inline-flex cursor-pointer rounded-md p-1 text-rose-500 hover:bg-rose-50"
                                                                    title="Hapus"
                                                                >
                                                                    <Trash2
                                                                        size={14}
                                                                    />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </main>
            </div>

            <MobileBottomNav />

            {openModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
                    <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-slate-900">
                                {editUserId || editSimpleId
                                    ? `Edit ${cfg.title}`
                                    : `Tambah ${cfg.title}`}
                            </h2>
                            <button
                                type="button"
                                onClick={() => {
                                    setOpenModal(false);
                                    setEditUserId(null);
                                    setEditSimpleId(null);
                                }}
                                className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <form
                            onSubmit={submitNew}
                            className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2"
                        >
                            {moduleKey === "users" && (
                                <>
                                    <label>
                                        <span className="text-sm font-medium text-slate-700">
                                            First Name
                                        </span>
                                        <input
                                            value={userForm.firstName}
                                            onChange={(e) =>
                                                setUserForm((prev) => ({
                                                    ...prev,
                                                    firstName: e.target.value,
                                                }))
                                            }
                                            className={inputClass}
                                            required
                                        />
                                    </label>
                                    <label>
                                        <span className="text-sm font-medium text-slate-700">
                                            Last Name
                                        </span>
                                        <input
                                            value={userForm.lastName}
                                            onChange={(e) =>
                                                setUserForm((prev) => ({
                                                    ...prev,
                                                    lastName: e.target.value,
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
                                        <CustomSelect
                                            value={userForm.role}
                                            onChange={(nextValue) =>
                                                setUserForm((prev) => ({
                                                    ...prev,
                                                    role: nextValue,
                                                }))
                                            }
                                            options={roleOptions.map((role) => ({
                                                value: role,
                                                label: role,
                                            }))}
                                        />
                                    </label>
                                    <label>
                                        <span className="text-sm font-medium text-slate-700">
                                            Email
                                        </span>
                                        <input
                                            type="email"
                                            value={userForm.email}
                                            onChange={(e) =>
                                                setUserForm((prev) => ({
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
                                            Phone
                                        </span>
                                        <input
                                            value={userForm.phone}
                                            onChange={(e) =>
                                                setUserForm((prev) => ({
                                                    ...prev,
                                                    phone: e.target.value,
                                                }))
                                            }
                                            className={inputClass}
                                            required
                                        />
                                    </label>
                                    <label>
                                        <span className="text-sm font-medium text-slate-700">
                                            {editUserId
                                                ? "Password Baru (opsional)"
                                                : "Password Awal"}
                                        </span>
                                        <input
                                            type="password"
                                            value={userForm.password}
                                            onChange={(e) =>
                                                setUserForm((prev) => ({
                                                    ...prev,
                                                    password: e.target.value,
                                                }))
                                            }
                                            className={inputClass}
                                            required={!editUserId}
                                            placeholder={
                                                editUserId
                                                    ? "Kosongkan jika tidak ingin ganti"
                                                    : "Isi password awal user"
                                            }
                                        />
                                    </label>
                                </>
                            )}

                            {moduleKey === "roles" && (
                                <label className="md:col-span-2">
                                    <span className="text-sm font-medium text-slate-700">
                                        Nama Role
                                    </span>
                                    <input
                                        value={simpleForm.name}
                                        onChange={(e) =>
                                            setSimpleForm((prev) => ({
                                                ...prev,
                                                name: e.target.value,
                                            }))
                                        }
                                        className={inputClass}
                                        required
                                    />
                                </label>
                            )}

                            {moduleKey === "customers" && (
                                <>
                                    <label>
                                        <span className="text-sm font-medium text-slate-700">
                                            Nama PIC / Customer
                                        </span>
                                        <input
                                            value={simpleForm.name}
                                            onChange={(e) =>
                                                setSimpleForm((prev) => ({
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
                                            Nama Proyek
                                        </span>
                                        <input
                                            value={simpleForm.projectName}
                                            onChange={(e) =>
                                                setSimpleForm((prev) => ({
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
                                            value={simpleForm.location}
                                            onChange={(e) =>
                                                setSimpleForm((prev) => ({
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
                                            Telepon
                                        </span>
                                        <input
                                            value={simpleForm.phone}
                                            onChange={(e) =>
                                                setSimpleForm((prev) => ({
                                                    ...prev,
                                                    phone: e.target.value,
                                                }))
                                            }
                                            className={inputClass}
                                            required
                                        />
                                    </label>
                                    <label>
                                        <span className="text-sm font-medium text-slate-700">
                                            Email Login
                                        </span>
                                        <input
                                            type="email"
                                            value={simpleForm.email}
                                            onChange={(e) =>
                                                setSimpleForm((prev) => ({
                                                    ...prev,
                                                    email: e.target.value,
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
                                            value={simpleForm.address}
                                            onChange={(e) =>
                                                setSimpleForm((prev) => ({
                                                    ...prev,
                                                    address: e.target.value,
                                                }))
                                            }
                                            className={`${inputClass} min-h-24`}
                                            required
                                        />
                                    </label>
                                    {!editSimpleId && (
                                        <label className="md:col-span-2">
                                            <span className="text-sm font-medium text-slate-700">
                                                Password Awal
                                            </span>
                                            <input
                                                type="password"
                                                value={simpleForm.password}
                                                onChange={(e) =>
                                                    setSimpleForm((prev) => ({
                                                        ...prev,
                                                        password: e.target.value,
                                                    }))
                                                }
                                                className={inputClass}
                                                placeholder="Password awal untuk customer login"
                                                required
                                            />
                                        </label>
                                    )}
                                </>
                            )}

                            {(moduleKey === "ac_brands" ||
                                moduleKey === "ac_types") && (
                                <label className="md:col-span-2">
                                    <span className="text-sm font-medium text-slate-700">
                                        Nama
                                    </span>
                                    <input
                                        value={simpleForm.name}
                                        onChange={(e) =>
                                            setSimpleForm((prev) => ({
                                                ...prev,
                                                name: e.target.value,
                                            }))
                                        }
                                        className={inputClass}
                                        required
                                    />
                                </label>
                            )}

                            {moduleKey === "ac_pks" && (
                                <label className="md:col-span-2">
                                    <span className="text-sm font-medium text-slate-700">
                                        Label PK
                                    </span>
                                    <input
                                        value={simpleForm.label}
                                        onChange={(e) =>
                                            setSimpleForm((prev) => ({
                                                ...prev,
                                                label: e.target.value,
                                            }))
                                        }
                                        className={inputClass}
                                        required
                                    />
                                </label>
                            )}

                            <button
                                type="submit"
                                className="md:col-span-2 inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
                            >
                                <Plus size={14} />
                                {editUserId || editSimpleId
                                    ? "Update"
                                    : "Simpan"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
