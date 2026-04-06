import React, { useState, useEffect } from "react";
import { CalendarDays, MapPin, Loader, Filter } from "lucide-react";
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

const AttendanceHistory = () => {
    const { collapsed: sidebarCollapsed, toggle: toggleSidebar } =
        useSidebarCollapsed();
    const { user } = useAuth();
    const { getAttendanceHistory, loading } = useAttendance();

    const [attendanceData, setAttendanceData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [filterPeriod, setFilterPeriod] = useState("month"); // 'week', 'month', 'custom'
    const [customDateFrom, setCustomDateFrom] = useState("");
    const [customDateTo, setCustomDateTo] = useState("");

    // Map modal
    const [mapModal, setMapModal] = useState({
        isOpen: false,
        data: null,
        type: null,
    });

    const handleShowMap = (data, type) => {
        setMapModal({
            isOpen: true,
            data,
            type,
        });
    };

    useEffect(() => {
        if (!user?.id) return;
        const loadData = async () => {
            const result = await getAttendanceHistory(user.id, null, null);
            if (result.success) {
                setAttendanceData(result.data || []);
            }
        };
        loadData();
    }, [user?.id, getAttendanceHistory]);

    useEffect(() => {
        let filtered = [...attendanceData];
        const today = new Date();
        let dateFrom, dateTo;

        switch (filterPeriod) {
            case "week":
                dateFrom = new Date(today);
                dateFrom.setDate(today.getDate() - today.getDay());
                dateTo = today;
                break;
            case "month":
                dateFrom = new Date(today.getFullYear(), today.getMonth(), 1);
                dateTo = today;
                break;
            case "custom":
                if (customDateFrom && customDateTo) {
                    dateFrom = new Date(customDateFrom);
                    dateTo = new Date(customDateTo);
                } else {
                    dateFrom = null;
                    dateTo = null;
                }
                break;
            default:
                dateFrom = null;
                dateTo = null;
        }

        if (dateFrom && dateTo) {
            const dateFromStr = dateFrom.toISOString().split("T")[0];
            const dateToStr = dateTo.toISOString().split("T")[0];

            filtered = filtered.filter((item) => {
                return (
                    item.attendance_date >= dateFromStr &&
                    item.attendance_date <= dateToStr
                );
            });
        }

        setFilteredData(filtered);
    }, [attendanceData, filterPeriod, customDateFrom, customDateTo]);
    return (
        <div className="min-h-screen bg-sky-50">
            <div className="flex min-h-screen">
                <Sidebar
                    collapsed={sidebarCollapsed}
                    onToggle={toggleSidebar}
                />

                <main className="min-w-0 flex-1 p-4 pb-24 md:p-8 md:pb-8">
                    {/* Header */}
                    <div className="mb-6">
                        <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl text-center md:text-left">
                            History Absensi
                        </h1>
                        <p className="mt-1 text-slate-600 text-center md:text-left">
                            Daftar absensi Anda dari waktu ke waktu
                        </p>
                    </div>

                    {/* Summary Cards - Top */}
                    {attendanceData.length > 0 && (
                        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="rounded-2xl bg-blue-50 border-2 border-blue-200 p-4">
                                <p className="text-sm text-blue-600 font-medium">
                                    Total Hari Kerja
                                </p>
                                <p className="text-3xl font-bold text-blue-900 mt-2">
                                    {
                                        attendanceData.filter(
                                            (r) => r.working_hours_minutes,
                                        ).length
                                    }
                                </p>
                            </div>

                            <div className="rounded-2xl bg-green-50 border-2 border-green-200 p-4">
                                <p className="text-sm text-green-600 font-medium">
                                    Total Jam Kerja
                                </p>
                                <p className="text-3xl font-bold text-green-900 mt-2">
                                    {formatWorkingHours(
                                        attendanceData.reduce(
                                            (sum, r) =>
                                                sum +
                                                (r.working_hours_minutes || 0),
                                            0,
                                        ),
                                    )}
                                </p>
                            </div>

                            <div className="rounded-2xl bg-purple-50 border-2 border-purple-200 p-4">
                                <p className="text-sm text-purple-600 font-medium">
                                    Rata-rata Jam Kerja
                                </p>
                                <p className="text-3xl font-bold text-purple-900 mt-2">
                                    {(() => {
                                        const daysWorked = attendanceData.filter(
                                            (r) => r.working_hours_minutes,
                                        ).length;
                                        if (daysWorked === 0) return "0 jam";
                                        const totalMinutes = attendanceData.reduce(
                                            (sum, r) =>
                                                sum +
                                                (r.working_hours_minutes || 0),
                                            0,
                                        );
                                        const avgMinutes = Math.round(
                                            totalMinutes / daysWorked,
                                        );
                                        const hours = Math.floor(avgMinutes / 60);
                                        const mins = avgMinutes % 60;
                                        return `${hours}h ${mins}m`;
                                    })()}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Filter Section - Inline */}
                    <div className="mb-6 flex flex-col md:flex-row md:items-end md:gap-4">
                        <div className="flex-1">
                            <label className="block">
                                <span className="text-xs font-medium text-slate-600 block mb-2">
                                    Periode
                                </span>
                                <CustomSelect
                                    value={filterPeriod}
                                    onChange={setFilterPeriod}
                                    options={[
                                        {
                                            value: "week",
                                            label: "Minggu Ini",
                                        },
                                        {
                                            value: "month",
                                            label: "Bulan Ini",
                                        },
                                        { value: "custom", label: "Custom" },
                                    ]}
                                />
                            </label>
                        </div>

                        {filterPeriod === "custom" && (
                            <>
                                <div className="flex-1">
                                    <label className="block">
                                        <span className="text-xs font-medium text-slate-600 block mb-2">
                                            Dari Tanggal
                                        </span>
                                        <input
                                            type="date"
                                            value={customDateFrom}
                                            onChange={(e) =>
                                                setCustomDateFrom(
                                                    e.target.value,
                                                )
                                            }
                                            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-300 focus:bg-white"
                                        />
                                    </label>
                                </div>

                                <div className="flex-1">
                                    <label className="block">
                                        <span className="text-xs font-medium text-slate-600 block mb-2">
                                            Sampai Tanggal
                                        </span>
                                        <input
                                            type="date"
                                            value={customDateTo}
                                            onChange={(e) =>
                                                setCustomDateTo(e.target.value)
                                            }
                                            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-300 focus:bg-white"
                                        />
                                    </label>
                                </div>
                            </>
                        )}
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
                                    Tidak ada data absensi untuk periode ini
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-100 border-b border-slate-200">
                                        <tr>
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
                                                    <span className="inline-block bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">
                                                        {record.working_hours_minutes
                                                            ? formatWorkingHours(
                                                                  record.working_hours_minutes,
                                                              )
                                                            : "-"}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* Map Modal */}
            {/* Map Modal */}
            <AttendanceMapModal
                isOpen={mapModal.isOpen}
                onClose={() =>
                    setMapModal({ isOpen: false, data: null, type: null })
                }
                data={mapModal.data}
                type={mapModal.type}
            />

            {/* Mobile Bottom Nav */}
            <MobileBottomNav />
        </div>
    );
};

export default AttendanceHistory;
