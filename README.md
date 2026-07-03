# OneTrack

OneTrack adalah aplikasi operasional berbasis React, Vite, Supabase, dan Capacitor untuk mengelola pekerjaan teknisi, absensi, payment request, notifikasi, dan laporan dalam satu sistem.

## Role Pengguna

- `admin`: mengelola dashboard operasional, pekerjaan, job baru, accommodation, master data, absensi, lembur, reimburse, pinjaman, dan laporan.
- `management`: memantau dashboard, pekerjaan, approval accommodation, master data, absensi, lembur, reimburse, pinjaman, dan laporan.
- `technician`: melihat dan mengambil pekerjaan, membuat job, absensi, lembur, reimburse, pinjaman, dan accommodation untuk teknisi internal.
- `customer`: membuat request pekerjaan, memantau progres service, mengunduh laporan pekerjaan, dan mengelola profil.

## Fitur Utama Saat Ini

- Login berbasis Supabase Auth dengan proteksi halaman sesuai role.
- Dashboard operasional dengan KPI pekerjaan, distribusi status, aktivitas 7 hari terakhir, absensi hari ini, dan ringkasan payment request.
- Manajemen pekerjaan: request customer, job baru, assignment teknisi, detail scope dinamis, checklist, foto before/progress/after, barcode/serial number, status pekerjaan, dan export Excel.
- Master data: user, role, customer, project, scope pekerjaan, merk AC, tipe AC, dan kapasitas AC.
- Dynamic scope fields dan checklist per scope pekerjaan.
- Absensi teknisi dengan check-in/check-out, geolocation, riwayat teknisi, log admin, peta lokasi, edit jam absensi, dan export Excel.
- Lembur dengan validasi absensi, pengajuan teknisi, approval/reject admin atau management, dan filter data.
- Accommodation/cash advance untuk teknisi internal, approval management/admin sesuai mode, realisasi, laporan, dan export Excel.
- Reimburse dengan upload bukti, approval/reject, laporan, dan export Excel.
- Pinjaman dengan pengajuan, approval/reject, pembayaran cicilan, approval pembayaran, laporan, dan export Excel.
- Notifikasi realtime, notification center, web push, dan badge pending pada menu.
- Dukungan offline queue untuk update pekerjaan dan upload yang menunggu sinkronisasi.
- PWA dan build Android melalui Capacitor.

Dokumentasi penggunaan lengkap tersedia di [DOKUMENTASI_FITUR.md](./DOKUMENTASI_FITUR.md).