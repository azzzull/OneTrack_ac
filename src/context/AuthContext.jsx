import { useEffect, useState } from "react";
import supabase from "../supabaseClient";
import { AuthContext } from "./AuthContextValue";

const fetchUserProfile = async (userId) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("role, first_name, last_name, email, phone")
    .eq("id", userId)
    .single();

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
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUser(data.user);
        syncUserProfile(data.user.id);
      } else {
        setLoading(false);
      }
    });

    // dengerin perubahan login / logout
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
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

  return (
    <AuthContext.Provider
      value={{ user, profile, login, role, loading, refreshProfile: () => syncUserProfile(user?.id) }}
    >
      {children}
    </AuthContext.Provider>
  );
}
