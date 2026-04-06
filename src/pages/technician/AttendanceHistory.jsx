import React, { useState, useEffect } from 'react';
import { CalendarDays, MapPin, Loader, Filter } from 'lucide-react';
import Sidebar from '../../components/layout/sidebar';
import useSidebarCollapsed from '../../hooks/useSidebarCollapsed';
import { useAuth } from '../../context/useAuth';
import { useAttendance, formatTimeShort, formatDateShort, formatWorkingHours } from '../../hooks/useAttendance';
import AttendanceMapModal from '../../components/AttendanceMapModal';

const AttendanceHistory = () => {
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useSidebarCollapsed();
  const { user } = useAuth();
  const { getAttendanceHistory, loading } = useAttendance();

  const [attendanceData, setAttendanceData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [filterPeriod, setFilterPeriod] = useState('month'); // 'week', 'month', 'custom'
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');

  // Map modal
  const [mapModal, setMapModal] = useState({ isOpen: false, data: null, type: null });

  useEffect(() => {
    loadAttendanceData();
  }, [user?.id]);

  useEffect(() => {
    applyFilters();
  }, [attendanceData, filterPeriod, customDateFrom, customDateTo]);

  const loadAttendanceData = async () => {
    if (!user?.id) return;

    const result = await getAttendanceHistory(user.id, null, null);

    if (result.success) {
      setAttendanceData(result.data || []);
    }
  };

  const applyFilters = () => {
    let filtered = [...attendanceData];
    const today = new Date();
    let dateFrom, dateTo;

    switch (filterPeriod) {
      case 'week':
        dateFrom = new Date(today);
        dateFrom.setDate(today.getDate() - today.getDay());
        dateTo = today;
        break;
      case 'month':
        dateFrom = new Date(today.getFullYear(), today.getMonth(), 1);
        dateTo = today;
        break;
      case 'custom':
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
      const dateFromStr = dateFrom.toISOString().split('T')[0];
      const dateToStr = dateTo.toISOString().split('T')[0];

      filtered = filtered.filter((item) => {
        return item.attendance_date >= dateFromStr && item.attendance_date <= dateToStr;
      });
    }

    setFilteredData(filtered);
  };

  const handleShowMap = (data, type) => {
    setMapModal({
      isOpen: true,
      data,
      type,
    });
  };

  return (
    <div className="min-h-screen bg-sky-50">
      <div className="flex min-h-screen">
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />

        <main className="min-w-0 flex-1 p-4 pb-24 md:p-8 md:pb-8">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">
              History Absensi
            </h1>
            <p className="mt-1 text-slate-600">
              Daftar absensi Anda dari waktu ke waktu
            </p>
          </div>

          {/* Filters */}
          <div className="mb-6 rounded-2xl bg-white p-4 shadow-sm md:px-6">
            <div className="flex items-center gap-2 mb-4">
              <Filter size={18} className="text-slate-600" />
              <h2 className="font-semibold text-slate-900">Filter</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <label className="block">
                <span className="text-xs font-medium text-slate-600 block mb-1">
                  Periode
                </span>
                <select
                  value={filterPeriod}
                  onChange={(e) => setFilterPeriod(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-300"
                >
                  <option value="week">Minggu Ini</option>
                  <option value="month">Bulan Ini</option>
                  <option value="custom">Custom</option>
                </select>
              </label>

              {filterPeriod === 'custom' && (
                <>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600 block mb-1">
                      Dari Tanggal
                    </span>
                    <input
                      type="date"
                      value={customDateFrom}
                      onChange={(e) => setCustomDateFrom(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-300"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs font-medium text-slate-600 block mb-1">
                      Sampai Tanggal
                    </span>
                    <input
                      type="date"
                      value={customDateTo}
                      onChange={(e) => setCustomDateTo(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-300"
                    />
                  </label>
                </>
              )}
            </div>
          </div>

          {/* Data Table */}
          <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center p-8">
                <Loader size={24} className="animate-spin text-slate-400 mr-2" />
                <span className="text-slate-600">Memuat data...</span>
              </div>
            ) : filteredData.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-slate-500">Tidak ada data absensi untuk periode ini</p>
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
                      <tr key={record.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 text-slate-700 font-medium">
                          {formatDateShort(record.attendance_date)}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {formatTimeShort(record.check_in_time)}
                        </td>
                        <td className="px-4 py-3">
                          {record.check_in_street_address ? (
                            <button
                              onClick={() =>
                                handleShowMap(
                                  {
                                    time: record.check_in_time,
                                    latitude: record.check_in_latitude,
                                    longitude: record.check_in_longitude,
                                    street_address: record.check_in_street_address,
                                    district: record.check_in_district,
                                    sub_district: record.check_in_sub_district,
                                    postal_code: record.check_in_postal_code,
                                    accuracy_meters: record.check_in_accuracy_meters,
                                  },
                                  'check-in'
                                )
                              }
                              className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 hover:underline"
                            >
                              <MapPin size={14} />
                              <span className="text-xs line-clamp-1">
                                {record.check_in_district || 'Lihat Peta'}
                              </span>
                            </button>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {formatTimeShort(record.check_out_time)}
                        </td>
                        <td className="px-4 py-3">
                          {record.check_out_street_address ? (
                            <button
                              onClick={() =>
                                handleShowMap(
                                  {
                                    time: record.check_out_time,
                                    latitude: record.check_out_latitude,
                                    longitude: record.check_out_longitude,
                                    street_address: record.check_out_street_address,
                                    district: record.check_out_district,
                                    sub_district: record.check_out_sub_district,
                                    postal_code: record.check_out_postal_code,
                                    accuracy_meters: record.check_out_accuracy_meters,
                                  },
                                  'check-out'
                                )
                              }
                              className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 hover:underline"
                            >
                              <MapPin size={14} />
                              <span className="text-xs line-clamp-1">
                                {record.check_out_district || 'Lihat Peta'}
                              </span>
                            </button>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-block bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">
                            {record.working_hours_minutes
                              ? formatWorkingHours(record.working_hours_minutes)
                              : '-'}
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
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
                <p className="text-sm text-blue-600 font-medium">Total Hari Kerja</p>
                <p className="text-2xl font-bold text-blue-900 mt-2">
                  {filteredData.filter((r) => r.working_hours_minutes).length} hari
                </p>
              </div>

              <div className="rounded-xl bg-green-50 border border-green-200 p-4">
                <p className="text-sm text-green-600 font-medium">Total Jam Kerja</p>
                <p className="text-2xl font-bold text-green-900 mt-2">
                  {formatWorkingHours(
                    filteredData.reduce((sum, r) => sum + (r.working_hours_minutes || 0), 0)
                  )}
                </p>
              </div>

              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                <p className="text-sm text-amber-600 font-medium">Belum Full Kerja</p>
                <p className="text-2xl font-bold text-amber-900 mt-2">
                  {filteredData.filter((r) => !r.check_out_time).length} hari
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Map Modal */}
      <AttendanceMapModal
        isOpen={mapModal.isOpen}
        onClose={() => setMapModal({ isOpen: false, data: null, type: null })}
        data={mapModal.data}
        type={mapModal.type}
      />
    </div>
  );
};

export default AttendanceHistory;
