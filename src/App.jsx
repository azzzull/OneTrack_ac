import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "@/routes/ProtectedRoute";
import { useAuth } from "@/context/useAuth";

import AdminDashboard from "@/pages/admin/Dashboard";
import AdminRequestsPage from "@/pages/admin/Requests";
import TechnicianDashboard from "@/pages/technician/Dashboard";
import CustomerDashboard from "@/pages/customer/Dashboard";
import Login from "@/pages/Login";

function App() {
  const { loading } = useAuth();

  if (loading) return <div>Loading...</div>;

  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/technician"
        element={
          <ProtectedRoute allowedRoles={["technician"]}>
            <TechnicianDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/requests"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminRequestsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/customer"
        element={
          <ProtectedRoute allowedRoles={["customer"]}>
            <CustomerDashboard />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
