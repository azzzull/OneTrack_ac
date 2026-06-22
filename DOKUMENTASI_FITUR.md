# Dokumentasi Penggunaan Fitur OneTrack

Dokumen ini menjelaskan cara memakai fitur utama OneTrack berdasarkan role pengguna yang tersedia saat ini: admin, management, technician, dan customer.

## 1. Login, Logout, dan Profil

### Login

1. Buka aplikasi OneTrack.
2. Masukkan email dan password.
3. Setelah berhasil login, aplikasi otomatis membuka dashboard sesuai role.

### Logout

1. Klik menu profil atau tombol `Logout` pada sidebar/top menu.
2. Jika masih ada draft offline di perangkat, aplikasi akan meminta konfirmasi apakah draft tersebut ingin dihapus.

### Profil

1. Buka menu profil dari identitas pengguna di sidebar atau mobile header.
2. Perbarui data profil yang tersedia.
3. Gunakan bagian keamanan untuk mengganti password jika diperlukan.

## 2. Navigasi dan Hak Akses

### Admin

Menu utama admin:

- Dashboard
- Pekerjaan
- New Job
- Accommodation
- Master Data
- Absensi
- Lembur
- Reimburse
- Pinjaman

### Management

Menu utama management:

- Dashboard
- Pekerjaan
- Accommodation
- Master Data
- Absensi
- Lembur
- Reimburse
- Pinjaman

### Technician

Menu utama technician:

- Dashboard
- Pekerjaan
- New Job
- History Absensi
- Lembur
- Reimburse
- Pinjaman
- Accommodation, khusus technician internal

### Customer

Menu utama customer:

- Dashboard
- My Service
- Request

## 3. Dashboard

Dashboard menampilkan ringkasan operasional sesuai role.

Fitur yang tersedia:

- Sapaan pengguna dan tanggal.
- Absensi hari ini untuk role yang relevan.
- KPI pekerjaan seperti pending, in progress, completed, dan total pekerjaan.
- Quick actions untuk membuka menu yang sering dipakai.
- Persentase penyelesaian pekerjaan.
- Distribusi status pekerjaan.
- Aktivitas pekerjaan 7 hari terakhir.
- Ringkasan payment request pending untuk admin dan management.

Cara menggunakan:

1. Buka menu `Dashboard`.
2. Klik kartu KPI atau quick action untuk langsung masuk ke daftar terkait.
3. Arahkan kursor ke chart status atau aktivitas untuk melihat detail.

## 4. Pekerjaan

Modul pekerjaan dipakai untuk membuat, melihat, mengambil, mengubah progres, dan melaporkan pekerjaan.

### Melihat Daftar Pekerjaan

1. Buka menu `Pekerjaan` atau `My Service`.
2. Gunakan filter status, periode, teknisi, atau pencarian jika tersedia.
3. Klik item pekerjaan untuk membuka detail.

Status utama pekerjaan:

- Pending
- In Progress
- Completed
- Cancelled

### Membuat Job Baru

Role yang dapat membuat job:

- Admin
- Technician
- Management, sesuai route yang tersedia

Langkah:

1. Buka menu `New Job`.
2. Pilih customer dan project.
3. Scope pekerjaan akan mengikuti project yang dipilih.
4. Isi detail pekerjaan yang muncul.
5. Isi checklist scope jika tersedia.
6. Tambahkan teknisi lain jika pekerjaan dikerjakan bersama.
7. Upload foto before, progress, atau after jika diperlukan.
8. Simpan job.

Catatan status:

- Foto before/progress biasanya membuat pekerjaan menjadi `In Progress`.
- Foto after biasanya menandai pekerjaan sebagai `Completed`.
- Jika tidak ada perubahan foto, status dapat tetap mengikuti status sebelumnya.

### Mengelola Detail Pekerjaan

Pada detail pekerjaan pengguna dapat:

- Melihat informasi customer, project, scope, lokasi, teknisi, dan status.
- Mengubah detail pekerjaan sesuai akses role.
- Upload atau preview foto before/progress/after.
- Mengisi checklist pekerjaan.
- Mengelola teknisi yang terlibat.
- Melihat badge pembuat job.
- Scan barcode atau serial number jika field tersedia.

### Export Excel Pekerjaan

1. Buka daftar pekerjaan.
2. Terapkan filter yang dibutuhkan.
3. Klik `Download Excel`.
4. File yang diunduh mengikuti data yang sedang difilter.

