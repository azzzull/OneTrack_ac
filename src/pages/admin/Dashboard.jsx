import { useState } from "react";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";

function AdminDashboard() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    return (
        <div className="min-h-screen bg-sky-50">
            <div className="flex min-h-screen">
                <Sidebar
                    collapsed={sidebarCollapsed}
                    onToggle={() => setSidebarCollapsed((prev) => !prev)}
                />

                <div className="flex-1 p-4 pb-24 md:p-8 md:pb-8">
                    <h2 className="text-2xl font-semibold text-slate-800">
                        Admin Dashboard
                    </h2>
                    <p className="mt-1 text-slate-600">Halo admin</p>
                </div>
            </div>

            <MobileBottomNav />
        </div>
    );
}

export default AdminDashboard;
