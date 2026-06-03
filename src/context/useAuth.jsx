import { useContext } from "react";
import { AuthContext } from "./AuthContextValue";

export function useAuth() {
    const context = useContext(AuthContext);

    // Helper properties for role and technician type checks
    const roleChecks = {
        isAdmin: context?.role === "admin",
        isCustomer: context?.role === "customer",
        isTechnician: context?.role === "technician",
        isInternalTech:
            context?.role === "technician" &&
            context?.profile?.technician_type === "internal",
        isExternalTech:
            context?.role === "technician" &&
            context?.profile?.technician_type === "external",
    };

    return {
        ...context,
        ...roleChecks,
    };
}