## 5. Request Customer

Customer dapat membuat request pekerjaan dari aplikasi.

Langkah:

1. Login sebagai customer.
2. Buka menu `Request`.
3. Pilih project.
4. Isi brief atau deskripsi kebutuhan.
5. Lengkapi field detail scope yang wajib.
6. Kirim request.

Setelah dikirim:

- Request muncul di `My Service`.
- Admin, management, dan technician dapat melihat request sesuai akses.
- Customer dapat memantau status dan progres pekerjaan.

## 6. Master Data

Master Data dipakai admin dan management untuk mengelola data referensi aplikasi.

Modul tersedia:

- Daftar User
- Role
- Customer
- Project
- Scope Pekerjaan
- Merk AC
- Tipe AC
- Kapasitas AC

### User

Fitur:

- Melihat user aktif.
- Membuat user baru melalui Edge Function admin.
- Mengubah data user.
- Mengubah role.
- Mengatur tipe teknisi internal atau external.
- Mengatur assignment customer untuk teknisi.
- Menghapus atau menonaktifkan user melalui Edge Function admin.

Catatan teknisi:

- Technician internal dapat ditugaskan ke banyak customer.
- Technician external wajib memiliki satu customer.

### Customer

Fitur:

- Membuat data customer.
- Mengisi PIC, telepon, email login, alamat, project awal, dan password awal.
- Mengubah data customer.
- Menghapus data jika diizinkan policy database.

### Project

Fitur:

- Membuat project per customer.
- Mengatur nama project, scope project, lokasi, PIC, telepon, dan alamat.
- Memfilter project berdasarkan customer.

### Scope Pekerjaan

Fitur:

- Membuat kode dan label scope.
- Mengelola field detail dinamis per scope.
- Mengelola checklist pekerjaan per scope.

Field detail dan checklist yang dibuat di sini akan muncul pada form job sesuai scope project.

### Merk, Tipe, dan Kapasitas AC

Fitur:

- Menambah data referensi AC.
- Mengubah data referensi.
- Menghapus data referensi jika tidak terpakai atau diizinkan policy database.

## 7. Absensi

Absensi dipakai technician untuk check-in/check-out dan admin/management untuk memantau kehadiran.

### Absensi Technician

1. Buka dashboard technician atau menu `History Absensi`.
2. Klik `Absen Masuk` saat mulai bekerja.
3. Izinkan akses lokasi.
4. Submit absen.
5. Klik `Absen Pulang` saat selesai bekerja.

Data yang direkam:

- Tanggal.
- Jam check-in/check-out.
- Lokasi dan akurasi.
- Alamat hasil reverse geocoding jika tersedia.

### History Absensi

Technician dapat melihat riwayat absensi pribadi dan status harian.

### Log Absensi Admin/Management

1. Buka menu `Absensi`.
2. Gunakan filter teknisi, tanggal, dan status.
3. Lihat ringkasan absensi dan daftar harian.
4. Klik lokasi untuk melihat peta.
5. Gunakan fitur edit jam absensi jika koreksi diperlukan.
6. Klik `Export Excel` untuk mengunduh laporan.

Catatan:

- Edit absensi hanya mengubah waktu.
- Lokasi check-in/check-out tidak diubah dari modal edit.

## 8. Lembur

Modul lembur menghubungkan data absensi dengan pengajuan overtime.

### Mengajukan Lembur

1. Login sebagai technician.
2. Buka menu `Lembur`.
3. Pastikan absensi memenuhi syarat lembur.
4. Buat pengajuan.
5. Isi tanggal, jam, durasi, dan alasan.
6. Simpan pengajuan.

### Approval Lembur

Role admin dan management dapat:

- Melihat daftar pengajuan.
- Memfilter berdasarkan status, requester, dan periode.
- Membuka detail pengajuan.
- Klik `Approve` untuk menyetujui.
- Klik `Reject` untuk menolak.

Status lembur:

- Pending
- Approved
- Rejected

## 9. Accommodation atau Cash Advance

Accommodation dipakai untuk pengajuan dana akomodasi/cash advance dan pencatatan realisasi biaya operasional. Di sisi technician, menu ini hanya tersedia untuk `technician` dengan tipe `internal`.

Prinsip penting:

