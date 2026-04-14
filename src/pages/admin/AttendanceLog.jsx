import React, { useState, useEffect } from "react";
import {
    CalendarDays,
    MapPin,
    Loader,
    Filter,
    Download,
    Edit2,
    Trash2,
    X,
    Check,
} from "lucide-react";
import Sidebar, { MobileBottomNav } from "../../components/layout/sidebar";
import useSidebarCollapsed from "../../hooks/useSidebarCollapsed";
import CustomSelect from "../../components/ui/CustomSelect";

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
    const { getAdminAttendanceLog, loading } = useAttendance();

    const [attendanceData, setAttendanceData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [technicians, setTechnicians] = useState([]);

    const [viewMode, setViewMode] = useState("daily"); // 'daily' | 'log' | 'technician'
    const [dailyDate, setDailyDate] = useState(
        new Date().toISOString().split("T")[0],
    );
    const [selectedTechnicianId, setSelectedTechnicianId] = useState("");

    const [filterTechnician, setFilterTechnician] = useState("");
    const [filterDateFrom, setFilterDateFrom] = useState("");
    const [filterDateTo, setFilterDateTo] = useState("");
    const [filterStatus, setFilterStatus] = useState(""); // 'all', 'check_in_only', 'checked_in_and_out'
    const [dailyStatusFilter, setDailyStatusFilter] = useState("");

    // Map modal
    const [mapModal, setMapModal] = useState({
        isOpen: false,
        data: null,
        type: null,
        technicianName: "",
    });

    // Edit modal
    const [editModal, setEditModal] = useState({
        isOpen: false,
        record: null,
        checkInTime: "",
        checkOutTime: "",
        isSaving: false,
    });

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 15;

    // Unchecked technicians modal
    const [uncheckedModal, setUncheckedModal] = useState(false);

    useEffect(() => {
        const loadInitialData = async () => {
            const { data, error } = await supabase
                .from("profiles")
                .select("id, first_name, last_name, role")
                .in("role", ["technician", "admin"])
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
        const applyFilter = () => {
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
        };
        applyFilter();
    }, [
        attendanceData,
        filterTechnician,
        filterDateFrom,
        filterDateTo,
        filterStatus,
    ]);

    // Reset pagination when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [filterTechnician, filterDateFrom, filterDateTo, filterStatus]);

    const handleShowMap = (data, type, technicianName) => {
        setMapModal({
            isOpen: true,
            data,
            type,
            technicianName,
        });
    };

    const getDailyStatus = (record) => {
        if (record?.check_out_time) return "Masuk & Pulang";
        if (record?.check_in_time) return "Masuk";
        return "Belum Absen";
    };

    const handleOpenTechnicianLog = (techId) => {
        setSelectedTechnicianId(techId);
        setFilterTechnician(techId);
        setFilterDateFrom("");
        setFilterDateTo("");
        setFilterStatus("");
        setViewMode("technician");
    };

    const getTechnicianName = (techId) => {
        const tech = technicians.find((t) => t.id === techId);
        if (!tech) return "-";
        return `${tech.first_name} ${tech.last_name}`.trim();
    };

    const selectedTechnicianName = selectedTechnicianId
        ? getTechnicianName(selectedTechnicianId)
        : "";

    const handleOpenEditModal = (record) => {
        setEditModal({
            isOpen: true,
            record,
            checkInTime: record.check_in_time
                ? record.check_in_time.substring(0, 16)
                : "",
            checkOutTime: record.check_out_time
                ? record.check_out_time.substring(0, 16)
                : "",
            isSaving: false,
        });
    };

    const handleCloseEditModal = () => {
        setEditModal({
            isOpen: false,
            record: null,
            checkInTime: "",
            checkOutTime: "",
            isSaving: false,
        });
    };

    const handleExportDailyCSV = () => {
        const filteredTechs = technicians.filter((tech) => {
            if (!dailyStatusFilter) return true;
            const record = dailyAttendanceMap[tech.id];
            const status = getDailyStatus(record);
            if (dailyStatusFilter === "masuk") return status === "Masuk";
            if (dailyStatusFilter === "masuk_pulang")
                return status === "Masuk & Pulang";
            if (dailyStatusFilter === "belum_absen")
                return status === "Belum Absen";
            return true;
        });

        if (filteredTechs.length === 0) {
            alert("Tidak ada data untuk di-export");
            return;
        }

        const headers = [
            "Tanggal",
            "Teknisi",
            "Status",
            "Jam Masuk",
            "Jam Pulang",
        ];

        const rows = filteredTechs.map((tech) => {
            const record = dailyAttendanceMap[tech.id];
            const status = getDailyStatus(record);
            return [
                formatDateShort(dailyDate),
                `${tech.first_name} ${tech.last_name}`.trim(),
                status,
                formatTimeShort(record?.check_in_time),
                formatTimeShort(record?.check_out_time),
            ];
        });

        const csvContent = [
            headers.join(","),
            ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `attendance_daily_${dailyDate}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    };

    const handleSaveEditModal = async () => {
        if (!editModal.record) return;

        setEditModal((prev) => ({ ...prev, isSaving: true }));

        try {
            const updateData = {};

            if (editModal.checkInTime) {
                updateData.check_in_time = editModal.checkInTime + ":00";
            }
            if (editModal.checkOutTime) {
                updateData.check_out_time = editModal.checkOutTime + ":00";
            }

            // Calculate working hours if both times are set
            if (editModal.checkInTime && editModal.checkOutTime) {
                const checkInDate = new Date(
                    `${editModal.record.attendance_date}T${editModal.checkInTime}:00`,
                );
                const checkOutDate = new Date(
                    `${editModal.record.attendance_date}T${editModal.checkOutTime}:00`,
                );
                const diffMs = checkOutDate - checkInDate;
                const diffMinutes = Math.round(diffMs / 60000);
                updateData.working_hours_minutes = Math.max(0, diffMinutes);
            } else {
                updateData.working_hours_minutes = null;
            }

            const { error } = await supabase.rpc("admin_update_attendance", {
                p_id: editModal.record.id,
                p_check_in_time: editModal.checkInTime
                    ? editModal.checkInTime + ":00"
                    : null,
                p_check_out_time: editModal.checkOutTime
                    ? editModal.checkOutTime + ":00"
                    : null,
                p_working_minutes: updateData.working_hours_minutes ?? null,
            });

            if (error) throw error;

            // Update local data
            setAttendanceData((prev) =>
                prev.map((item) =>
                    item.id === editModal.record.id
                        ? { ...item, ...updateData }
                        : item,
                ),
            );

            handleCloseEditModal();
            alert("Absensi berhasil diperbarui");
        } catch (error) {
            console.error("Error updating attendance:", error);
            alert(`Gagal memperbarui absensi: ${error.message}`);
        } finally {
            setEditModal((prev) => ({ ...prev, isSaving: false }));
        }
    };

    const handleDeleteRecord = async (record) => {
        if (
            !window.confirm(
                `Yakin ingin menghapus absensi ${getTechnicianName(record.technician_id)} tanggal ${formatDateShort(record.attendance_date)}?`,
            )
        ) {
            return;
        }

        try {
            const { error } = await supabase.rpc("admin_delete_attendance", {
                p_id: record.id,
            });

            if (error) throw error;

            // Update local data
            setAttendanceData((prev) =>
                prev.filter((item) => item.id !== record.id),
            );
            alert("Absensi berhasil dihapus");
        } catch (error) {
            console.error("Error deleting attendance:", error);
            alert(`Gagal menghapus absensi: ${error.message}`);
        }
    };

    // Get technicians who haven't checked in today (or in filtered date range)
    const getUncheckedTechnicians = () => {
        let checkDate = dailyDate;
        if (viewMode === "log") {
            // Determine the date to check
            checkDate = new Date().toISOString().split("T")[0]; // Today
            if (filterDateFrom && !filterDateTo) {
                checkDate = filterDateFrom;
            } else if (!filterDateFrom && filterDateTo) {
                checkDate = filterDateTo;
            } else if (
                filterDateFrom &&
                filterDateTo &&
                filterDateFrom === filterDateTo
            ) {
                checkDate = filterDateFrom;
            }
        }

        const checkedInTechs = new Set(
            attendanceData
                .filter(
                    (record) =>
                        record.check_in_time &&
                        record.attendance_date === checkDate,
                )
                .map((record) => record.technician_id),
        );

        return technicians.filter((tech) => !checkedInTechs.has(tech.id));
    };

    const uncheckedTechs = getUncheckedTechnicians();

    const dailyAttendanceMap = attendanceData.reduce((acc, record) => {
        if (record.attendance_date === dailyDate) {
            acc[record.technician_id] = record;
        }
        return acc;
    }, {});

    const dailyCheckedInCount = technicians.filter(
        (tech) =>
            dailyAttendanceMap[tech.id] &&
            dailyAttendanceMap[tech.id].check_in_time,
    ).length;
    const dailyAbsentCount = Math.max(
        0,
        technicians.length - dailyCheckedInCount,
    );

    // Pagination logic - only apply pagination if no filter in log view
    const hasAnyFilter =
        filterTechnician || filterDateFrom || filterDateTo || filterStatus;
    const shouldPaginate = viewMode === "log" && !hasAnyFilter;
    const totalPages = shouldPaginate
        ? Math.ceil(filteredData.length / ITEMS_PER_PAGE)
        : 1;
    const paginatedData = shouldPaginate
        ? filteredData.slice(
              (currentPage - 1) * ITEMS_PER_PAGE,
              currentPage * ITEMS_PER_PAGE,
          )
        : filteredData;

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

                    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        {viewMode === "technician" ? (
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between w-full">
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => {
                                            setViewMode("daily");
                                            setSelectedTechnicianId("");
                                            setFilterTechnician("");
                                        }}
                                        className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                                    >
                                        Kembali ke Per Hari
                                    </button>
                                    <span className="text-sm text-slate-700">
                                        Log teknisi{" "}
                                        <span className="font-semibold text-slate-900">
                                            {selectedTechnicianName}
                                        </span>
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="inline-flex items-center gap-2 rounded-4xl bg-white p-1 shadow-sm">
                                    <button
                                        onClick={() => setViewMode("daily")}
                                        className={`px-4 py-2 rounded-4xl text-sm font-semibold transition ${
                                            viewMode === "daily"
                                                ? "bg-sky-500 text-white"
                                                : "text-slate-600 hover:bg-slate-100"
                                        }`}
                                    >
                                        Per Hari
                                    </button>
                                    <button
                                        onClick={() => setViewMode("log")}
                                        className={`px-4 py-2 rounded-4xl text-sm font-semibold transition ${
                                            viewMode === "log"
                                                ? "bg-sky-500 text-white"
                                                : "text-slate-600 hover:bg-slate-100"
                                        }`}
                                    >
                                        Log Lengkap
                                    </button>
                                </div>

                                {viewMode === "daily" && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-slate-600">
                                            Tanggal:
                                        </span>
                                        <input
                                            type="date"
                                            value={dailyDate}
                                            onChange={(e) =>
                                                setDailyDate(e.target.value)
                                            }
                                            className="rounded-4xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-300"
                                        />
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {viewMode === "daily" && (
                        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
                                <p className="text-sm text-blue-600 font-medium">
                                    Total Teknisi
                                </p>
                                <p className="text-2xl font-bold text-blue-900 mt-2">
                                    {technicians.length}
                                </p>
                            </div>
                            <div className="rounded-xl bg-green-50 border border-green-200 p-4">
                                <p className="text-sm text-green-600 font-medium">
                                    Sudah Absen
                                </p>
                                <p className="text-2xl font-bold text-green-900 mt-2">
                                    {dailyCheckedInCount}
                                </p>
                            </div>
                            <div className="rounded-xl bg-red-50 border border-red-200 p-4">
                                <p className="text-sm text-red-600 font-medium">
                                    Belum Absen
                                </p>
                                <p className="text-2xl font-bold text-red-900 mt-2">
                                    {dailyAbsentCount}
                                </p>
                            </div>
                        </div>
                    )}

                    {viewMode === "log" && (
                        <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
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

                            <button
                                onClick={() => setUncheckedModal(true)}
                                className="rounded-xl bg-red-50 border border-red-200 p-4 hover:bg-red-100 transition cursor-pointer text-left"
                            >
                                <p className="text-sm text-red-600 font-medium">
                                    Belum Absen
                                </p>
                                <p className="text-2xl font-bold text-red-900 mt-2">
                                    {uncheckedTechs.length}
                                </p>
                                <p className="text-xs text-red-600 mt-2">
                                    Klik untuk detail →
                                </p>
                            </button>
                        </div>
                    )}

                    {viewMode === "daily" && (
                        <div className="mb-6 rounded-2xl bg-white shadow-sm">
                            <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                                <div>
                                    <h2 className="text-base font-semibold text-slate-900">
                                        Absensi Per Hari
                                    </h2>
                                    <p className="text-sm text-slate-600">
                                        Daftar semua teknisi pada{" "}
                                        <span className="font-semibold">
                                            {formatDateShort(dailyDate)}
                                        </span>
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <div className="min-w-40">
                                        <CustomSelect
                                            value={dailyStatusFilter}
                                            onChange={setDailyStatusFilter}
                                            options={[
                                                {
                                                    value: "",
                                                    label: "Semua Status",
                                                },
                                                {
                                                    value: "masuk_pulang",
                                                    label: "Masuk & Pulang",
                                                },
                                                {
                                                    value: "masuk",
                                                    label: "Masuk",
                                                },
                                                {
                                                    value: "belum_absen",
                                                    label: "Belum Absen",
                                                },
                                            ]}
                                        />
                                    </div>
                                    <button
                                        onClick={handleExportDailyCSV}
                                        className="inline-flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-xl hover:bg-green-600 transition text-sm font-semibold shadow-sm"
                                    >
                                        <Download size={16} />
                                        Export CSV
                                    </button>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-slate-600">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-semibold">
                                                Teknisi
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold">
                                                Status
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold">
                                                Jam Masuk
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold">
                                                Jam Pulang
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold">
                                                Aksi
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {technicians
                                            .filter((tech) => {
                                                if (!dailyStatusFilter) {
                                                    return true;
                                                }
                                                const record =
                                                    dailyAttendanceMap[tech.id];
                                                const status =
                                                    getDailyStatus(record);
                                                if (
                                                    dailyStatusFilter ===
                                                    "masuk"
                                                ) {
                                                    return status === "Masuk";
                                                }
                                                if (
                                                    dailyStatusFilter ===
                                                    "masuk_pulang"
                                                ) {
                                                    return (
                                                        status ===
                                                        "Masuk & Pulang"
                                                    );
                                                }
                                                if (
                                                    dailyStatusFilter ===
                                                    "belum_absen"
                                                ) {
                                                    return (
                                                        status === "Belum Absen"
                                                    );
                                                }
                                                return true;
                                            })
                                            .map((tech) => {
                                                const record =
                                                    dailyAttendanceMap[tech.id];
                                                const status =
                                                    getDailyStatus(record);

                                                const statusColor =
                                                    status === "Masuk & Pulang"
                                                        ? "bg-green-100 text-green-700"
                                                        : status === "Masuk"
                                                          ? "bg-amber-100 text-amber-700"
                                                          : "bg-red-100 text-red-700";

                                                return (
                                                    <tr
                                                        key={tech.id}
                                                        className="border-t border-slate-100 hover:bg-slate-50"
                                                    >
                                                        <td className="px-4 py-3 text-slate-900 font-medium">
                                                            <button
                                                                onClick={() =>
                                                                    handleOpenTechnicianLog(
                                                                        tech.id,
                                                                    )
                                                                }
                                                                className="text-slate-900 font-semibold hover:text-sky-600 transition"
                                                            >
                                                                {
                                                                    tech.first_name
                                                                }{" "}
                                                                {tech.last_name}
                                                            </button>
                                                        </td>
                                                        <td className="px-4 py-3 text-left">
                                                            <span
                                                                className={`inline-flex items-center text-center rounded-full px-3 py-1 text-xs font-semibold ${statusColor}`}
                                                            >
                                                                {status}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-slate-700">
                                                            {formatTimeShort(
                                                                record?.check_in_time,
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-slate-700">
                                                            {formatTimeShort(
                                                                record?.check_out_time,
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-left">
                                                            <button
                                                                onClick={() =>
                                                                    handleOpenTechnicianLog(
                                                                        tech.id,
                                                                    )
                                                                }
                                                                className="inline-flex items-center gap-1 rounded-lg bg-sky-100 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-200 transition"
                                                            >
                                                                Lihat Log
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    {viewMode === "log" && (
                        <>
                            {filterTechnician && (
                                <div className="mb-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="text-sm text-slate-700">
                                        Menampilkan log teknisi{" "}
                                        <span className="font-semibold text-slate-900">
                                            {getTechnicianName(
                                                filterTechnician,
                                            )}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => setFilterTechnician("")}
                                        className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                                    >
                                        Lihat Semua Log
                                    </button>
                                </div>
                            )}
                            {/* Filters */}
                            <div className="rounded-t-2xl border-b border-slate-200 bg-white p-4 shadow-sm md:px-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <Filter
                                            size={18}
                                            className="text-slate-600"
                                        />
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
                                                setFilterDateFrom(
                                                    e.target.value,
                                                )
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
                        </>
                    )}

                    {(viewMode === "log" || viewMode === "technician") && (
                        <>
                            {/* Data Table */}
                            <div
                                className={`bg-white shadow-sm overflow-hidden ${
                                    viewMode === "log"
                                        ? "rounded-b-2xl rounded-t-none"
                                        : "rounded-2xl"
                                }`}
                            >
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
                                                        Status
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
                                                    <th className="px-4 py-3 text-center font-semibold text-slate-700">
                                                        Aksi
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-200">
                                                {paginatedData.map((record) => {
                                                    const statusLabel =
                                                        record.check_out_time
                                                            ? "Masuk & Pulang"
                                                            : record.check_in_time
                                                              ? "Masuk"
                                                              : "Belum Absen";
                                                    const statusColor =
                                                        statusLabel ===
                                                        "Masuk & Pulang"
                                                            ? "bg-green-100 text-green-700"
                                                            : statusLabel ===
                                                                "Masuk"
                                                              ? "bg-amber-100 text-amber-700"
                                                              : "bg-red-100 text-red-700";

                                                    return (
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
                                                            <td className="px-4 py-3">
                                                                <span
                                                                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusColor}`}
                                                                >
                                                                    {
                                                                        statusLabel
                                                                    }
                                                                </span>
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
                                                                        <MapPin
                                                                            size={
                                                                                14
                                                                            }
                                                                        />
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
                                                                        <MapPin
                                                                            size={
                                                                                14
                                                                            }
                                                                        />
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
                                                            <td className="px-4 py-3">
                                                                <div className="flex items-center justify-center gap-2">
                                                                    <button
                                                                        onClick={() =>
                                                                            handleOpenEditModal(
                                                                                record,
                                                                            )
                                                                        }
                                                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition text-xs font-medium"
                                                                        title="Edit waktu"
                                                                    >
                                                                        <Edit2
                                                                            size={
                                                                                14
                                                                            }
                                                                        />
                                                                        <span className="hidden sm:inline">
                                                                            Edit
                                                                        </span>
                                                                    </button>
                                                                    <button
                                                                        onClick={() =>
                                                                            handleDeleteRecord(
                                                                                record,
                                                                            )
                                                                        }
                                                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition text-xs font-medium"
                                                                        title="Hapus absensi"
                                                                    >
                                                                        <Trash2
                                                                            size={
                                                                                14
                                                                            }
                                                                        />
                                                                        <span className="hidden sm:inline">
                                                                            Hapus
                                                                        </span>
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* Pagination */}
                                {shouldPaginate &&
                                    filteredData.length > ITEMS_PER_PAGE && (
                                        <div className="flex flex-col items-center justify-between gap-4 px-4 py-4 sm:flex-row sm:px-6">
                                            <div className="text-sm text-slate-600">
                                                Halaman{" "}
                                                <span className="font-semibold">
                                                    {currentPage}
                                                </span>{" "}
                                                dari{" "}
                                                <span className="font-semibold">
                                                    {totalPages}
                                                </span>{" "}
                                                • Menampilkan{" "}
                                                <span className="font-semibold">
                                                    {paginatedData.length}
                                                </span>{" "}
                                                dari{" "}
                                                <span className="font-semibold">
                                                    {filteredData.length}
                                                </span>{" "}
                                                data
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() =>
                                                        setCurrentPage((p) =>
                                                            Math.max(1, p - 1),
                                                        )
                                                    }
                                                    disabled={currentPage === 1}
                                                    className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white p-2 text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                                                    title="Halaman sebelumnya"
                                                >
                                                    <svg
                                                        className="w-4 h-4"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M15 19l-7-7 7-7"
                                                        />
                                                    </svg>
                                                </button>

                                                <div className="flex gap-1">
                                                    {Array.from(
                                                        { length: totalPages },
                                                        (_, i) => i + 1,
                                                    ).map((page) => (
                                                        <button
                                                            key={page}
                                                            onClick={() =>
                                                                setCurrentPage(
                                                                    page,
                                                                )
                                                            }
                                                            className={`inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition ${
                                                                currentPage ===
                                                                page
                                                                    ? "bg-sky-500 text-white"
                                                                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                                            }`}
                                                        >
                                                            {page}
                                                        </button>
                                                    ))}
                                                </div>

                                                <button
                                                    onClick={() =>
                                                        setCurrentPage((p) =>
                                                            Math.min(
                                                                totalPages,
                                                                p + 1,
                                                            ),
                                                        )
                                                    }
                                                    disabled={
                                                        currentPage ===
                                                        totalPages
                                                    }
                                                    className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white p-2 text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                                                    title="Halaman berikutnya"
                                                >
                                                    <svg
                                                        className="w-4 h-4"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M9 5l7 7-7 7"
                                                        />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                {/* Note when filter is applied */}
                                {viewMode === "log" &&
                                    hasAnyFilter &&
                                    filteredData.length > ITEMS_PER_PAGE && (
                                        <div className="px-4 py-3 sm:px-6 bg-blue-50 border-t border-slate-200 text-xs text-blue-600">
                                            📌 Filter aktif - menampilkan semua{" "}
                                            {filteredData.length} data yang
                                            sesuai filter
                                        </div>
                                    )}
                            </div>
                        </>
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

            {/* Edit Modal */}
            {editModal.isOpen && editModal.record && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-slate-900">
                                Edit Waktu Absensi
                            </h2>
                            <button
                                onClick={handleCloseEditModal}
                                disabled={editModal.isSaving}
                                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <p className="text-sm font-medium text-slate-700 mb-2">
                                    Teknisi:{" "}
                                    <span className="text-sky-600">
                                        {getTechnicianName(
                                            editModal.record.technician_id,
                                        )}
                                    </span>
                                </p>
                                <p className="text-sm font-medium text-slate-700">
                                    Tanggal:{" "}
                                    <span className="text-sky-600">
                                        {formatDateShort(
                                            editModal.record.attendance_date,
                                        )}
                                    </span>
                                </p>
                            </div>

                            <div>
                                <label className="block">
                                    <span className="text-xs font-medium text-slate-600 block mb-2">
                                        Jam Masuk
                                    </span>
                                    <input
                                        type="datetime-local"
                                        value={editModal.checkInTime}
                                        onChange={(e) =>
                                            setEditModal((prev) => ({
                                                ...prev,
                                                checkInTime: e.target.value,
                                            }))
                                        }
                                        disabled={editModal.isSaving}
                                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
                                    />
                                </label>
                            </div>

                            <div>
                                <label className="block">
                                    <span className="text-xs font-medium text-slate-600 block mb-2">
                                        Jam Pulang
                                    </span>
                                    <input
                                        type="datetime-local"
                                        value={editModal.checkOutTime}
                                        onChange={(e) =>
                                            setEditModal((prev) => ({
                                                ...prev,
                                                checkOutTime: e.target.value,
                                            }))
                                        }
                                        disabled={editModal.isSaving}
                                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
                                    />
                                </label>
                            </div>

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                <p className="text-xs text-blue-600">
                                    <strong>Catatan:</strong> Lokasi check-in
                                    dan check-out tidak dapat diubah. Hanya jam
                                    yang dapat diedit.
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 flex gap-2">
                            <button
                                onClick={handleCloseEditModal}
                                disabled={editModal.isSaving}
                                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
                            >
                                Batal
                            </button>
                            <button
                                onClick={handleSaveEditModal}
                                disabled={editModal.isSaving}
                                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 transition disabled:opacity-50"
                            >
                                {editModal.isSaving ? (
                                    <>
                                        <Loader
                                            size={16}
                                            className="animate-spin"
                                        />
                                        Menyimpan...
                                    </>
                                ) : (
                                    <>
                                        <Check size={16} />
                                        Simpan
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Unchecked Technicians Modal */}
            {uncheckedModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
                    <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl max-h-[80vh] overflow-auto">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-slate-900">
                                Teknisi Belum Absen
                            </h2>
                            <button
                                onClick={() => setUncheckedModal(false)}
                                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {uncheckedTechs.length > 0 ? (
                            <div>
                                <p className="text-sm text-slate-600 mb-4">
                                    Total{" "}
                                    <span className="font-semibold text-red-600">
                                        {uncheckedTechs.length}
                                    </span>{" "}
                                    teknisi belum melakukan check-in
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {uncheckedTechs.map((tech) => (
                                        <div
                                            key={tech.id}
                                            className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center justify-between"
                                        >
                                            <div>
                                                <p className="font-medium text-slate-900">
                                                    {tech.first_name}{" "}
                                                    {tech.last_name}
                                                </p>
                                                <p className="text-xs text-slate-500 mt-0.5">
                                                    ID:{" "}
                                                    {tech.id.substring(0, 8)}...
                                                </p>
                                            </div>
                                            <div className="text-2xl text-red-600"></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="py-8 text-center">
                                <p className="text-slate-600">
                                    ✅ Semua teknisi sudah melakukan check-in
                                </p>
                            </div>
                        )}

                        <div className="mt-6 flex gap-2">
                            <button
                                onClick={() => setUncheckedModal(false)}
                                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Mobile Bottom Nav */}
            <MobileBottomNav />
        </div>
    );
};

export default AttendanceLog;
