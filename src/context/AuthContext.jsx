import { createContext, useContext, useEffect, useState } from "react";
import supabase from "../supabaseClient";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // cek user saat refresh
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUser(data.user);
        fetchRole(data.user.id);
      } else {
        setLoading(false);
      }
    });

    // dengerin perubahan login / logout
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          setUser(session.user);
          fetchRole(session.user.id);
        } else {
          setUser(null);
          setRole(null);
          setLoading(false);
        }
      },
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  const fetchRole = async (userId) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("Error fetching role:", error);
        setRole(null);
      } else {
        setRole(data?.role);
      }
    } catch (error) {
      console.error("Error fetching role:", error);
      setRole(null);
    }
    setLoading(false);
  };

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

export const useAuth = () => useContext(AuthContext);