- Satu pengajuan accommodation bisa direalisasikan berkali-kali.
- Realisasi selalu ditambahkan dari pengajuan awal yang sudah disetujui.
- Jika masih ada sisa dana dari accommodation sebelumnya, technician atau admin harus membuka pengajuan awal tersebut dan menambahkan realisasi baru sampai sisa dana habis atau sesuai kondisi aktual.
- Jangan membuat pengajuan baru hanya untuk menghabiskan sisa dana dari pengajuan lama.

### Status Accommodation

- `Pending`: pengajuan baru dibuat dan menunggu approval.
- `Approved`: pengajuan disetujui dan dana sudah tercatat dengan bukti transfer.
- `Rejected`: pengajuan ditolak.
- `Realization Process`: pengajuan sudah mulai direalisasikan.
- `Partial Realized`: sebagian dana sudah direalisasikan, tetapi masih ada sisa.
- `Realized`: seluruh dana approved sudah direalisasikan.

Nominal yang perlu diperhatikan di detail:

- `Requested`: nominal yang diajukan technician.
- `Approved`: nominal yang disetujui management.
- `Remaining`: sisa dana yang belum direalisasikan.
- `Receipt List`: daftar bukti realisasi yang sudah diupload.

### Pengajuan Technician

Gunakan langkah ini jika belum ada accommodation yang mewakili kebutuhan dana tersebut.

1. Login sebagai technician internal.
2. Buka menu `Accommodation`.
3. Klik tombol tambah `+`.
4. Isi `Request Title` dengan judul singkat, misalnya `Akomodasi Project Gedung A`.
5. Isi `Requested Amount` sesuai dana yang dibutuhkan.
6. Isi `Purpose` dengan rincian kebutuhan dana, misalnya transport, parkir, tol, makan, penginapan, atau kebutuhan operasional lain.
7. Pilih `Customer` jika pengajuan terkait customer tertentu.
8. Pilih `Project` jika pengajuan terkait project tertentu. Field ini aktif setelah customer dipilih.
9. Klik `Submit Request`.
10. Tunggu approval dari admin atau management.

Setelah submit:

- Status menjadi `Pending`.
- Technician belum bisa menambahkan realisasi sampai pengajuan disetujui.
- Jika ditolak, status menjadi `Rejected` dan alasan penolakan tampil di detail.

### Approval Admin/Management

1. Buka menu `Accommodation`.
2. Gunakan filter status atau periode jika diperlukan.
3. Buka detail pengajuan.
4. Setujui dengan nominal yang disetujui atau tolak dengan alasan.

Saat pengajuan disetujui:

- Admin atau management mengisi `Approved Amount`.
- Admin atau management mengupload `Transfer Proof`.
- Status menjadi `Approved`.
- Technician dapat membuka detail pengajuan dan mulai upload realisasi.

### Realisasi Accommodation oleh Technician atau Admin

Realisasi adalah pencatatan pemakaian dana accommodation berdasarkan bukti transaksi. Tombol `Add Realization` muncul jika pengajuan berstatus `Approved`, `Realization Process`, atau `Partial Realized`.

Role yang dapat menambahkan realisasi:

- Technician internal, dari menu `Accommodation`.
- Admin, dari menu `Accommodation` admin.

Langkah realisasi:

1. Login sebagai technician internal atau admin.
2. Buka menu `Accommodation`.
3. Cari pengajuan accommodation yang sudah disetujui.
4. Gunakan filter `Approved`, `Partial`, atau kartu sisa dana jika pengajuan lama tidak langsung terlihat.
5. Klik pengajuan untuk membuka detail.
6. Periksa nilai `Approved` dan `Remaining`.
7. Klik `Add Realization`.
8. Upload `Receipt Photo`, yaitu foto struk, nota, invoice, bukti pembayaran, atau bukti transaksi lain.
9. Isi `Amount` sesuai nominal pada bukti transaksi.
10. Isi `Transaction Date` sesuai tanggal transaksi.
11. Isi `Description` dengan keterangan singkat, misalnya `Tol dan parkir kunjungan site`.
12. Klik `Upload Realization`.

Setelah upload:

- Bukti masuk ke `Receipt List`.
- Total realisasi bertambah.
- `Remaining` berkurang otomatis.
- Jika masih ada sisa, status dapat tetap proses/partial.
- Jika total realisasi sudah sama dengan nominal approved, status menjadi `Realized`.

### Cara Merealisasikan Sisa dari Accommodation Lama

Jika masih ada sisa dari accommodation sebelumnya, realisasikan dari pengajuan awal tersebut.

