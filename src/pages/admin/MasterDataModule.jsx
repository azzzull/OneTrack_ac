import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pencil, Plus, Settings2, Trash2, X } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import CustomSelect from "../../components/ui/CustomSelect";
import ScopeDetailFieldsManagerModal from "../../components/scope-detail-fields/ScopeDetailFieldsManagerModal";
import useJobScopeOptions from "../../hooks/useJobScopeOptions";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import { useDialog } from "../../context/useDialog";
import { JOB_SCOPES } from "../../hooks/useJobScope";
import { normalizeJobScopeCode } from "../../utils/jobScopeCatalog";
import supabase from "../../supabaseClient";

const inputClass =
    "mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-300 focus:bg-white";

const TECHNICIAN_TYPE_OPTIONS = [
    { value: "internal", label: "Internal" },
    { value: "external", label: "External" },
];

const resolveErrorMessage = async (error) => {
    if (error?.context && typeof error.context.json === "function") {
        try {
            const payload = await error.context.json();
            if (payload?.error) return String(payload.error);
            if (payload?.message) return String(payload.message);
        } catch {
            // no-op
        }
    }

    if (error?.context && typeof error.context.text === "function") {
        try {
            const text = await error.context.text();
            if (text && text.trim()) return text.trim();
        } catch {
            // no-op
        }
    }

    const message = String(error?.message ?? "");
    if (
        message.includes("FunctionsFetchError") ||
        message.includes("Failed to send a request")
    ) {
        return "Gagal memanggil Edge Function. Pastikan function admin yang dibutuhkan seperti `admin-create-user`, `admin-update-user-password`, dan `admin-delete-user` sudah di-deploy di Supabase.";
    }
    return message || "Gagal menyimpan data.";
};

