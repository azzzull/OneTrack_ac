import React, { useState } from 'react';
import { LogInIcon, LogOutIcon, Loader } from 'lucide-react';
import { useAttendance, formatWorkingHours } from '../hooks/useAttendance';

/**
 * Smart attendance button - changes based on daily status
 * Shows "Absen Masuk" if not checked in
 * Shows "Absen Pulang" if checked in but not checked out
 * Hides if already checked out
 */
const AttendanceButton = ({ technicianId, onCheckInSuccess, onCheckOutSuccess, onError }) => {
  const { recordCheckIn, recordCheckOut, loading: attendanceLoading, getTodayAttendance } =
    useAttendance();
  const [todayStatus, setTodayStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  React.useEffect(() => {
    loadTodayStatus();
  }, []);

  const loadTodayStatus = async () => {
    setLoadingStatus(true);
    const result = await getTodayAttendance(technicianId);
    setTodayStatus(result.status);
    setLoadingStatus(false);
  };

  const handleCheckIn = async () => {
    const result = await recordCheckIn(technicianId);

    if (result.success) {
      setTodayStatus('checked_in_only');
      onCheckInSuccess?.(result.data);

      // Show success toast
      showSuccessToast(result.message);
    } else {
      onError?.(result.error);
      showErrorToast(result.error);
    }
  };

  const handleCheckOut = async () => {
    const result = await recordCheckOut(technicianId);

    if (result.success) {
      setTodayStatus('checked_in_and_out');
      onCheckOutSuccess?.(result.data);

      // Show success toast
      showSuccessToast(result.message);
    } else {
      onError?.(result.error);
      showErrorToast(result.error);
    }
  };

  // Loading state
  if (loadingStatus) {
    return (
      <button disabled className="px-4 py-2 bg-gray-300 text-gray-600 rounded-lg cursor-not-allowed">
        <Loader className="inline mr-2 animate-spin" size={18} />
        Memuat...
      </button>
    );
  }

  // Not checked in - show check-in button
  if (todayStatus === 'not_checked_in') {
    return (
      <button
        onClick={handleCheckIn}
        disabled={attendanceLoading}
        className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium flex items-center gap-2 shadow-md"
      >
        {attendanceLoading ? <Loader size={18} className="animate-spin" /> : <LogInIcon size={18} />}
        {attendanceLoading ? 'Sedang Absen...' : 'Absen Masuk'}
      </button>
    );
  }

  // Checked in but not out - show check-out button
  if (todayStatus === 'checked_in_only') {
    return (
      <button
        onClick={handleCheckOut}
        disabled={attendanceLoading}
        className="px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg hover:from-amber-600 hover:to-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium flex items-center gap-2 shadow-md"
      >
        {attendanceLoading ? <Loader size={18} className="animate-spin" /> : <LogOutIcon size={18} />}
        {attendanceLoading ? 'Sedang Absen...' : 'Absen Pulang'}
      </button>
    );
  }

  // Already checked out - hide button
  if (todayStatus === 'checked_in_and_out') {
    return null;
  }

  return null;
};

/**
 * Toast utility functions
 */
function showSuccessToast(message) {
  // Create or use existing toast container
  const toastContainer = getOrCreateToastContainer();

  const toast = document.createElement('div');
  toast.className =
    'bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg animate-fade-in-up mb-2';
  toast.textContent = message;

  toastContainer.appendChild(toast);

  // Auto remove after 4 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function showErrorToast(message) {
  const toastContainer = getOrCreateToastContainer();

  const toast = document.createElement('div');
  toast.className = 'bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg animate-fade-in-up mb-2';
  toast.textContent = message;

  toastContainer.appendChild(toast);

  // Auto remove after 5 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

function getOrCreateToastContainer() {
  let container = document.getElementById('toast-container');

  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'fixed top-4 right-4 z-50 pointer-events-auto';
    document.body.appendChild(container);
  }

  return container;
}

export default AttendanceButton;
