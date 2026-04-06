import React from 'react';
import { X } from 'lucide-react';
import LeafletMap from './Maps/LeafletMap';
import { formatAddress } from '../utils/nominatim';

/**
 * Modal to display attendance location on map
 * Shows a single check-in or check-out location with all details
 */
const AttendanceMapModal = ({ 
  isOpen, 
  onClose, 
  data,
  type = 'check-in' // 'check-in' or 'check-out'
}) => {
  if (!isOpen || !data) return null;

  const {
    time,
    latitude,
    longitude,
    street_address,
    district,
    sub_district,
    postal_code,
    accuracy_meters,
    technician_name,
  } = data;

  const marker = {
    lat: parseFloat(latitude),
    lng: parseFloat(longitude),
    label: type === 'check-in' ? 'Lokasi Masuk' : 'Lokasi Pulang',
    info: {
      waktu: new Date(time).toLocaleString('id-ID', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      alamat: street_address || '-',
      kecamatan: district || '-',
      kelurahan: sub_district || '-',
      kode_pos: postal_code || '-',
      akurasi: accuracy_meters ? `±${Math.round(accuracy_meters)}m` : 'N/A',
      koordinat: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
    },
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-500 to-blue-600 text-white p-6 flex justify-between items-center border-b border-blue-700">
          <div>
            <h2 className="text-xl font-bold">
              {type === 'check-in' ? 'Detail Lokasi Masuk' : 'Detail Lokasi Pulang'}
            </h2>
            {technician_name && (
              <p className="text-sm text-blue-100 mt-1">Teknisi: {technician_name}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-blue-700 rounded-full p-2 transition"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Map */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Peta Lokasi</h3>
            <LeafletMap
              markers={[marker]}
              center={{ lat: marker.lat, lng: marker.lng }}
              zoom={16}
              height="350px"
              className="shadow-md"
            />
          </div>

          {/* Details */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Detail Lokasi</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Waktu {type === 'check-in' ? 'Masuk' : 'Pulang'}
                </label>
                <p className="text-gray-900">
                  {new Date(time).toLocaleString('id-ID', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Akurasi GPS
                </label>
                <p className="text-gray-900">
                  {accuracy_meters ? `±${Math.round(accuracy_meters)} meter` : 'Tidak tersedia'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nama Jalan
                </label>
                <p className="text-gray-900">{street_address || '-'}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kecamatan
                </label>
                <p className="text-gray-900">{district || '-'}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kelurahan
                </label>
                <p className="text-gray-900">{sub_district || '-'}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kode Pos
                </label>
                <p className="text-gray-900">{postal_code || '-'}</p>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Koordinat GPS
                </label>
                <p className="text-gray-900 font-mono text-sm">
                  {latitude.toFixed(6)}, {longitude.toFixed(6)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 p-6 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

export default AttendanceMapModal;
