import { useCallback, useEffect, useState } from "react";
import supabase from "../supabaseClient";
import { AuthContext } from "./AuthContextValue";
import {
    cleanupAllChannels,
    markUserLoggedOut,
} from "../utils/realtimeChannelManager";

const AUTH_PROFILE_CACHE_KEY = "onetrack.auth.profile";

const fetchUserProfile = async (userId) => {
    const { data, error } = await supabase
        .from("profiles")
        .select(
            "role, first_name, last_name, email, phone, technician_type, customer_id",
        )
        .eq("id", userId)
        .maybeSingle();

    if (error) throw error;
    return data ?? null;
};

const getInitialOnlineState = () => {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine;
};

const readCachedProfile = (userId) => {
    if (!userId || typeof window === "undefined") return null;

    try {
        const cached = window.localStorage.getItem(AUTH_PROFILE_CACHE_KEY);
        if (!cached) return null;

        const parsed = JSON.parse(cached);
        if (parsed?.userId !== userId) return null;

        return parsed.profile ?? null;
    } catch (error) {
        console.warn("[AuthContext] Failed to read cached profile:", error);
        return null;
    }
};

const writeCachedProfile = (userId, profile) => {
    if (!userId || !profile || typeof window === "undefined") return;

    try {
        window.localStorage.setItem(
            AUTH_PROFILE_CACHE_KEY,
            JSON.stringify({
                userId,
                profile,
                cachedAt: new Date().toISOString(),
            }),
        );
    } catch (error) {
        console.warn("[AuthContext] Failed to cache profile:", error);
    }
};

const clearCachedProfile = () => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(AUTH_PROFILE_CACHE_KEY);
};

const isSessionExpired = (session) => {
    const expiresAtMs = Number(session?.expires_at ?? 0) * 1000;
    return Boolean(expiresAtMs && expiresAtMs <= Date.now());
};

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [role, setRole] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isOnline, setIsOnline] = useState(getInitialOnlineState);

    const applyProfile = useCallback((nextProfile) => {
        setProfile(nextProfile);
        setRole(nextProfile?.role ?? null);
    }, []);

    const syncUserProfile = useCallback(
        async (userId, options = {}) => {
            const { finishLoading = true } = options;
            if (!userId) {
                if (finishLoading) setLoading(false);
                return;
            }

            try {
                const nextProfile = await fetchUserProfile(userId);
                applyProfile(nextProfile);
                writeCachedProfile(userId, nextProfile);
            } catch (error) {
                console.error("Error fetching profile:", error);
                const cachedProfile = readCachedProfile(userId);
                if (cachedProfile) {
                    applyProfile(cachedProfile);
                }
            } finally {
                if (finishLoading) {
                    setLoading(false);
                }
            }
        },
        [applyProfile],
    );

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => {
            console.log("[AuthContext] offline mode detected");
            setIsOnline(false);
        };

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);

        if (!getInitialOnlineState()) {
            console.log("[AuthContext] offline mode detected");
        }

        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        const clearAuthState = async ({ signOut = false } = {}) => {
            if (signOut) {
                try {
                    await supabase.auth.signOut({ scope: "local" });
                } catch (error) {
                    console.warn("[AuthContext] Local sign out failed:", error);
                }
            }

            if (cancelled) return;
            clearCachedProfile();
            await cleanupAllChannels();
            markUserLoggedOut();
            setUser(null);
            setProfile(null);
            setRole(null);
            setLoading(false);
        };

        const restoreLocalSession = async () => {
            const {
                data: { session },
                error,
            } = await supabase.auth.getSession();

            if (cancelled) return;

            if (error) {
                console.error("[AuthContext] Error loading local session:", error);
                await clearAuthState();
                return;
            }

            if (!session?.user) {
                setUser(null);
                setProfile(null);
                setRole(null);
                setLoading(false);
                return;
            }

            console.log("[AuthContext] local session found");
            setUser(session.user);

            const cachedProfile = readCachedProfile(session.user.id);
            if (cachedProfile) {
                applyProfile(cachedProfile);
            } else {
                setProfile(null);
                setRole(null);
            }
            setLoading(false);

            if (!getInitialOnlineState()) {
                console.log("[AuthContext] offline mode detected");
                return;
            }

            try {
                const { data, error: refreshError } =
                    await supabase.auth.refreshSession(session);

                if (cancelled) return;

                if (refreshError || !data?.session?.user) {
                    console.error(
                        "[AuthContext] background session refresh fail:",
                        refreshError,
                    );
                    if (isSessionExpired(session)) {
                        await clearAuthState({ signOut: true });
                    }
                    return;
                }

                console.log("[AuthContext] background session refresh success");
                setUser(data.session.user);
                await syncUserProfile(data.session.user.id, {
                    finishLoading: false,
                });
            } catch (refreshError) {
                if (cancelled) return;
                console.error(
                    "[AuthContext] background session refresh fail:",
                    refreshError,
                );
                if (isSessionExpired(session)) {
                    await clearAuthState({ signOut: true });
                }
            }
        };

        restoreLocalSession();

        const { data: listener } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
                    console.log(
                        `[AuthContext] Auth event: ${event} - cleaning up channels`,
                    );
                    await cleanupAllChannels();
                    markUserLoggedOut();
                }

                if (session?.user) {
                    setUser(session.user);
                    if (getInitialOnlineState()) {
                        syncUserProfile(session.user.id);
                    } else {
                        const cachedProfile = readCachedProfile(
                            session.user.id,
                        );
                        if (cachedProfile) {
                            applyProfile(cachedProfile);
                        }
                        setLoading(false);
                    }
                } else {
                    clearCachedProfile();
                    setUser(null);
                    setProfile(null);
                    setRole(null);
                    setLoading(false);
                }
            },
        );

        return () => {
            cancelled = true;
            listener.subscription.unsubscribe();
        };
    }, [applyProfile, syncUserProfile]);

    const login = async (email, password) => {
        if (!isOnline) {
            throw new Error("Tidak ada koneksi internet. Login membutuhkan koneksi.");
        }

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) throw error;
    };

    const logout = async () => {
        await cleanupAllChannels();
        markUserLoggedOut();
        clearCachedProfile();
        await supabase.auth.signOut();
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                profile,
                login,
                logout,
                role,
                loading,
                isOnline,
                isOffline: !isOnline,
                refreshProfile: () => syncUserProfile(user?.id),
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
