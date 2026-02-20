import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";

function CustomerDashboard() {
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    return (
        <div>
            <Sidebar
                collapsed={sidebarCollapsed}
                onToggle={toggleSidebar}
            />
            <h1>Customer Dashboard</h1>
            <MobileBottomNav />
        </div>
    );
}

export default CustomerDashboard;
