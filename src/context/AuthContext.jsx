import { useEffect, useState } from "react";
import supabase from "../supabaseClient";
import { AuthContext } from "./AuthContextValue";
import {
    cleanupAllChannels,
    markUserLoggedOut,
} from "../utils/realtimeChannelManager";

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

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [role, setRole] = useState(null);
    const [loading, setLoading] = useState(true);

    const syncUserProfile = async (userId) => {
        try {
            const nextProfile = await fetchUserProfile(userId);
            setProfile(nextProfile);
            setRole(nextProfile?.role ?? null);
        } catch (error) {
            console.error("Error fetching profile:", error);
            setProfile(null);
            setRole(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // cek user saat refresh
        supabase.auth.getUser().then(async ({ data, error }) => {
            if (error) {
                console.error("Error restoring auth session:", error);
                await supabase.auth.signOut();
                setUser(null);
                setProfile(null);
                setRole(null);
                setLoading(false);
                return;
            }

            if (data?.user) {
                setUser(data.user);
                syncUserProfile(data.user.id);
            } else {
                setLoading(false);
            }
        });

        // dengerin perubahan login / logout
        const { data: listener } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                // ✅ CRITICAL: Cleanup channels on SIGNED_OUT or TOKEN_REFRESHED events
                // This prevents stale channels from causing "cannot add postgres_changes after subscribe()" errors
                if (event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
                    console.log(
                        `[AuthContext] Auth event: ${event} - cleaning up channels`,
                    );
                    await cleanupAllChannels();
                    markUserLoggedOut();
                }

                if (session?.user) {
                    setUser(session.user);
                    syncUserProfile(session.user.id);
                } else {
                    setUser(null);
                    setProfile(null);
                    setRole(null);
                    setLoading(false);
                }
            },
        );

        return () => listener.subscription.unsubscribe();
    }, []);

    const login = async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) throw error;
    };

    const logout = async () => {
        // ✅ CRITICAL FIX: Cleanup all realtime channels before logout
        // This prevents stale subscriptions from causing issues after re-login
        await cleanupAllChannels();
        markUserLoggedOut();
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
                refreshProfile: () => syncUserProfile(user?.id),
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