Contoh kasus:

- Technician mengajukan accommodation Rp1.000.000.
- Management approve Rp1.000.000.
- Technician sudah upload realisasi pertama Rp650.000.
- Di detail, `Remaining` masih Rp350.000.
- Technician kemudian memiliki bukti transaksi tambahan Rp200.000.

Langkah yang benar:

1. Buka menu `Accommodation`.
2. Cari pengajuan awal yang approved/partial, misalnya `Akomodasi Project Gedung A`.
3. Buka detail pengajuan tersebut.
4. Pastikan `Remaining` masih Rp350.000.
5. Klik `Add Realization`.
6. Upload receipt baru.
7. Isi `Amount` Rp200.000.
8. Isi tanggal transaksi dan deskripsi.
9. Klik `Upload Realization`.
10. Cek ulang detail. `Remaining` akan menjadi Rp150.000.

Jika kemudian ada bukti transaksi lagi Rp150.000:

1. Buka pengajuan awal yang sama.
2. Klik `Add Realization`.
3. Upload receipt berikutnya.
4. Isi `Amount` Rp150.000.
5. Simpan realisasi.
6. `Remaining` menjadi Rp0 dan pengajuan dianggap selesai/realized.

Yang tidak disarankan:

- Membuat pengajuan accommodation baru untuk transaksi yang sebenarnya masih bagian dari sisa pengajuan lama.
- Menggabungkan beberapa bukti transaksi tanpa deskripsi yang jelas.
- Mengisi nominal realisasi lebih besar dari sisa dana yang sebenarnya dipakai.

### Jika Sisa Dana Tidak Terpakai

Jika masih ada `Remaining`, tetapi dana tidak dipakai:

1. Jangan buat pengajuan baru untuk menutup sisa.
2. Koordinasikan dengan admin atau management sesuai SOP internal.
3. Jika sistem membutuhkan bukti pengembalian dana, upload realisasi/receipt sesuai arahan internal perusahaan.
4. Pastikan catatan di `Description` menjelaskan bahwa transaksi tersebut adalah pengembalian atau penyelesaian sisa dana, jika memang diminta oleh SOP.

Catatan: aplikasi menghitung sisa dari `Approved - total realisasi`. Karena itu, semua pemakaian atau penyelesaian sisa harus dicatat pada pengajuan awal agar laporan accommodation tetap akurat.

### Tips Pencarian Accommodation Lama

Jika pengajuan lama tidak terlihat:

1. Ubah filter periode dari mingguan ke bulanan, tahunan, atau custom.
2. Gunakan filter status `Partial` atau `Realized`.
3. Gunakan kolom pencarian berdasarkan judul atau purpose.
4. Buka detail dan cek `Remaining`.

### Laporan Accommodation

1. Buka `Accommodation Reports`.
2. Filter data berdasarkan periode, status, atau teknisi.
3. Lihat ringkasan cash advance, realisasi, dan dana pending.
4. Klik `Export Excel`.

## 10. Reimburse

Reimburse dipakai untuk klaim pengeluaran yang sudah terjadi.

### Mengajukan Reimburse

1. Buka menu `Reimburse`.
2. Klik tombol tambah atau ajukan reimburse.
3. Isi tanggal transaksi, nominal klaim, deskripsi, dan kategori jika tersedia.
4. Upload bukti transaksi.
5. Simpan pengajuan.

### Approval Reimburse

Admin dan management dapat:

- Melihat semua reimburse.
- Memfilter periode, requester, status, dan pencarian.
- Membuka detail reimburse.
- Approve dengan nominal disetujui dan bukti transfer.
- Tolak dengan alasan.

Status reimburse:

- Pending
- Approved
- Rejected

### Laporan Reimburse

1. Buka halaman laporan reimburse.
2. Terapkan filter.
3. Lihat summary total klaim, disetujui, selisih, pending, approved, dan rejected.
4. Klik `Export Excel`.

## 11. Pinjaman

Modul pinjaman dipakai untuk pengajuan pinjaman dan pencatatan pembayaran.

### Mengajukan Pinjaman

1. Buka menu `Pinjaman`.
2. Buat pengajuan pinjaman.
3. Isi nominal, tanggal kebutuhan, tujuan, dan catatan.
4. Simpan pengajuan.

### Approval Pinjaman

Admin dan management dapat:

- Melihat pinjaman pending.
- Membuka detail pinjaman.
- Approve atau reject pengajuan.
- Melihat status pembayaran.

