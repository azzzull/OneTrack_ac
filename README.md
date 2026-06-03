# OneTrack

OneTrack adalah aplikasi operasional untuk pencatatan dan pengelolaan pekerjaan teknisi berbasis scope proyek. Aplikasi ini mendukung alur admin, customer, dan teknisi dalam satu sistem.

## Fitur Utama

- Master data customer, project, role, dan scope pekerjaan
- Dynamic detail form per scope
- Checklist pekerjaan per scope
- Multi-technician collaboration dalam satu job
- Upload foto before, progress, dan after
- Scan barcode/serial number via kamera
- Dashboard dan daftar job per role
- Detail job dengan badge pembuat
- Integrasi Supabase untuk data, auth, storage, dan realtime

## Alur Penggunaan

### 1. Login

- Masuk menggunakan akun yang sudah terdaftar.
- Sistem akan menampilkan menu sesuai role:
  - Admin
  - Teknisi
  - Customer

### 2. Kelola Master Data

Admin bisa membuka menu **Master Data** untuk mengelola:

- User
- Customer
- Project
- Scope Pekerjaan
- Brand, tipe, dan PK AC

### 3. Atur Scope Pekerjaan

Di menu **Scope Pekerjaan**, admin bisa:

- menambah field detail per scope
- mengubah field detail
- menghapus field detail
- mengatur urutan field
- mengatur checklist pekerjaan

Field detail akan tampil otomatis di form job sesuai scope project yang dipilih.

### 4. Membuat Job Baru

Saat membuat job:

- pilih customer
- pilih project
- scope akan otomatis mengikuti project
- isi detail pekerjaan yang muncul
- tambahkan teknisi lain jika diperlukan
- unggah foto pekerjaan bila ada
- simpan job

Serial number tersedia di semua scope, tetapi sifatnya opsional.

### 5. Multi-Technician Collaboration

Satu job bisa dikerjakan oleh lebih dari satu teknisi.

- teknisi pembuat akan diberi badge **Pembuat**
- teknisi lain yang ditambahkan akan melihat job yang sama
- teknisi member juga bisa ikut memperbarui job sesuai aturan sistem

### 6. Menyimpan Pekerjaan

Setelah job dibuat:

- job muncul di daftar sesuai role
- detail job bisa dibuka dari halaman daftar job
- foto dan progress bisa dilanjutkan dari detail job

## Catatan Penggunaan

- Jika field detail belum muncul, pastikan scope project sudah dipilih.
- Jika teknisi lain belum terlihat, pastikan relasi teknisi pada job sudah tersimpan.
- Jika perubahan schema atau policy Supabase belum terlihat, lakukan refresh browser setelah migration dijalankan.

## Environment

Gunakan file environment lokal untuk menyimpan secret.

Contoh variabel yang biasa dipakai:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Jangan menyimpan secret service role, password database, atau token admin ke dalam file yang di-commit.

## Struktur Teknologi

- React
- Vite
- Supabase
- Tailwind CSS

## Pengembangan Lokal

1. Install dependency
2. Jalankan aplikasi dengan `npm run dev`
3. Buka browser ke alamat lokal yang ditampilkan Vite

## Migrasi Database

Migration Supabase ada di folder `supabase/migrations/` pada workspace lokal. Jalankan migration yang diperlukan di environment Supabase sebelum memakai fitur baru.

