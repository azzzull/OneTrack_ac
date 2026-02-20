import { useState } from "react";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";

function TechnicianDashboard() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    return (
        <div>
            <Sidebar
                collapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed((prev) => !prev)}
            />
            <h1>Technician Dashboard</h1>
            <MobileBottomNav />
        </div>
    );
}

export default TechnicianDashboard;
