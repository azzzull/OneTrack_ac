import {
    AirVent,
    Bolt,
    Building2,
    MemoryStick,
    Shield,
    Tag,
    UserRound,
    Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";

const moduleCards = [
    {
        key: "users",
        title: "Daftar User",
        desc: "Kelola daftar user yang tersedia dalam sistem.",
        icon: UserRound,
        tone: "bg-blue-100 text-blue-500",
    },
    {
        key: "roles",
        title: "Role",
        desc: "Kelola daftar role yang tersedia dalam sistem.",
        icon: Shield,
        tone: "bg-purple-100 text-purple-500",
    },
    {
        key: "customers",
        title: "Customer",
        desc: "Kelola data customer dan informasi proyek.",
        icon: Users,
        tone: "bg-emerald-100 text-emerald-500",
    },
    {
        key: "projects",
        title: "Project",
        desc: "Kelola daftar proyek per customer.",
        icon: Building2,
        tone: "bg-cyan-100 text-cyan-600",
    },
    {
        key: "ac_brands",
        title: "Merk AC",
        desc: "Kelola daftar merk ac yang tersedia dalam sistem.",
        icon: Tag,
        tone: "bg-pink-100 text-pink-500",
    },
    {
        key: "ac_types",
        title: "Tipe AC",
        desc: "Kelola daftar tipe ac yang tersedia dalam sistem.",
        icon: AirVent,
        tone: "bg-indigo-100 text-indigo-500",
    },
    {
        key: "ac_pks",
        title: "Kapasitas AC",
        desc: "Kelola daftar jumlah pk yang tersedia dalam sistem.",
        icon: MemoryStick,
        tone: "bg-amber-100 text-amber-500",
    },
];

export default function AdminMasterDataPage() {
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();

    return (
        <div className="min-h-screen bg-sky-50">
            <div className="flex min-h-screen">
                <Sidebar
                    collapsed={sidebarCollapsed}
                    onToggle={toggleSidebar}
                />

                <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8">
                    <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">
                        Master Data
                    </h1>
                    <p className="mt-1 text-slate-600">
                        Kelola data referensi dasar aplikasi.
                    </p>

                    <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {moduleCards.map((item) => {
                            const Icon = item.icon;
                            return (
                                <Link
                                    key={item.key}
                                    to={`/master-data/${item.key}`}
                                    className="rounded-2xl bg-white p-5 text-left no-underline shadow-sm transition hover:shadow-md"
                                    style={{ textDecoration: "none" }}
                                >
                                    <div className="flex items-center gap-3">
                                        <span
                                            className={`inline-flex rounded-2xl p-3 ${item.tone}`}
                                        >
                                            <Icon size={22} />
                                        </span>
                                        <h3 className="text-lg font-semibold text-slate-900">
                                            {item.title}
                                        </h3>
                                    </div>
                                    <p className="mt-2 text-base text-slate-500">
                                        {item.desc}
                                    </p>
                                </Link>
                            );
                        })}
                    </section>
                </main>
            </div>

            <MobileBottomNav />
        </div>
    );
}
