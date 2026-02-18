import {
    LayoutDashboard,
    Wrench,
    Users,
    ClipboardList,
    Star,
} from "lucide-react";

export const MENU = [
    {
        name: "Dashboard",
        href: "/Admin",
        icon: LayoutDashboard,
        roles : ["admin"]
    },
    {
        name: "Tickets",
        href: "/tickets",
        icon: ClipboardList,
    },
    {
        name: "Work Orders",
        href: "/work-orders",
        icon: Star,
    },
]