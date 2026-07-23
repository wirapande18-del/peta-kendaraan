PETA KENDARAAN SERVICE — VERSI 14.0 SUPABASE ONLINE

VERSI INI MENAMBAHKAN
- Login pengguna.
- Penyimpanan Supabase agar data yang sama dapat dibuka dari HP dan laptop.
- Sinkronisasi kendaraan, koordinat peta, follow up, antrean cek WA, dan template.
- IndexedDB tetap digunakan sebagai cadangan offline dan untuk menjaga kecepatan.
- Pengiriman perubahan per baris agar tetap ringan untuk 7.000+ kendaraan.

SEBELUM DEPLOY
1. Ikuti README-SUPABASE-V14.txt.
2. Jalankan SETUP-SUPABASE-V14.sql di SQL Editor Supabase.
3. Buat akun pengguna di Authentication > Users.

CARA UPLOAD KE GITHUB
1. Extract ZIP versi 14.0.
2. Upload seluruh ISI folder ke bagian paling luar repository GitHub.
3. Pastikan index.html, app.js, cloud-sync.js, supabase-config.js, style.css,
   package.json, vercel.json, dan folder api terlihat langsung.
4. Commit changes.
5. Tunggu Vercel berstatus Ready.
6. Buka aplikasi dan pastikan tertulis Versi 14.0.

MIGRASI DATA LAMA
Buka V14 pertama kali pada browser/perangkat yang masih menyimpan data V13.8.
Setelah login, database yang masih kosong akan otomatis diisi dari penyimpanan
lokal. Tunggu indikator berubah menjadi "Tersimpan online" sebelum membuka
aplikasi dari perangkat lain.
