import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";

function TechnicianDashboard() {
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    return (
        <div>
            <Sidebar
                collapsed={sidebarCollapsed}
                onToggle={toggleSidebar}
            />
            <h1>Technician Dashboard</h1>
            <MobileBottomNav />
        </div>
    );
}

export default TechnicianDashboard;
