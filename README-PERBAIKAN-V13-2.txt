PETA KENDARAAN SERVICE V13.2
VALIDASI WILAYAH & PEMULIHAN FOLLOW UP

PERBAIKAN TITIK PETA
1. Peguyangan, Peguyangan Kangin, Antasura, Tonja, dan Ubung dikenali sebagai Denpasar Utara.
2. Wilayah Denpasar Selatan, Timur, Barat, dan Utara ditambahkan ke geocoding.
3. Hasil geocoding diperiksa terhadap kabupaten/kota yang terdeteksi dari alamat.
4. Hasil Singaraja/Buleleng ditolak jika alamat terdeteksi Denpasar.
5. Hasil yang menyebut kabupaten berbeda ditolak meskipun koordinatnya berdekatan.
6. Titik lama yang jelas berada di luar wilayah alamat dihapus otomatis.
7. Data yang titiknya dihapus diberi status "perlu diproses ulang".
8. Permintaan geocoding memakai versi cache baru agar hasil salah lama tidak digunakan.

PERBAIKAN STATUS FOLLOW UP
1. Nomor rangka menjadi identitas utama jika tersedia.
2. Nomor polisi menjadi identitas cadangan.
3. Data lama dapat dicocokkan melalui plat serta nama customer + model yang unik.
4. Saat plat berubah pada upload Excel, status follow up lama dipindahkan ke nomor rangka.
5. Dashboard, grafik, popup, riwayat, dan download memakai identitas baru yang sama.

HASIL UJI
- Alamat Antasura/Peguyangan terdeteksi: Denpasar Utara, Denpasar.
- Koordinat contoh Singaraja ditolak.
- Koordinat contoh Peguyangan diterima.
- Titik lama Singaraja dihapus otomatis.
- Status follow up lama tetap terbaca setelah plat berubah.
- Import 7.500 data berhasil.
- 7.500 marker cluster berhasil ditampilkan bertahap.

SETELAH DEPLOY
1. Gunakan repository dan domain Vercel yang sama.
2. Tekan Ctrl+F5 setelah deployment selesai.
3. Aplikasi akan memeriksa titik lama secara otomatis.
4. Jika muncul pesan titik lama dihapus, buka Data & Upload lalu klik Proses alamat.
5. Gunakan 250 alamat per sesi agar aplikasi tetap responsif.