### Pembayaran Pinjaman

1. Buka detail pinjaman yang sudah disetujui.
2. Tambahkan pembayaran atau cicilan.
3. Upload bukti pembayaran jika diminta.
4. Admin atau management dapat approve/reject pembayaran.

### Laporan Pinjaman

1. Buka halaman laporan pinjaman.
2. Filter berdasarkan periode, requester, status, atau pencarian.
3. Lihat ringkasan pending, approved, rejected, total pinjaman, dan pembayaran.
4. Klik `Export Excel`.

## 12. Notifikasi

OneTrack mendukung notifikasi realtime dan web push.

Fitur:

- Badge pending pada menu pekerjaan, accommodation, reimburse, dan pinjaman.
- Notification center di header/sidebar.
- Tombol aktivasi web push.
- Notifikasi saat ada job baru, perubahan status pekerjaan, pengajuan accommodation, lembur, reimburse, pinjaman, dan pembayaran pinjaman.

Cara memakai:

1. Klik aktivasi notifikasi jika browser meminta izin.
2. Buka ikon lonceng untuk melihat notification center.
3. Tandai notifikasi sebagai terbaca atau hapus jika diperlukan.

## 13. Offline Queue

Aplikasi menyimpan beberapa aksi ketika koneksi bermasalah.

Fitur offline:

- Draft update pekerjaan tersimpan di IndexedDB.
- Upload foto yang gagal dapat masuk queue lokal.
- Status sinkronisasi tampil melalui komponen offline sync.
- Saat logout, aplikasi memberi pilihan untuk menghapus draft offline.

Cara memakai:

1. Lanjutkan input pekerjaan meski koneksi tidak stabil.
2. Perhatikan indikator offline/sync.
3. Saat online kembali, biarkan aplikasi melakukan sinkronisasi.
4. Jika ada item gagal, coba ulang setelah koneksi stabil.

## 14. PWA dan Android

OneTrack memiliki manifest PWA, service worker, icon aplikasi, dan project Android Capacitor.

Penggunaan:

- Di browser mobile, install aplikasi melalui opsi install/add to home screen jika tersedia.
- Untuk Android native, gunakan project `android/` dan konfigurasi Capacitor.

## 15. Alur Kerja Rekomendasi

### Alur Customer

1. Login sebagai customer.
2. Buat request dari menu `Request`.
3. Pantau status di `My Service`.
4. Buka detail untuk melihat teknisi, foto, dan progres.
5. Export Excel jika membutuhkan laporan pekerjaan.

### Alur Technician

1. Login sebagai technician.
2. Absen masuk.
3. Cek pekerjaan dari dashboard atau menu `Pekerjaan`.
4. Ambil atau kerjakan job sesuai assignment.
5. Update checklist dan upload foto progres.
6. Upload foto after saat pekerjaan selesai.
7. Ajukan lembur, reimburse, pinjaman, atau accommodation jika diperlukan.
8. Absen pulang.

### Alur Admin

1. Login sebagai admin.
2. Pantau dashboard dan payment request pending.
3. Kelola master data customer, project, user, scope, dan referensi AC.
4. Buat job baru atau tindak lanjuti request customer.
5. Pantau absensi dan koreksi jam jika diperlukan.
6. Review lembur, reimburse, pinjaman, dan accommodation.
7. Export laporan dari modul yang dibutuhkan.

### Alur Management

1. Login sebagai management.
2. Pantau dashboard operasional.
3. Review pekerjaan dan absensi.
4. Approve/reject pengajuan accommodation, lembur, reimburse, dan pinjaman.
5. Unduh laporan untuk monitoring.

## 16. Catatan Operasional

- Jika field detail pekerjaan tidak muncul, cek scope project di Master Data Project.
- Jika checklist tidak muncul, cek konfigurasi checklist di Master Data Scope Pekerjaan.
- Jika technician external tidak melihat data customer, cek assignment customer pada user technician tersebut.
- Jika notifikasi tidak muncul, cek izin browser, VAPID public key, service worker, dan Edge Function notifikasi.
- Jika export Excel gagal saat development, restart Vite lalu coba lagi.
- Jika fitur admin user gagal, pastikan Edge Function `admin-create-user`, `admin-update-user-password`, dan `admin-delete-user` sudah di-deploy.
- Jika data baru tidak langsung muncul, refresh halaman atau pastikan realtime Supabase aktif.
