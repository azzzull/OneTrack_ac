import { useEffect, useMemo, useState } from "react";
import { Save, ShieldCheck } from "lucide-react";
import Sidebar, { MobileBottomNav } from "@/components/layout/sidebar";
import useSidebarCollapsed from "@/hooks/useSidebarCollapsed";
import { useAuth } from "@/context/useAuth";
import { useDialog } from "@/context/useDialog";
import supabase from "@/supabaseClient";

const inputClass =
    "mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-300 focus:bg-white";

export default function ProfilePage() {
    const { user, role, refreshProfile } = useAuth();
    const { alert: showAlert } = useDialog();
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();

    const [loading, setLoading] = useState(true);
    const [savingProfile, setSavingProfile] = useState(false);
    const [savingPassword, setSavingPassword] = useState(false);

    const [profileForm, setProfileForm] = useState({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
    });
    const [passwordForm, setPasswordForm] = useState({
        oldPassword: "",
        newPassword: "",
        confirmPassword: "",
    });

    const fullName = useMemo(
        () =>
            `${profileForm.firstName} ${profileForm.lastName}`.trim() ||
            user?.email ||
            "-",
        [profileForm.firstName, profileForm.lastName, user?.email],
    );

    useEffect(() => {
        let mounted = true;

        const loadProfile = async () => {
            if (!user?.id) return;
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from("profiles")
                    .select("first_name, last_name, email, phone")
                    .eq("id", user.id)
                    .single();
                if (error) throw error;
                if (!mounted) return;
                setProfileForm({
                    firstName: data?.first_name ?? "",
                    lastName: data?.last_name ?? "",
                    email: data?.email ?? user.email ?? "",
                    phone: data?.phone ?? "",
                });
            } catch (error) {
                console.error("Load profile failed:", error);
                if (mounted) {
                    await showAlert("Gagal memuat profil user.", {
                        title: "Profil Gagal Dimuat",
                    });
                }
            } finally {
                if (mounted) setLoading(false);
            }
        };

        loadProfile();
        return () => {
            mounted = false;
        };
    }, [showAlert, user?.email, user?.id]);

    const updateProfile = async (event) => {
        event.preventDefault();
        if (!user?.id) return;

        setSavingProfile(true);
        try {
            const firstName = profileForm.firstName.trim();
            const lastName = profileForm.lastName.trim();
            const email = profileForm.email.trim();
            const phone = profileForm.phone.trim();

            if (!firstName || !email) {
                await showAlert("Nama depan dan email wajib diisi.", {
                    title: "Data Belum Lengkap",
                });
                return;
            }

            const authPayload = {
                data: {
                    first_name: firstName,
                    last_name: lastName,
                    full_name: `${firstName} ${lastName}`.trim(),
                    phone,
                },
            };

            if (email !== (user.email ?? "")) {
                authPayload.email = email;
            }

            const { error: authError } = await supabase.auth.updateUser(authPayload);
            if (authError) throw authError;

            const { error: profileError } = await supabase
                .from("profiles")
                .update({
                    first_name: firstName,
                    last_name: lastName,
                    email,
                    phone,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", user.id);
            if (profileError) throw profileError;
            if (typeof refreshProfile === "function") {
                await refreshProfile();
            }

            await showAlert("Profil berhasil diperbarui.", {
                title: "Update Profil Berhasil",
            });
        } catch (error) {
            console.error("Update profile failed:", error);
            await showAlert(
                String(error?.message ?? "Gagal memperbarui profil."),
                { title: "Update Profil Gagal" },
            );
        } finally {
            setSavingProfile(false);
        }
    };

    const updatePassword = async (event) => {
        event.preventDefault();
        if (!user?.email) return;

        const oldPassword = passwordForm.oldPassword;
        const newPassword = passwordForm.newPassword;
        const confirmPassword = passwordForm.confirmPassword;

        if (!oldPassword || !newPassword || !confirmPassword) {
            await showAlert("Lengkapi password lama, password baru, dan konfirmasi.", {
                title: "Data Password Belum Lengkap",
            });
            return;
        }
        if (newPassword.length < 6) {
            await showAlert("Password baru minimal 6 karakter.", {
                title: "Password Tidak Valid",
            });
            return;
        }
        if (newPassword !== confirmPassword) {
            await showAlert("Konfirmasi password baru tidak sama.", {
                title: "Password Tidak Sama",
            });
            return;
        }

        setSavingPassword(true);
        try {
            const { error: reauthError } = await supabase.auth.signInWithPassword({
                email: user.email,
                password: oldPassword,
            });
            if (reauthError) {
                throw new Error("Password lama salah.");
            }

            const { error: passwordError } = await supabase.auth.updateUser({
                password: newPassword,
            });
            if (passwordError) throw passwordError;

            setPasswordForm({
                oldPassword: "",
                newPassword: "",
                confirmPassword: "",
            });
            await showAlert("Password berhasil diperbarui.", {
                title: "Ganti Password Berhasil",
            });
        } catch (error) {
            console.error("Update password failed:", error);
            await showAlert(
                String(error?.message ?? "Gagal memperbarui password."),
                { title: "Ganti Password Gagal" },
            );
        } finally {
            setSavingPassword(false);
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
                    <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">
                        Profil Saya
                    </h1>
                    <p className="mt-1 text-slate-600">
                        Kelola data akun dan keamanan login anda.
                    </p>

                    {loading ? (
                        <p className="mt-6 text-sm text-slate-500">
                            Memuat data profil...
                        </p>
                    ) : (
                        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <section className="rounded-2xl bg-white p-5 shadow-sm">
                                <h2 className="text-lg font-semibold text-slate-900">
                                    Detail User
                                </h2>
                                <p className="mt-1 text-sm text-slate-500">{fullName}</p>
                                <p className="text-xs uppercase tracking-wide text-sky-600">
                                    Role: {role ?? "-"}
                                </p>

                                <form onSubmit={updateProfile} className="mt-4 space-y-3">
                                    <label className="block">
                                        <span className="text-sm font-medium text-slate-700">
                                            First Name
                                        </span>
                                        <input
                                            value={profileForm.firstName}
                                            onChange={(e) =>
                                                setProfileForm((prev) => ({
                                                    ...prev,
                                                    firstName: e.target.value,
                                                }))
                                            }
                                            className={inputClass}
                                            required
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="text-sm font-medium text-slate-700">
                                            Last Name
                                        </span>
                                        <input
                                            value={profileForm.lastName}
                                            onChange={(e) =>
                                                setProfileForm((prev) => ({
                                                    ...prev,
                                                    lastName: e.target.value,
                                                }))
                                            }
                                            className={inputClass}
                                            placeholder="Opsional"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="text-sm font-medium text-slate-700">
                                            Email
                                        </span>
                                        <input
                                            type="email"
                                            value={profileForm.email}
                                            onChange={(e) =>
                                                setProfileForm((prev) => ({
                                                    ...prev,
                                                    email: e.target.value,
                                                }))
                                            }
                                            className={inputClass}
                                            required
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="text-sm font-medium text-slate-700">
                                            Telepon
                                        </span>
                                        <input
                                            value={profileForm.phone}
                                            onChange={(e) =>
                                                setProfileForm((prev) => ({
                                                    ...prev,
                                                    phone: e.target.value,
                                                }))
                                            }
                                            className={inputClass}
                                        />
                                    </label>
                                    <button
                                        type="submit"
                                        disabled={savingProfile}
                                        className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        <Save size={15} />
                                        {savingProfile
                                            ? "Menyimpan..."
                                            : "Simpan Profil"}
                                    </button>
                                </form>
                            </section>

                            <section className="rounded-2xl bg-white p-5 shadow-sm">
                                <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
                                    <ShieldCheck size={18} />
                                    Keamanan
                                </h2>
                                <p className="mt-1 text-sm text-slate-500">
                                    Ubah password dengan verifikasi password lama.
                                </p>

                                <form onSubmit={updatePassword} className="mt-4 space-y-3">
                                    <label className="block">
                                        <span className="text-sm font-medium text-slate-700">
                                            Password Lama
                                        </span>
                                        <input
                                            type="password"
                                            value={passwordForm.oldPassword}
                                            onChange={(e) =>
                                                setPasswordForm((prev) => ({
                                                    ...prev,
                                                    oldPassword: e.target.value,
                                                }))
                                            }
                                            className={inputClass}
                                            required
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="text-sm font-medium text-slate-700">
                                            Password Baru
                                        </span>
                                        <input
                                            type="password"
                                            value={passwordForm.newPassword}
                                            onChange={(e) =>
                                                setPasswordForm((prev) => ({
                                                    ...prev,
                                                    newPassword: e.target.value,
                                                }))
                                            }
                                            className={inputClass}
                                            required
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="text-sm font-medium text-slate-700">
                                            Konfirmasi Password Baru
                                        </span>
                                        <input
                                            type="password"
                                            value={passwordForm.confirmPassword}
                                            onChange={(e) =>
                                                setPasswordForm((prev) => ({
                                                    ...prev,
                                                    confirmPassword: e.target.value,
                                                }))
                                            }
                                            className={inputClass}
                                            required
                                        />
                                    </label>

                                    <button
                                        type="submit"
                                        disabled={savingPassword}
                                        className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        <ShieldCheck size={15} />
                                        {savingPassword
                                            ? "Memproses..."
                                            : "Ganti Password"}
                                    </button>
                                </form>
                            </section>
                        </div>
                    )}
                </main>
            </div>

            <MobileBottomNav />
        </div>
    );
}
