PETA KENDARAAN SERVICE — VERSI 14.0 SUPABASE ONLINE
====================================================

FUNGSI BARU
- Data kendaraan, titik peta, status follow up, antrean cek WA, dan template tersimpan online.
- Data tetap disimpan di IndexedDB sebagai cadangan saat internet terputus.
- Sinkronisasi hanya mengirim baris yang berubah agar tetap cepat untuk 7.000+ data.
- Data online dimuat bertahap maksimal 1.000 baris per permintaan.
- Login wajib. Secret key/service_role tidak digunakan.

SETUP PERTAMA (WAJIB)
1. Buka project Supabase.
2. Buka SQL Editor > New query.
3. Buka file SETUP-SUPABASE-V14.sql dari paket ini.
4. Salin seluruh isinya, tempel ke SQL Editor, lalu klik Run.
5. Buka Authentication > Users > Add user.
6. Masukkan email dan password untuk akun yang akan menggunakan aplikasi.
7. Upload seluruh isi paket V14 ke repository GitHub dan tunggu Vercel berstatus Ready.
8. Buka aplikasi, login memakai akun yang dibuat pada langkah 6.

MIGRASI DATA LAMA
- Buka V14 pertama kali dari perangkat/browser yang masih menyimpan data V13.8.
- Setelah login, jika database online masih kosong, aplikasi otomatis mengunggah data lokal.
- Jangan membuka pertama kali dari perangkat kosong sebelum migrasi perangkat lama selesai.
- Tunggu indikator kanan atas berubah menjadi "Tersimpan online".
- Sesudah itu aplikasi dapat dibuka dari perangkat lain menggunakan akun yang sama.

CATATAN KEAMANAN
- File hanya berisi Project URL dan Publishable key.
- Jangan memasukkan Database Password, Secret key, atau service_role ke GitHub.
- Row Level Security membatasi akses hanya untuk pengguna yang login.
