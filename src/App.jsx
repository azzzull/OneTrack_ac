import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import ProtectedRoute from "@/routes/ProtectedRoute";
import { registerPushNotifications } from "@/services/pushNotifications";
import { useAuth } from "@/context/useAuth";
import AuthLoadingScreen from "@/components/AuthLoadingScreen";
import OfflineSyncStatus from "@/components/offline/OfflineSyncStatus";

import AdminDashboard from "@/pages/admin/Dashboard";
import AdminMasterDataPage from "@/pages/admin/MasterData";
import AdminMasterDataModulePage from "@/pages/admin/MasterDataModule";
import AdminNewJobPage from "@/pages/admin/NewJob";
import AdminRequestsPage from "@/pages/admin/Requests";
import AdminAttendanceLogPage from "@/pages/admin/AttendanceLog";
import AccommodationPage from "@/pages/accommodation/AccommodationPage";
import AccommodationReports from "@/pages/accommodation/AccommodationReports";
import OvertimeManagement from "@/pages/overtime/OvertimeManagement";
import TechnicianDashboard from "@/pages/technician/Dashboard";
import TechnicianAttendanceHistoryPage from "@/pages/technician/AttendanceHistory";
import CustomerDashboard from "@/pages/customer/Dashboard";
import CustomerServicesPage from "@/pages/customer/Services";
import CustomerRequestFormPage from "@/pages/customer/RequestForm";
import ProfilePage from "@/pages/Profile";
import Login from "@/pages/Login";

function ScrollToTop() {
    const { pathname } = useLocation();

    useEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
    }, [pathname]);

    return null;
}

function App() {
    const { loading, user, isOffline } = useAuth();

    useEffect(() => {
        if (loading || !user?.id || isOffline) return;
        registerPushNotifications(user.id);
    }, [isOffline, loading, user?.id]);

    if (loading) return <AuthLoadingScreen />;

    return (
        <>
            <ScrollToTop />
            <OfflineSyncStatus />
            <Routes>
                <Route path="/" element={<Login />} />
                <Route
                    path="/admin"
                    element={
                        <ProtectedRoute allowedRoles={["admin", "management"]}>
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
                    path="/technician/requests"
                    element={
                        <ProtectedRoute allowedRoles={["technician"]}>
                            <AdminRequestsPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/management/accommodation"
                    element={
                        <ProtectedRoute allowedRoles={["management"]}>
                            <AccommodationPage mode="management" />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/management/accommodation/reports"
                    element={
                        <ProtectedRoute allowedRoles={["management"]}>
                            <AccommodationReports />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/admin/accommodation"
                    element={
                        <ProtectedRoute allowedRoles={["admin", "management"]}>
                            <AccommodationPage mode="admin" />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/admin/accommodation/reports"
                    element={
                        <ProtectedRoute allowedRoles={["admin", "management"]}>
                            <AccommodationReports />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/accommodation"
                    element={
                        <ProtectedRoute allowedRoles={["technician"]}>
                            <AccommodationPage mode="technician" />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/requests"
                    element={
                        <ProtectedRoute allowedRoles={["admin", "management"]}>
                            <AdminRequestsPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/jobs/new"
                    element={
                        <ProtectedRoute
                            allowedRoles={[
                                "admin",
                                "management",
                                "technician",
                            ]}
                        >
                            <AdminNewJobPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/master-data"
                    element={
                        <ProtectedRoute allowedRoles={["admin", "management"]}>
                            <AdminMasterDataPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/master-data/:moduleKey"
                    element={
                        <ProtectedRoute allowedRoles={["admin", "management"]}>
                            <AdminMasterDataModulePage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/reports"
                    element={<Navigate to="/admin" replace />}
                />
                <Route
                    path="/customer"
                    element={
                        <ProtectedRoute allowedRoles={["customer"]}>
                            <CustomerDashboard />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/services"
                    element={
                        <ProtectedRoute allowedRoles={["customer"]}>
                            <CustomerServicesPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/customer/request"
                    element={
                        <ProtectedRoute allowedRoles={["customer"]}>
                            <CustomerRequestFormPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/profile"
                    element={
                        <ProtectedRoute
                            allowedRoles={[
                                "customer",
                                "technician",
                                "management",
                                "admin",
                            ]}
                        >
                            <ProfilePage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/technician/attendance"
                    element={
                        <ProtectedRoute allowedRoles={["technician"]}>
                            <TechnicianAttendanceHistoryPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/admin/attendance"
                    element={
                        <ProtectedRoute allowedRoles={["admin", "management"]}>
                            <AdminAttendanceLogPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/overtime"
                    element={
                        <ProtectedRoute
                            allowedRoles={["admin", "management", "technician"]}
                        >
                            <OvertimeManagement />
                        </ProtectedRoute>
                    }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </>
    );
}

export default App;
