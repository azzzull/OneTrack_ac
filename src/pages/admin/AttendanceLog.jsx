import React, { useState, useEffect } from "react";
import { CalendarDays, MapPin, Loader, Filter, Download } from "lucide-react";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import CustomSelect from "../../components/ui/CustomSelect";
import { useAuth } from "../../context/useAuth";
import {
    useAttendance,
    formatTimeShort,
    formatDateShort,
    formatWorkingHours,
} from "../../hooks/useAttendance";
import AttendanceMapModal from "../../components/AttendanceMapModal";
import supabase from "../../supabaseClient";

const AttendanceLog = () => {
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const { getAdminAttendanceLog, loading } =
        useAttendance();

    const [attendanceData, setAttendanceData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [technicians, setTechnicians] = useState([]);

    const [filterTechnician, setFilterTechnician] = useState("");
    const [filterDateFrom, setFilterDateFrom] = useState("");
    const [filterDateTo, setFilterDateTo] = useState("");
    const [filterStatus, setFilterStatus] = useState(""); // 'all', 'check_in_only', 'checked_in_and_out'

    // Map modal
    const [mapModal, setMapModal] = useState({
        isOpen: false,
        data: null,
        type: null,
        technicianName: "",
    });

    useEffect(() => {
        const loadInitialData = async () => {
            const { data, error } = await supabase
                .from("profiles")
                .select("id, first_name, last_name, role")
                .eq("role", "technician")
                .order("first_name", { ascending: true });

            if (!error && data) {
                setTechnicians(data);
            }

            const result = await getAdminAttendanceLog(null, null, null, null);
            if (result.success) {
                setAttendanceData(result.data || []);
            }
        };
        loadInitialData();
    }, [getAdminAttendanceLog]);

    useEffect(() => {
        let filtered = [...attendanceData];

        if (filterTechnician) {
            filtered = filtered.filter(
                (item) => item.technician_id === filterTechnician,
            );
        }

        if (filterDateFrom) {
            filtered = filtered.filter(
                (item) => item.attendance_date >= filterDateFrom,
            );
        }

        if (filterDateTo) {
            filtered = filtered.filter(
                (item) => item.attendance_date <= filterDateTo,
            );
        }

        if (filterStatus === "check_in_only") {
            filtered = filtered.filter(
                (item) => item.check_in_time && !item.check_out_time,
            );
        } else if (filterStatus === "checked_in_and_out") {
            filtered = filtered.filter(
                (item) => item.check_in_time && item.check_out_time,
            );
        }

        setFilteredData(filtered);
    }, [
        attendanceData,
        filterTechnician,
        filterDateFrom,
        filterDateTo,
        filterStatus,
    ]);

    const handleShowMap = (data, type, technicianName) => {
        setMapModal({
            isOpen: true,
            data,
            type,
            technicianName,
        });
    };

    const getTechnicianName = (techId) => {
        const tech = technicians.find((t) => t.id === techId);
        if (!tech) return "-";
        return `${tech.first_name} ${tech.last_name}`.trim();
    };

    const handleExportCSV = () => {
        if (filteredData.length === 0) {
            alert("Tidak ada data untuk di-export");
            return;
        }

        const headers = [
            "Nama Teknisi",
            "Tanggal",
            "Jam Masuk",
            "Lokasi Masuk",
            "Kecamatan Masuk",
            "Jam Pulang",
            "Lokasi Pulang",
            "Kecamatan Pulang",
            "Jam Kerja",
        ];

        const rows = filteredData.map((record) => [
            getTechnicianName(record.technician_id),
            formatDateShort(record.attendance_date),
            formatTimeShort(record.check_in_time),
            record.check_in_street_address || "-",
            record.check_in_district || "-",
            formatTimeShort(record.check_out_time),
            record.check_out_street_address || "-",
            record.check_out_district || "-",
            record.working_hours_minutes
                ? formatWorkingHours(record.working_hours_minutes)
                : "-",
        ]);

        const csvContent = [
            headers.join(","),
            ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `attendance_log_${new Date().toISOString().split("T")[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-screen bg-sky-50">
            <div className="flex min-h-screen">
                <Sidebar
                    collapsed={sidebarCollapsed}
                    onToggle={toggleSidebar}
                />

                <main className="min-w-0 flex-1 p-4 pb-24 md:p-8 md:pb-8">
                    <div className="mb-8">
                        <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">
                            Log Absensi Teknisi
                        </h1>
                        <p className="mt-1 text-slate-600">
                            Monitoring absensi dan jam kerja semua teknisi
                        </p>
                    </div>

                    {/* Filters */}
                    <div className="mb-6 rounded-2xl bg-white p-4 shadow-sm md:px-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Filter size={18} className="text-slate-600" />
                                <h2 className="font-semibold text-slate-900">
                                    Filter
                                </h2>
                            </div>
                            <button
                                onClick={handleExportCSV}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-xl hover:bg-green-600 transition text-sm font-semibold shadow-sm"
                            >
                                <Download size={16} />
                                Export CSV
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <label className="block">
                                <span className="text-xs font-medium text-slate-600 block mb-2">
                                    Teknisi
                                </span>
                                <CustomSelect
                                    value={filterTechnician}
                                    onChange={setFilterTechnician}
                                    options={[
                                        {
                                            value: "",
                                            label: "Semua Teknisi",
                                        },
                                        ...technicians.map((tech) => ({
                                            value: tech.id,
                                            label: `${tech.first_name} ${tech.last_name}`,
                                        })),
                                    ]}
                                />
                            </label>

                            <label className="block">
                                <span className="text-xs font-medium text-slate-600 block mb-2">
                                    Dari Tanggal
                                </span>
                                <input
                                    type="date"
                                    value={filterDateFrom}
                                    onChange={(e) =>
                                        setFilterDateFrom(e.target.value)
                                    }
                                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-300 focus:bg-white"
                                />
                            </label>

                            <label className="block">
                                <span className="text-xs font-medium text-slate-600 block mb-2">
                                    Sampai Tanggal
                                </span>
                                <input
                                    type="date"
                                    value={filterDateTo}
                                    onChange={(e) =>
                                        setFilterDateTo(e.target.value)
                                    }
                                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-300 focus:bg-white"
                                />
                            </label>

                            <label className="block">
                                <span className="text-xs font-medium text-slate-600 block mb-2">
                                    Status
                                </span>
                                <CustomSelect
                                    value={filterStatus}
                                    onChange={setFilterStatus}
                                    options={[
                                        {
                                            value: "",
                                            label: "Semua Status",
                                        },
                                        {
                                            value: "check_in_only",
                                            label: "Hanya Masuk",
                                        },
                                        {
                                            value: "checked_in_and_out",
                                            label: "Masuk & Pulang",
                                        },
                                    ]}
                                />
                            </label>
                        </div>
                    </div>

                    {/* Data Table */}
                    <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
                        {loading ? (
                            <div className="flex items-center justify-center p-8">
                                <Loader
                                    size={24}
                                    className="animate-spin text-slate-400 mr-2"
                                />
                                <span className="text-slate-600">
                                    Memuat data...
                                </span>
                            </div>
                        ) : filteredData.length === 0 ? (
                            <div className="p-8 text-center">
                                <p className="text-slate-500">
                                    Tidak ada data absensi{" "}
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-100 border-b border-slate-200">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-700">
                                                Nama Teknisi
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-700">
                                                Tanggal
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-700">
                                                Jam Masuk
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-700">
                                                Lokasi Masuk
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-700">
                                                Jam Pulang
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-700">
                                                Lokasi Pulang
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-700">
                                                Jam Kerja
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {filteredData.map((record) => (
                                            <tr
                                                key={record.id}
                                                className="hover:bg-slate-50 transition"
                                            >
                                                <td className="px-4 py-3 text-slate-700 font-medium">
                                                    {getTechnicianName(
                                                        record.technician_id,
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-slate-700">
                                                    {formatDateShort(
                                                        record.attendance_date,
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-slate-700">
                                                    {formatTimeShort(
                                                        record.check_in_time,
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {record.check_in_street_address ? (
                                                        <button
                                                            onClick={() =>
                                                                handleShowMap(
                                                                    {
                                                                        time: record.check_in_time,
                                                                        latitude:
                                                                            record.check_in_latitude,
                                                                        longitude:
                                                                            record.check_in_longitude,
                                                                        street_address:
                                                                            record.check_in_street_address,
                                                                        district:
                                                                            record.check_in_district,
                                                                        sub_district:
                                                                            record.check_in_sub_district,
                                                                        postal_code:
                                                                            record.check_in_postal_code,
                                                                        accuracy_meters:
                                                                            record.check_in_accuracy_meters,
                                                                    },
                                                                    "check-in",
                                                                    getTechnicianName(
                                                                        record.technician_id,
                                                                    ),
                                                                )
                                                            }
                                                            className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 hover:underline"
                                                        >
                                                            <MapPin size={14} />
                                                            <span className="text-xs line-clamp-1">
                                                                {record.check_in_district ||
                                                                    "Lihat Peta"}
                                                            </span>
                                                        </button>
                                                    ) : (
                                                        <span className="text-slate-400">
                                                            -
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-slate-700">
                                                    {formatTimeShort(
                                                        record.check_out_time,
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {record.check_out_street_address ? (
                                                        <button
                                                            onClick={() =>
                                                                handleShowMap(
                                                                    {
                                                                        time: record.check_out_time,
                                                                        latitude:
                                                                            record.check_out_latitude,
                                                                        longitude:
                                                                            record.check_out_longitude,
                                                                        street_address:
                                                                            record.check_out_street_address,
                                                                        district:
                                                                            record.check_out_district,
                                                                        sub_district:
                                                                            record.check_out_sub_district,
                                                                        postal_code:
                                                                            record.check_out_postal_code,
                                                                        accuracy_meters:
                                                                            record.check_out_accuracy_meters,
                                                                    },
                                                                    "check-out",
                                                                    getTechnicianName(
                                                                        record.technician_id,
                                                                    ),
                                                                )
                                                            }
                                                            className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 hover:underline"
                                                        >
                                                            <MapPin size={14} />
                                                            <span className="text-xs line-clamp-1">
                                                                {record.check_out_district ||
                                                                    "Lihat Peta"}
                                                            </span>
                                                        </button>
                                                    ) : (
                                                        <span className="text-slate-400">
                                                            -
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span
                                                        className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                                                            record.working_hours_minutes
                                                                ? "bg-green-100 text-green-800"
                                                                : "bg-amber-100 text-amber-800"
                                                        }`}
                                                    >
                                                        {record.working_hours_minutes
                                                            ? formatWorkingHours(
                                                                  record.working_hours_minutes,
                                                              )
                                                            : "Belum Selesai"}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Summary */}
                    {filteredData.length > 0 && (
                        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
                                <p className="text-sm text-blue-600 font-medium">
                                    Total Record
                                </p>
                                <p className="text-2xl font-bold text-blue-900 mt-2">
                                    {filteredData.length}
                                </p>
                            </div>

                            <div className="rounded-xl bg-green-50 border border-green-200 p-4">
                                <p className="text-sm text-green-600 font-medium">
                                    Hari Kerja Lengkap
                                </p>
                                <p className="text-2xl font-bold text-green-900 mt-2">
                                    {
                                        filteredData.filter(
                                            (r) => r.working_hours_minutes,
                                        ).length
                                    }
                                </p>
                            </div>

                            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                                <p className="text-sm text-amber-600 font-medium">
                                    Belum Check-Out
                                </p>
                                <p className="text-2xl font-bold text-amber-900 mt-2">
                                    {
                                        filteredData.filter(
                                            (r) => !r.check_out_time,
                                        ).length
                                    }
                                </p>
                            </div>

                            <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-4">
                                <p className="text-sm text-indigo-600 font-medium">
                                    Total Jam Kerja
                                </p>
                                <p className="text-2xl font-bold text-indigo-900 mt-2">
                                    {formatWorkingHours(
                                        filteredData.reduce(
                                            (sum, r) =>
                                                sum +
                                                (r.working_hours_minutes || 0),
                                            0,
                                        ),
                                    )}
                                </p>
                            </div>
                        </div>
                    )}
                </main>
            </div>

            {/* Map Modal */}
            <AttendanceMapModal
                isOpen={mapModal.isOpen}
                onClose={() =>
                    setMapModal({
                        isOpen: false,
                        data: null,
                        type: null,
                        technicianName: "",
                    })
                }
                data={
                    mapModal.data
                        ? {
                              ...mapModal.data,
                              technician_name: mapModal.technicianName,
                          }
                        : null
                }
                type={mapModal.type}
            />

            {/* Mobile Bottom Nav */}
            <MobileBottomNav />
        </div>
    );
};

export default AttendanceLog;
