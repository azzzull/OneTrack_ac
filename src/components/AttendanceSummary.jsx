import React, { useState, useEffect } from "react";
import { Clock, MapPin, AlertCircle } from "lucide-react";
import {
    useAttendance,
    formatTimeShort,
    formatWorkingHours,
} from "../hooks/useAttendance";
import { formatAddressShort } from "../utils/nominatim";

/**
 * Display today's attendance status and summary
 * Shows: check-in time/location, check-out time/location, working hours
 */
const AttendanceSummary = ({ technicianId }) => {
    const { getTodayAttendance } = useAttendance();
    const [attendanceData, setAttendanceData] = useState(null);

    useEffect(() => {
        const loadData = async () => {
            const result = await getTodayAttendance(technicianId);

            if (result.data) {
                setAttendanceData(result.data);
            }
        };
        loadData();

        // Refresh every 30 seconds
        const interval = setInterval(loadData, 30000);
        return () => clearInterval(interval);
    }, [technicianId, getTodayAttendance]);

    // Not checked in yet
    if (!attendanceData) {
        return (
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-gray-700 font-medium">
                    <AlertCircle
                        className="inline mr-2 text-blue-500"
                        size={18}
                    />
                    Anda belum melakukan absen hari ini
                </p>
            </div>
        );
    }

    const checkInTime = formatTimeShort(attendanceData.check_in_time);
    const checkOutTime = formatTimeShort(attendanceData.check_out_time);
    const workingHours = formatWorkingHours(
        attendanceData.working_hours_minutes,
    );

    // Only checked in
    if (!attendanceData.check_out_time) {
        return (
            <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Clock className="text-blue-500" size={18} />
                        <span className="font-medium text-gray-900">
                            Absen Masuk:{" "}
                            <span className="text-blue-600">{checkInTime}</span>
                        </span>
                    </div>
                    {attendanceData.check_in_street_address && (
                        <div className="flex items-start gap-2 ml-6">
                            <MapPin
                                className="text-blue-400 mt-0.5"
                                size={16}
                            />
                            <span className="text-sm text-gray-700">
                                {formatAddressShort({
                                    street: attendanceData.check_in_street_address,
                                    district: attendanceData.check_in_district,
                                })}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Checked in and out
    return (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="space-y-3">
                {/* Check-in section */}
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-green-700 bg-green-200 px-2 py-1 rounded">
                            MASUK
                        </span>
                        <span className="font-medium text-gray-900">
                            {checkInTime}
                        </span>
                    </div>
                    <div className="ml-6 mt-1">
                        <p className="text-sm text-gray-600">
                            {formatAddressShort({
                                street: attendanceData.check_in_street_address,
                                district: attendanceData.check_in_district,
                            })}
                        </p>
                    </div>
                </div>

                {/* Divider */}
                <div className="h-px bg-gradient-to-r from-green-200 to-emerald-200"></div>

                {/* Check-out section */}
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-amber-700 bg-amber-200 px-2 py-1 rounded">
                            PULANG
                        </span>
                        <span className="font-medium text-gray-900">
                            {checkOutTime}
                        </span>
                    </div>
                    <div className="ml-6 mt-1">
                        <p className="text-sm text-gray-600">
                            {formatAddressShort({
                                street: attendanceData.check_out_street_address,
                                district: attendanceData.check_out_district,
                            })}
                        </p>
                    </div>
                </div>

                {/* Working hours */}
                <div className="bg-white bg-opacity-70 rounded p-2 mt-2">
                    <p className="text-sm">
                        <span className="text-gray-600">Jam Kerja: </span>
                        <span className="font-semibold text-green-700">
                            {workingHours}
                        </span>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AttendanceSummary;