const getProfileDisplayName = (profile) => {
    const composed =
        `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();
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
    projects: { title: "Project", table: "master_projects" },
    job_scopes: { title: "Scope Pekerjaan", table: "master_job_scopes" },
    ac_brands: { title: "Merk AC", table: "master_ac_brands" },
    ac_types: { title: "Tipe AC", table: "master_ac_types" },
    ac_pks: { title: "Jumlah PK", table: "master_ac_pks" },
};

export default function AdminMasterDataModulePage() {
    const { moduleKey } = useParams();
    const cfg = moduleConfig[moduleKey];
    const { alert: showAlert, confirm } = useDialog();
    const {
        options: projectScopeOptions,
        labels: jobScopeLabels,
        reload: reloadJobScopes,
    } = useJobScopeOptions();

    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const [items, setItems] = useState([]);
    const [roles, setRoles] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [roleFilter, setRoleFilter] = useState("all");
    const [projectCustomerFilter, setProjectCustomerFilter] = useState("all");
    const [userSearch, setUserSearch] = useState("");
    const [openModal, setOpenModal] = useState(false);
    const [editUserId, setEditUserId] = useState(null);
    const [editSimpleId, setEditSimpleId] = useState(null);
    const [manageFieldsScope, setManageFieldsScope] = useState(null);
    const [loading, setLoading] = useState(false);

    const [userForm, setUserForm] = useState({
        firstName: "",
        lastName: "",
        email: "",
        password: "",
        role: "customer",
        phone: "",
        technicianType: "internal",
        assignedCustomerId: "",
        internalAssignments: [],
    });
    const [simpleForm, setSimpleForm] = useState({
        customerId: "",
        name: "",
        picName: "",
        projectName: "",
        jobScope: JOB_SCOPES.AC,
        location: "",
        phone: "",
        email: "",
        password: "",
        address: "",
        label: "",
        scopeCode: "",
        scopeLabel: "",
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
            throw new Error(
                "VITE_SUPABASE_KEY tidak ditemukan di environment.",
            );
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

    const loadCustomers = useCallback(async () => {
        const { data, error } = await supabase
            .from("master_customers")
            .select("id, name, phone, address")
            .order("name", { ascending: true });
        if (error) throw error;
        setCustomers(data ?? []);
    }, []);

    const loadItems = useCallback(async () => {
        if (!cfg) return;
        let query = supabase.from(cfg.table).select("*");

        if (moduleKey === "users") {
            query = query.order("created_at", { ascending: false });
        } else if (moduleKey === "customers") {
            query = query.order("created_at", { ascending: false });
        } else if (moduleKey === "projects") {
            query = query.order("created_at", { ascending: false });
        } else if (moduleKey === "job_scopes") {
            query = query.order("label", { ascending: true });
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
                await Promise.all([loadItems(), loadRoles(), loadCustomers()]);
            } catch (error) {
                console.error("Load module failed:", error);
                setItems([]);
            } finally {
                setLoading(false);
            }
        }, 0);
        return () => clearTimeout(timerId);
    }, [loadCustomers, loadItems, loadRoles]);

    const customerOptions = useMemo(
        () =>
            customers.map((item) => ({
                value: item.id,
                label: item.name ?? "-",
            })),
        [customers],
    );

    const customerNameById = useMemo(() => {
        const map = new Map();
        customers.forEach((item) => {
            map.set(item.id, item.name ?? "-");
        });
        return map;
    }, [customers]);

    const roleOptions = useMemo(() => {
        const fromDb = roles.map((r) => r.name);
        return fromDb.length ? fromDb : ["admin", "customer", "technician"];
    }, [roles]);

    const userCustomerAssignmentSummary = useCallback(
        (item) => {
            if (item.role !== "technician") return "-";
            if (item.technician_type === "external") {
                return item.customer_id
                    ? (customerNameById.get(item.customer_id) ?? "1 customer")
                    : "Belum ditentukan";
            }
            if (item.technician_type === "internal") {
                return "Multi-customer";
            }
            return "Belum ditentukan";
        },
        [customerNameById],
    );

    const syncProjectMutation = useCallback(
        async (mode, payload, projectId = null) => {
            const candidates = [
                payload,
                { ...payload, pic_name: undefined },
                { ...payload, job_scope: undefined },
                { ...payload, pic_name: undefined, job_scope: undefined },
            ].map((item) =>
                Object.fromEntries(
                    Object.entries(item).filter(
                        ([, value]) => value !== undefined,
                    ),
                ),
            );

            const seen = new Set();
            let lastError = null;

            for (const nextPayload of candidates) {
                const signature = JSON.stringify(
                    Object.keys(nextPayload).sort(),
                );
                if (seen.has(signature)) continue;
                seen.add(signature);

                const query =
                    mode === "insert"
                        ? supabase.from("master_projects").insert(nextPayload)
                        : supabase
                              .from("master_projects")
                              .update(nextPayload)
                              .eq("id", projectId);

                const { error } = await query;
                if (!error) return;
                if (error.code !== "42703") throw error;
                lastError = error;
            }

            if (lastError) throw lastError;
        },
        [],
    );

    const fetchActiveInternalAssignments = useCallback(async (technicianId) => {
        const { data, error } = await supabase
            .from("technician_customer_assignments")
            .select("customer_id, is_active")
            .eq("technician_id", technicianId);
        if (error) throw error;
        return (data ?? [])
            .filter((item) => item.is_active)
            .map((item) => item.customer_id)
            .filter(Boolean);
    }, []);

    const updateTechnicianTenantConfig = useCallback(
        async ({
            userId,
            role,
            technicianType,
            assignedCustomerId,
            internalAssignments,
        }) => {
            const normalizedTechnicianType =
                role === "technician" ? technicianType || "internal" : null;
            const targetCustomerId =
                role === "technician" && normalizedTechnicianType === "external"
                    ? assignedCustomerId || null
                    : null;

            if (
                role === "technician" &&
                normalizedTechnicianType === "external" &&
                !targetCustomerId
            ) {
                throw new Error(
                    "Technician external wajib punya tepat satu customer.",
                );
            }

            const { error: profileError } = await supabase
                .from("profiles")
                .update({
                    technician_type: normalizedTechnicianType,
                    customer_id: targetCustomerId,
                })
                .eq("id", userId);
            if (profileError) throw profileError;

            const currentAssignments =
                await fetchActiveInternalAssignments(userId);
            const desiredAssignments = Array.from(
                new Set((internalAssignments ?? []).filter(Boolean)),
            );

            if (
                role !== "technician" ||
                normalizedTechnicianType !== "internal"
            ) {
                for (const customerId of currentAssignments) {
                    const { data, error } = await supabase.rpc(
                        "unassign_technician_from_customer",
                        {
                            p_technician_id: userId,
                            p_customer_id: customerId,
                        },
                    );
                    if (error) throw error;
                    if (data?.[0]?.success === false) {
                        throw new Error(
                            data?.[0]?.message || "Unassign gagal.",
                        );
                    }
                }
            }

            if (role !== "technician") {
                return;
            }

            if (normalizedTechnicianType === "external") {
                if (targetCustomerId) {
                    const { data, error } = await supabase.rpc(
                        "assign_external_technician",
                        {
                            p_technician_id: userId,
                            p_customer_id: targetCustomerId,
                        },
                    );
                    if (error) throw error;
                    if (data?.[0]?.success === false) {
                        throw new Error(
                            data?.[0]?.message ||
                                "Assign external technician gagal.",
                        );
                    }
                } else {
                    const { data, error } = await supabase.rpc(
                        "unassign_external_technician",
                        {
                            p_technician_id: userId,
                        },
                    );
                    if (error) throw error;
                    if (data?.[0]?.success === false) {
                        throw new Error(
                            data?.[0]?.message ||
                                "Unassign external technician gagal.",
                        );
                    }
                }
                return;
            }

            const currentSet = new Set(currentAssignments);
            const desiredSet = new Set(desiredAssignments);

            for (const customerId of desiredAssignments) {
                if (currentSet.has(customerId)) continue;
                const { data, error } = await supabase.rpc(
                    "assign_technician_to_customer",
                    {
                        p_technician_id: userId,
                        p_customer_id: customerId,
                    },
                );
                if (error) throw error;
                if (data?.[0]?.success === false) {
                    throw new Error(
                        data?.[0]?.message ||
                            "Assign internal technician gagal.",
                    );
                }
            }

            for (const customerId of currentAssignments) {
                if (desiredSet.has(customerId)) continue;
                const { data, error } = await supabase.rpc(
                    "unassign_technician_from_customer",
                    {
                        p_technician_id: userId,
                        p_customer_id: customerId,
                    },
                );
                if (error) throw error;
                if (data?.[0]?.success === false) {
                    throw new Error(
                        data?.[0]?.message ||
                            "Hapus assignment internal technician gagal.",
                    );
                }
            }
        },
        [fetchActiveInternalAssignments],
    );

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

        if (moduleKey === "projects" && projectCustomerFilter !== "all") {
            data = data.filter(
                (item) => item.customer_id === projectCustomerFilter,
            );
        }
        return data;
    }, [items, moduleKey, projectCustomerFilter, roleFilter, userSearch]);

    const addUser = async () => {
        const fullName = `${userForm.firstName} ${userForm.lastName}`.trim();
        const { error } = await invokeAdminFunction("admin-create-user", {
            email: userForm.email,
            password: userForm.password,
            role: userForm.role,
            first_name: userForm.firstName,
            last_name: userForm.lastName,
            firstName: userForm.firstName,
            lastName: userForm.lastName,
            name: fullName || userForm.firstName || null,
            phone: userForm.phone,
        });
        if (error) throw error;

        const { data: createdProfile, error: profileLookupError } =
            await supabase
                .from("profiles")
                .select("id")
                .eq("email", userForm.email)
                .maybeSingle();
        if (profileLookupError) throw profileLookupError;
        if (!createdProfile?.id) {
            throw new Error("User dibuat tapi profile tidak ditemukan.");
        }

        // Auto-assign internal technicians to ALL customers
        let assignmentsToUse = userForm.internalAssignments;
        if (
            userForm.role === "technician" &&
            userForm.technicianType === "internal"
        ) {
            if (!assignmentsToUse || assignmentsToUse.length === 0) {
                // Fetch all customers
                const { data: allCustomers, error: customersError } =
                    await supabase.from("master_customers").select("id");
                if (customersError) throw customersError;
                assignmentsToUse = (allCustomers || []).map((c) => c.id);
            }
        }

        await updateTechnicianTenantConfig({
            userId: createdProfile.id,
            role: userForm.role,
            technicianType: userForm.technicianType,
            assignedCustomerId: userForm.assignedCustomerId,
            internalAssignments: assignmentsToUse,
        });

        setUserForm({
            firstName: "",
            lastName: "",
            email: "",
            password: "",
            role: "customer",
            phone: "",
            technicianType: "internal",
            assignedCustomerId: "",
            internalAssignments: [],
        });
    };

    const updateUser = async () => {
        if (!editUserId) return;
        const nextPassword = userForm.password.trim();
        const { error } = await invokeAdminFunction(
            "admin-update-user-password",
            {
                user_id: editUserId,
                email: userForm.email,
                role: userForm.role,
                first_name: userForm.firstName,
                last_name: userForm.lastName,
                phone: userForm.phone,
                password: nextPassword || undefined,
            },
        );
        if (error) throw error;

        await updateTechnicianTenantConfig({
            userId: editUserId,
            role: userForm.role,
            technicianType: userForm.technicianType,
            assignedCustomerId: userForm.assignedCustomerId,
            internalAssignments: userForm.internalAssignments,
        });
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
                        firstName,
                        lastName,
                        name: simpleForm.name,
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

            const { data: createdCustomer, error } = await supabase
                .from("master_customers")
                .insert({
                    name: simpleForm.name,
                    location: simpleForm.location,
                    phone: simpleForm.phone,
                    email: simpleForm.email || null,
                    user_id: linkedUserId,
                    address: simpleForm.address,
                })
                .select("id")
                .single();
            if (error) throw error;
            if (!createdCustomer?.id) {
                throw new Error("Gagal menemukan customer yang baru dibuat.");
            }

            const baseProjectPayload = {
                customer_id: createdCustomer.id,
                project_name: simpleForm.projectName,
                job_scope: simpleForm.jobScope,
                location: simpleForm.location,
                phone: simpleForm.phone,
                address: simpleForm.address,
                pic_name: simpleForm.name,
            };
            await syncProjectMutation("insert", baseProjectPayload);
        } else if (moduleKey === "projects") {
            if (!simpleForm.customerId) {
                throw new Error("Customer wajib dipilih.");
            }
            const selectedCustomer = customers.find(
                (item) => item.id === simpleForm.customerId,
            );
            const basePayload = {
                customer_id: simpleForm.customerId,
                project_name: simpleForm.projectName,
                job_scope: simpleForm.jobScope,
                location: simpleForm.location,
                phone:
                    String(simpleForm.phone ?? "").trim() ||
                    String(selectedCustomer?.phone ?? "").trim() ||
                    "-",
                address:
                    String(simpleForm.address ?? "").trim() ||
                    String(selectedCustomer?.address ?? "").trim() ||
                    "",
                pic_name:
                    String(simpleForm.picName ?? "").trim() ||
                    String(selectedCustomer?.name ?? "").trim() ||
                    null,
            };
            await syncProjectMutation("insert", basePayload);
        } else if (moduleKey === "job_scopes") {
            const code = normalizeJobScopeCode(simpleForm.scopeCode);
            const label = String(simpleForm.scopeLabel ?? "").trim();
            if (!code || !label) {
                throw new Error("Kode dan label scope pekerjaan wajib diisi.");
            }
            const { error } = await supabase
                .from("master_job_scopes")
                .insert({ code, label });
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
            customerId: "",
            name: "",
            picName: "",
            projectName: "",
            jobScope: JOB_SCOPES.AC,
            location: "",
            phone: "",
            email: "",
            password: "",
            address: "",
            label: "",
            scopeCode: "",
            scopeLabel: "",
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
                    location: simpleForm.location,
                    phone: simpleForm.phone,
                    email: simpleForm.email || null,
                    address: simpleForm.address,
                })
                .eq("id", editSimpleId);
            if (error) throw error;
        } else if (moduleKey === "projects") {
            if (!simpleForm.customerId) {
                throw new Error("Customer wajib dipilih.");
            }
            const selectedCustomer = customers.find(
                (item) => item.id === simpleForm.customerId,
            );
            const selectedItem = items.find((item) => item.id === editSimpleId);
            const basePayload = {
                customer_id: simpleForm.customerId,
                project_name: simpleForm.projectName,
                job_scope: simpleForm.jobScope,
                location: simpleForm.location,
                phone:
                    String(simpleForm.phone ?? "").trim() ||
                    String(selectedItem?.phone ?? "").trim() ||
                    String(selectedCustomer?.phone ?? "").trim() ||
                    "-",
                address:
                    String(simpleForm.address ?? "").trim() ||
                    String(selectedCustomer?.address ?? "").trim() ||
                    "",
                pic_name:
                    String(simpleForm.picName ?? "").trim() ||
                    String(selectedCustomer?.name ?? "").trim() ||
                    null,
            };
            await syncProjectMutation("update", basePayload, editSimpleId);
        } else if (moduleKey === "job_scopes") {
            const code = normalizeJobScopeCode(simpleForm.scopeCode);
            const label = String(simpleForm.scopeLabel ?? "").trim();
            if (!code || !label) {
                throw new Error("Kode dan label scope pekerjaan wajib diisi.");
            }
            const { error } = await supabase
                .from("master_job_scopes")
                .update({ code, label })
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

    const deleteCustomerData = async (customerIds) => {
        if (!customerIds.length) return;

        const { data: requestRows, error: requestFetchError } = await supabase
            .from("requests")
            .select("before_photo_url, progress_photo_url, after_photo_url")
            .in("customer_id", customerIds);
        if (requestFetchError) throw requestFetchError;

        const photoUrls = [];
        (requestRows ?? []).forEach((row) => {
            if (row?.before_photo_url) photoUrls.push(row.before_photo_url);
            if (row?.progress_photo_url) photoUrls.push(row.progress_photo_url);
            if (row?.after_photo_url) photoUrls.push(row.after_photo_url);
        });

        if (photoUrls.length > 0) {
            try {
                const paths = photoUrls
                    .map((url) => {
                        const parts = String(url ?? "").split("/job-photos/");
                        return parts.length > 1 ? parts[1] : null;
                    })
                    .filter(Boolean);

                if (paths.length > 0) {
                    await supabase.storage.from("job-photos").remove(paths);
                }
            } catch (photoError) {
                console.error("Error deleting customer photos:", photoError);
                // Continue even if photo delete fails
            }
        }

        const { error: deleteRequestsError } = await supabase
            .from("requests")
            .delete()
            .in("customer_id", customerIds);
        if (deleteRequestsError) throw deleteRequestsError;

        const { error: deleteProjectsError } = await supabase
            .from("master_projects")
            .delete()
            .in("customer_id", customerIds);
        if (deleteProjectsError) throw deleteProjectsError;

        const { error: deleteCustomersError } = await supabase
            .from("master_customers")
            .delete()
            .in("id", customerIds);
        if (deleteCustomersError) throw deleteCustomersError;
    };

    const deleteItem = async (itemId, linkedEmail = "") => {
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

                // Delete linked customer + requests first, before profile deletion sets user_id to null.
                let linkedCustomerIds = [];
                const normalizedEmail = String(linkedEmail ?? "").trim();
                const customerQuery = normalizedEmail
                    ? supabase
                          .from("master_customers")
                          .select("id")
                          .or(
                              `user_id.eq.${itemId},email.eq.${normalizedEmail}`,
                          )
                    : supabase
                          .from("master_customers")
                          .select("id")
                          .eq("user_id", itemId);

                const { data: linkedCustomers, error: linkedCustomersError } =
                    await customerQuery;
                if (linkedCustomersError) throw linkedCustomersError;
                linkedCustomerIds = (linkedCustomers ?? []).map(
                    (row) => row.id,
                );

                if (linkedCustomerIds.length > 0) {
                    await deleteCustomerData(linkedCustomerIds);
                }

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

                await deleteCustomerData([itemId]);
            } else {
                const confirmed = await confirm(
                    "Yakin ingin menghapus data ini?",
                    {
                        title: "Konfirmasi Hapus",
                        confirmText: "Hapus",
                        cancelText: "Batal",
                        danger: true,
                    },
                );
                if (!confirmed) return;

                const { error } = await supabase
                    .from(cfg.table)
                    .delete()
                    .eq("id", itemId);
                if (error) throw error;
            }

            await loadItems();
            if (moduleKey === "job_scopes") {
                await reloadJobScopes();
            }
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
            technicianType: "internal",
            assignedCustomerId: "",
            internalAssignments: [],
        });
        setSimpleForm({
            customerId: "",
            name: "",
            picName: "",
            projectName: "",
            jobScope: JOB_SCOPES.AC,
            location: "",
            phone: "",
            email: "",
            password: "",
            address: "",
            label: "",
            scopeCode: "",
            scopeLabel: "",
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
            if (moduleKey === "job_scopes") {
                await reloadJobScopes();
            }
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
                                    onChange={(nextValue) =>
                                        setRoleFilter(nextValue)
                                    }
                                    options={[
                                        { value: "all", label: "Semua Role" },
                                        ...roleOptions.map((role) => ({
                                            value: role,
                                            label: role,
                                        })),
                                    ]}
                                    className="mt-0 min-w-42.5 bg-white"
                                />
                            )}
                            {moduleKey === "projects" && (
                                <CustomSelect
                                    value={projectCustomerFilter}
                                    onChange={(nextValue) =>
                                        setProjectCustomerFilter(nextValue)
                                    }
                                    options={[
                                        {
                                            value: "all",
                                            label: "Semua Customer",
                                        },
                                        ...customerOptions,
                                    ]}
                                    className="mt-0 min-w-52 bg-white"
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
                                    : moduleKey === "projects"
                                      ? "Tambah Project"
                                      : "Tambah Data"}
                            </button>
                        </div>
                    </div>

                    <section className="mt-6 w-full overflow-hidden rounded-2xl bg-white shadow-sm">
                        {moduleKey === "users" && (
                            <div className="border-b border-slate-200 px-4 py-3">
                                <input
                                    value={userSearch}
                                    onChange={(e) =>
                                        setUserSearch(e.target.value)
                                    }
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
                                <table className="w-full min-w-160 text-left text-sm">
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
                                                        Tipe Teknisi
                                                    </th>
                                                    <th className="px-3 py-3">
                                                        Akses Customer
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
                                                        Nama Customer
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
                                            {moduleKey === "projects" && (
                                                <>
                                                    <th className="px-3 py-3">
                                                        Nama Customer
                                                    </th>
                                                    <th className="px-3 py-3">
                                                        Nama Proyek
                                                    </th>
                                                    <th className="px-3 py-3">
                                                        Scope
                                                    </th>
                                                    <th className="px-3 py-3">
                                                        Lokasi
                                                    </th>
                                                    <th className="px-3 py-3">
                                                        No. Telp
                                                    </th>
                                                    <th className="px-3 py-3">
                                                        Alamat
                                                    </th>
                                                    <th className="px-3 py-3">
                                                        PIC Proyek
                                                    </th>
                                                    <th className="px-3 py-3">
                                                        Aksi
                                                    </th>
                                                </>
                                            )}
                                            {moduleKey === "job_scopes" && (
                                                <>
                                                    <th className="px-3 py-3">
                                                        Kode
                                                    </th>
                                                    <th className="px-3 py-3">
                                                        Label
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
                                                            {getProfileDisplayName(
                                                                item,
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600">
                                                            {item.email ?? "-"}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600">
                                                            {item.role ?? "-"}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600">
                                                            {item.role ===
                                                            "technician"
                                                                ? (item.technician_type ??
                                                                  "-")
                                                                : "-"}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600">
                                                            {userCustomerAssignmentSummary(
                                                                item,
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600">
                                                            {item.phone ?? "-"}
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const {
                                                                            firstName,
                                                                            lastName,
                                                                        } =
                                                                            splitName(
                                                                                getProfileDisplayName(
                                                                                    item,
                                                                                ),
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
                                                                                technicianType:
                                                                                    item.technician_type ??
                                                                                    "internal",
                                                                                assignedCustomerId:
                                                                                    item.customer_id ??
                                                                                    "",
                                                                                internalAssignments:
                                                                                    [],
                                                                            },
                                                                        );
                                                                        if (
                                                                            item.role ===
                                                                                "technician" &&
                                                                            item.technician_type ===
                                                                                "internal"
                                                                        ) {
                                                                            fetchActiveInternalAssignments(
                                                                                item.id,
                                                                            )
                                                                                .then(
                                                                                    (
                                                                                        internalAssignments,
                                                                                    ) => {
                                                                                        setUserForm(
                                                                                            (
                                                                                                prev,
                                                                                            ) => ({
                                                                                                ...prev,
                                                                                                internalAssignments,
                                                                                            }),
                                                                                        );
                                                                                    },
                                                                                )
                                                                                .catch(
                                                                                    (
                                                                                        error,
                                                                                    ) => {
                                                                                        console.error(
                                                                                            "Load technician assignments failed:",
                                                                                            error,
                                                                                        );
                                                                                    },
                                                                                );
                                                                        }
                                                                        setOpenModal(
                                                                            true,
                                                                        );
                                                                    }}
                                                                    className="inline-flex cursor-pointer rounded-md p-1 text-slate-500 hover:bg-slate-100"
                                                                    title="Edit"
                                                                >
                                                                    <Pencil
                                                                        size={
                                                                            14
                                                                        }
                                                                    />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        deleteItem(
                                                                            item.id,
                                                                            item.email ??
                                                                                "",
                                                                        )
                                                                    }
                                                                    className="inline-flex cursor-pointer rounded-md p-1 text-rose-500 hover:bg-rose-50"
                                                                    title="Hapus"
                                                                >
                                                                    <Trash2
                                                                        size={
                                                                            14
                                                                        }
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
                                                                                customerId:
                                                                                    "",
                                                                                name:
                                                                                    item.name ??
                                                                                    "",
                                                                                picName:
                                                                                    "",
                                                                                projectName:
                                                                                    "",
                                                                                location:
                                                                                    "",
                                                                                phone: "",
                                                                                email: "",
                                                                                password:
                                                                                    "",
                                                                                address:
                                                                                    "",
                                                                                label: "",
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
                                                                        size={
                                                                            14
                                                                        }
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
                                                                        size={
                                                                            14
                                                                        }
                                                                    />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </>
                                                )}
                                                {moduleKey === "customers" && (
                                                    <>
                                                        <td className="px-3 py-3 font-medium text-slate-800">
                                                            {item.name ?? "-"}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600">
                                                            {item.location ??
                                                                "-"}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600">
                                                            {item.phone ?? "-"}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600">
                                                            {item.email ?? "-"}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600">
                                                            {item.address ??
                                                                "-"}
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
                                                                                customerId:
                                                                                    "",
                                                                                name:
                                                                                    item.name ??
                                                                                    "",
                                                                                picName:
                                                                                    "",
                                                                                projectName:
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
                                                                                label: "",
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
                                                                        size={
                                                                            14
                                                                        }
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
                                                                        size={
                                                                            14
                                                                        }
                                                                    />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </>
                                                )}
                                                {moduleKey === "projects" && (
                                                    <>
                                                        <td className="px-3 py-3 font-medium text-slate-800">
                                                            {customerNameById.get(
                                                                item.customer_id,
                                                            ) ?? "-"}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600">
                                                            {item.project_name ??
                                                                "-"}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600">
                                                            {jobScopeLabels[
                                                                item.job_scope
                                                            ] ??
                                                                item.job_scope ??
                                                                "AC"}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600">
                                                            {item.location ??
                                                                "-"}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600">
                                                            {item.phone ?? "-"}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600">
                                                            {item.address ??
                                                                "-"}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600">
                                                            {String(
                                                                item.pic_name ??
                                                                    "",
                                                            ).trim() ||
                                                                customerNameById.get(
                                                                    item.customer_id,
                                                                ) ||
                                                                "-"}
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
                                                                                customerId:
                                                                                    item.customer_id ??
                                                                                    "",
                                                                                name: "",
                                                                                picName:
                                                                                    item.pic_name ??
                                                                                    "",
                                                                                projectName:
                                                                                    item.project_name ??
                                                                                    "",
                                                                                jobScope:
                                                                                    item.job_scope ??
                                                                                    JOB_SCOPES.AC,
                                                                                location:
                                                                                    item.location ??
                                                                                    "",
                                                                                phone:
                                                                                    item.phone ??
                                                                                    "",
                                                                                email: "",
                                                                                password:
                                                                                    "",
                                                                                address:
                                                                                    item.address ??
                                                                                    "",
                                                                                label: "",
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
                                                                        size={
                                                                            14
                                                                        }
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
                                                                        size={
                                                                            14
                                                                        }
                                                                    />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </>
                                                )}
                                                {moduleKey === "job_scopes" && (
                                                    <>
                                                        <td className="px-3 py-3 font-medium text-slate-800">
                                                            {item.code ?? "-"}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600">
                                                            {item.label ?? "-"}
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
                                                                                customerId:
                                                                                    "",
                                                                                name: "",
                                                                                picName:
                                                                                    "",
                                                                                projectName:
                                                                                    "",
                                                                                jobScope:
                                                                                    JOB_SCOPES.AC,
                                                                                location:
                                                                                    "",
                                                                                phone: "",
                                                                                email: "",
                                                                                password:
                                                                                    "",
                                                                                address:
                                                                                    "",
                                                                                label: "",
                                                                                scopeCode:
                                                                                    item.code ??
                                                                                    "",
                                                                                scopeLabel:
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
                                                                        size={
                                                                            14
                                                                        }
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
                                                                        size={
                                                                            14
                                                                        }
                                                                    />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setManageFieldsScope(
                                                                            item,
                                                                        )
                                                                    }
                                                                    className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-sky-600 hover:bg-sky-50"
                                                                    title="Manage Detail Fields"
                                                                >
                                                                    <Settings2
                                                                        size={
                                                                            14
                                                                        }
                                                                    />
                                                                    <span className="text-xs font-semibold">
                                                                        Fields
                                                                    </span>
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
                                                                                customerId:
                                                                                    "",
                                                                                name:
                                                                                    item.name ??
                                                                                    "",
                                                                                picName:
                                                                                    "",
                                                                                projectName:
                                                                                    "",
                                                                                location:
                                                                                    "",
                                                                                phone: "",
                                                                                email: "",
                                                                                password:
                                                                                    "",
                                                                                address:
                                                                                    "",
                                                                                label: "",
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
                                                                        size={
                                                                            14
                                                                        }
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
                                                                        size={
                                                                            14
                                                                        }
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
                                                                                customerId:
                                                                                    "",
                                                                                name: "",
                                                                                picName:
                                                                                    "",
                                                                                projectName:
                                                                                    "",
                                                                                location:
                                                                                    "",
                                                                                phone: "",
                                                                                email: "",
                                                                                password:
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
                                                                        size={
                                                                            14
                                                                        }
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
                                                                        size={
                                                                            14
                                                                        }
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
                <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 p-4">
                    <div className="flex min-h-full items-start justify-center py-6 md:items-center md:py-0">
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
                                            placeholder="Boleh dikosongkan"
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
                                            options={roleOptions.map(
                                                (role) => ({
                                                    value: role,
                                                    label: role,
                                                }),
                                            )}
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
                                    {userForm.role === "technician" && (
                                        <>
                                            <label>
                                                <span className="text-sm font-medium text-slate-700">
                                                    Tipe Teknisi
                                                </span>
                                                <CustomSelect
                                                    value={
                                                        userForm.technicianType
                                                    }
                                                    onChange={(nextValue) =>
                                                        setUserForm((prev) => ({
                                                            ...prev,
                                                            technicianType:
                                                                nextValue,
                                                            assignedCustomerId:
                                                                nextValue ===
                                                                "external"
                                                                    ? prev.assignedCustomerId
                                                                    : "",
                                                        }))
                                                    }
                                                    options={
                                                        TECHNICIAN_TYPE_OPTIONS
                                                    }
                                                />
                                            </label>
                                            {userForm.technicianType ===
                                            "external" ? (
                                                <label>
                                                    <span className="text-sm font-medium text-slate-700">
                                                        Customer External
                                                    </span>
                                                    <CustomSelect
                                                        value={
                                                            userForm.assignedCustomerId
                                                        }
                                                        onChange={(nextValue) =>
                                                            setUserForm(
                                                                (prev) => ({
                                                                    ...prev,
                                                                    assignedCustomerId:
                                                                        nextValue,
                                                                }),
                                                            )
                                                        }
                                                        options={[
                                                            {
                                                                value: "",
                                                                label: "Pilih customer",
                                                            },
                                                            ...customerOptions,
                                                        ]}
                                                        placeholder="Pilih satu customer"
                                                    />
                                                </label>
                                            ) : (
                                                <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                    <p className="text-sm font-medium text-slate-700">
                                                        Assignment Customer
                                                        Internal
                                                    </p>
                                                    <p className="mt-1 text-xs text-slate-500">
                                                        Teknisi internal bisa
                                                        di-assign ke lebih dari
                                                        satu customer.
                                                    </p>
                                                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                                                        {customers.map(
                                                            (customer) => {
                                                                const checked =
                                                                    userForm.internalAssignments.includes(
                                                                        customer.id,
                                                                    );
                                                                return (
                                                                    <label
                                                                        key={
                                                                            customer.id
                                                                        }
                                                                        className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                                                                    >
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={
                                                                                checked
                                                                            }
                                                                            onChange={(
                                                                                e,
                                                                            ) =>
                                                                                setUserForm(
                                                                                    (
                                                                                        prev,
                                                                                    ) => ({
                                                                                        ...prev,
                                                                                        internalAssignments:
                                                                                            e
                                                                                                .target
                                                                                                .checked
                                                                                                ? Array.from(
                                                                                                      new Set(
                                                                                                          [
                                                                                                              ...prev.internalAssignments,
                                                                                                              customer.id,
                                                                                                          ],
                                                                                                      ),
                                                                                                  )
                                                                                                : prev.internalAssignments.filter(
                                                                                                      (
                                                                                                          id,
                                                                                                      ) =>
                                                                                                          id !==
                                                                                                          customer.id,
                                                                                                  ),
                                                                                    }),
                                                                                )
                                                                            }
                                                                            className="mt-1"
                                                                        />
                                                                        <span>
                                                                            {customer.name ??
                                                                                "-"}
                                                                        </span>
                                                                    </label>
                                                                );
                                                            },
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
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
                                            Nama Customer
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
                                            Nama Proyek Awal
                                        </span>
                                        {editSimpleId ? (
                                            <input
                                                value="Atur di menu Project"
                                                readOnly
                                                className={inputClass}
                                            />
                                        ) : (
                                            <input
                                                value={simpleForm.projectName}
                                                onChange={(e) =>
                                                    setSimpleForm((prev) => ({
                                                        ...prev,
                                                        projectName:
                                                            e.target.value,
                                                    }))
                                                }
                                                className={inputClass}
                                                required
                                            />
                                        )}
                                    </label>
                                    <label>
                                        <span className="text-sm font-medium text-slate-700">
                                            Scope Proyek
                                        </span>
                                        <CustomSelect
                                            value={simpleForm.jobScope}
                                            onChange={(nextValue) =>
                                                setSimpleForm((prev) => ({
                                                    ...prev,
                                                    jobScope: nextValue,
                                                }))
                                            }
                                            options={projectScopeOptions}
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
                                                        password:
                                                            e.target.value,
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

                            {moduleKey === "projects" && (
                                <>
                                    <label className="md:col-span-2">
                                        <span className="text-sm font-medium text-slate-700">
                                            Customer
                                        </span>
                                        <CustomSelect
                                            value={simpleForm.customerId}
                                            onChange={(nextValue) =>
                                                setSimpleForm((prev) => ({
                                                    ...prev,
                                                    customerId: nextValue,
                                                }))
                                            }
                                            options={customerOptions}
                                            placeholder="Pilih customer"
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
                                            Scope Proyek
                                        </span>
                                        <CustomSelect
                                            value={simpleForm.jobScope}
                                            onChange={(nextValue) =>
                                                setSimpleForm((prev) => ({
                                                    ...prev,
                                                    jobScope: nextValue,
                                                }))
                                            }
                                            options={projectScopeOptions}
                                        />
                                    </label>
                                    <label>
                                        <span className="text-sm font-medium text-slate-700">
                                            Lokasi
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
                                            Nama PIC Proyek (opsional)
                                        </span>
                                        <input
                                            value={simpleForm.picName}
                                            onChange={(e) =>
                                                setSimpleForm((prev) => ({
                                                    ...prev,
                                                    picName: e.target.value,
                                                }))
                                            }
                                            className={inputClass}
                                            placeholder="Kosongkan jika pakai nama customer"
                                        />
                                    </label>
                                    <label>
                                        <span className="text-sm font-medium text-slate-700">
                                            No. Telp PIC (opsional)
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
                                            placeholder="Kosongkan jika sama dengan customer"
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
                                </>
                            )}

                            {moduleKey === "job_scopes" && (
                                <>
                                    <label>
                                        <span className="text-sm font-medium text-slate-700">
                                            Kode Scope
                                        </span>
                                        <input
                                            value={simpleForm.scopeCode}
                                            onChange={(e) =>
                                                setSimpleForm((prev) => ({
                                                    ...prev,
                                                    scopeCode:
                                                        e.target.value,
                                                }))
                                            }
                                            className={inputClass}
                                            placeholder="Contoh: SECURITY_SYSTEM"
                                            required
                                        />
                                    </label>
                                    <label>
                                        <span className="text-sm font-medium text-slate-700">
                                            Label Scope
                                        </span>
                                        <input
                                            value={simpleForm.scopeLabel}
                                            onChange={(e) =>
                                                setSimpleForm((prev) => ({
                                                    ...prev,
                                                    scopeLabel:
                                                        e.target.value,
                                                }))
                                            }
                                            className={inputClass}
                                            placeholder="Contoh: Security System"
                                            required
                                        />
                                    </label>
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
                </div>
            )}

            {manageFieldsScope && (
                <ScopeDetailFieldsManagerModal
                    isOpen={Boolean(manageFieldsScope)}
                    scope={manageFieldsScope}
                    onClose={() => setManageFieldsScope(null)}
                />
            )}
        </div>
    );
}
