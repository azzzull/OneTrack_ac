import { useEffect, useState } from "react";
import supabase from "../supabaseClient";
import { AuthContext } from "./AuthContextValue";

const fetchUserRole = async (userId) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (error) throw error;
  return data?.role ?? null;
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  const syncUserRole = async (userId) => {
    try {
      const nextRole = await fetchUserRole(userId);
      setRole(nextRole);
    } catch (error) {
      console.error("Error fetching role:", error);
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
        syncUserRole(data.user.id);
      } else {
        setLoading(false);
      }
    });

    // dengerin perubahan login / logout
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          setUser(session.user);
          syncUserRole(session.user.id);
        } else {
          setUser(null);
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
    <AuthContext.Provider value={{ user, login, role, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
