PETA KENDARAAN SERVICE V13.1 - OPTIMASI 7.000+ DATA

PERUBAHAN UTAMA
1. Data kendaraan, cache alamat, dan follow up disimpan menggunakan IndexedDB.
2. Data lama dari penyimpanan versi sebelumnya dimigrasikan otomatis.
3. Import Excel menggunakan indeks plat/no rangka agar ribuan baris tidak diproses berulang.
4. Daftar kendaraan memakai pagination 50, 100, atau 200 data per halaman.
5. Pencarian diberi debounce agar tidak memfilter ribuan data pada setiap ketikan.
6. Marker hanya dibuat saat halaman Peta dibuka.
7. Ribuan marker dibuat bertahap dan dikelompokkan dengan marker clustering.
8. Proses alamat menyimpan checkpoint setiap 50 data.
9. Proses alamat dapat dihentikan dan dilanjutkan tanpa mengulang data yang selesai.
10. Default proses alamat adalah 250 alamat per sesi agar browser tetap responsif.

HASIL UJI
- Import dan dashboard: 7.500 data berhasil.
- Pagination: 100 data per halaman, 75 halaman.
- Service Advisor dinamis: 18 nama SA berhasil terbaca.
- Marker cluster: 7.500 marker berhasil dimuat bertahap.
- IndexedDB: 7.500 data berhasil disimpan dan dimuat kembali.

CATATAN PROSES ALAMAT
- Pencarian koordinat menggunakan layanan alamat online dan harus mengikuti batas layanan.
- Karena itu 7.000 alamat tidak dapat selesai seketika.
- Aplikasi tetap responsif karena proses dilakukan satu per satu, bertahap, dan tersimpan.
- Pilihan 250 alamat per sesi disarankan. Klik lagi untuk melanjutkan sisa alamat.

DEPLOY
- Upload seluruh isi folder ke repository GitHub yang terhubung ke Vercel.
- Setelah deployment selesai, buka aplikasi dan tekan Ctrl+F5.
