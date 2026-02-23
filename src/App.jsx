import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "@/routes/ProtectedRoute";
import { useAuth } from "@/context/useAuth";
import AuthLoadingScreen from "@/components/AuthLoadingScreen";

import AdminDashboard from "@/pages/admin/Dashboard";
import AdminMasterDataPage from "@/pages/admin/MasterData";
import AdminMasterDataModulePage from "@/pages/admin/MasterDataModule";
import AdminNewJobPage from "@/pages/admin/NewJob";
import AdminRequestsPage from "@/pages/admin/Requests";
import TechnicianDashboard from "@/pages/technician/Dashboard";
import CustomerDashboard from "@/pages/customer/Dashboard";
import Login from "@/pages/Login";

function App() {
  const { loading } = useAuth();

  if (loading) return <AuthLoadingScreen />;

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
        path="/jobs/new"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminNewJobPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/master-data"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminMasterDataPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/master-data/:moduleKey"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminMasterDataModulePage />
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
