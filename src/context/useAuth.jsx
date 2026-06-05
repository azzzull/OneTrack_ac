import { useContext } from "react";
import { AuthContext } from "./AuthContextValue";

export function useAuth() {
    const context = useContext(AuthContext);

    // Helper properties for role and technician type checks
    const roleChecks = {
        isManagement: context?.role === "management",
        isAdmin: context?.role === "admin",
        isCustomer: context?.role === "customer",
        isTechnician: context?.role === "technician",
        isInternalTech:
            context?.role === "technician" &&
            context?.profile?.technician_type === "internal",
        isExternalTech:
            context?.role === "technician" &&
            context?.profile?.technician_type === "external",
        canAccessAdminFeatures:
            context?.role === "admin" || context?.role === "management",
        canManageUsers:
            context?.role === "admin" || context?.role === "management",
        canApproveAccommodation: context?.role === "management",
    };

    return {
        ...context,
        ...roleChecks,
    };
}
