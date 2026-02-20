import { useState } from "react";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";

function CustomerDashboard() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    return (
        <div>
            <Sidebar
                collapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed((prev) => !prev)}
            />
            <h1>Customer Dashboard</h1>
            <MobileBottomNav />
        </div>
    );
}

export default CustomerDashboard;
