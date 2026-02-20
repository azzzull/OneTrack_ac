import { useState } from "react";
import { CircleCheckBig, Clock3, Wrench } from "lucide-react";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import Card from "../../components/card";
import useRequestStats from "../../hooks/useRequestStats";

function AdminDashboard() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const stats = useRequestStats();

    const jobStatusCards = [
        {
            title: "Pending",
            value: stats.pending,
            icon: Clock3,
            tone: "amber",
        },
        {
            title: "In Progress",
            value: stats.inProgress,
            icon: Wrench,
            tone: "sky",
        },
        {
            title: "Completed",
            value: stats.completed,
            icon: CircleCheckBig,
            tone: "emerald",
        },
    ];

    return (
        <div className="min-h-screen bg-sky-50">
            <div className="flex min-h-screen">
                <Sidebar
                    collapsed={sidebarCollapsed}
                    onToggle={() => setSidebarCollapsed((prev) => !prev)}
                />

                <div className="flex-1 p-4 pb-24 md:p-8 md:pb-8">
                    <h2 className="text-3xl font-semibold text-slate-800">
                        Service Hub
                    </h2>
                    <p className="mt-1 text-slate-600">
                        Dashboard realtime pekerjaan lapangan
                    </p>

                    <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {jobStatusCards.map((item) => (
                            <Card
                                key={item.title}
                                title={item.title}
                                value={item.value}
                                icon={item.icon}
                                tone={item.tone}
                            />
                        ))}
                    </section>
                </div>
            </div>

            <MobileBottomNav />
        </div>
    );
}

export default AdminDashboard;
