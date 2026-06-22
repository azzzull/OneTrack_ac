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

## Environment

Buat file environment lokal dan isi variabel berikut:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_KEY=
VITE_WEB_PUSH_VAPID_PUBLIC_KEY=
```

Jangan menyimpan service role key, password database, token admin, atau secret production di file yang di-commit.

## Pengembangan Lokal

1. Install dependency:

```bash
npm install
```

2. Jalankan dev server:

```bash
npm run dev
```

3. Build production:

```bash
npm run build
```

4. Cek lint:

```bash
npm run lint
```

## Supabase

Migration database berada di folder `supabase/migrations/`. Edge Function yang dipakai aplikasi berada di `supabase/functions/`, termasuk:

- `admin-create-user`
- `admin-update-user-password`
- `admin-delete-user`
- `send-push-notification`
- `send-accommodation-notification`
- `run-scheduled-reminders`

Deploy migration dan Edge Function yang relevan sebelum memakai fitur admin, notifikasi, payment request, atau laporan di environment baru.

## Struktur Penting

- `src/App.jsx`: routing dan proteksi role.
- `src/components/layout/sidebar.jsx`: menu per role, badge pending, notification center, dan logout.
- `src/pages/admin/`: dashboard, pekerjaan, job baru, master data, dan absensi.
- `src/pages/customer/`: dashboard customer, request, dan service history.
- `src/pages/technician/`: dashboard teknisi dan riwayat absensi.
- `src/pages/accommodation/`: pengajuan accommodation dan laporan.
- `src/pages/overtime/`: pengajuan dan approval lembur.
- `src/pages/reimbursement/`: reimburse dan laporan.
- `src/pages/loan/`: pinjaman dan laporan.
- `src/services/`: akses data Supabase dan event notifikasi.
- `src/utils/`: helper export Excel, offline queue, geolocation, barcode, dan format data.

