import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/useAuth";
import AuthLoadingScreen from "@/components/AuthLoadingScreen";

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return <AuthLoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (role && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
