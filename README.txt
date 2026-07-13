PETA KENDARAAN SERVICE — VERSI 4

PERBAIKAN UTAMA
- Pencarian alamat Bali dilakukan bertahap, tetapi hanya satu permintaan OpenStreetMap setiap ±1 detik agar tidak diblokir.
- Singkatan BR, JL, DSN, LINK, KEC, KAB diperbaiki otomatis.
- Kecamatan Bali digunakan untuk menambahkan kabupaten secara otomatis.
- Alamat dicoba dari tingkat alamat, desa/kecamatan, sampai wilayah kabupaten.
- Koordinat yang berhasil disimpan di browser sehingga tidak dicari ulang.
- Data versi 3 di browser otomatis dibaca saat membuka versi 4.
- Alamat yang tetap gagal dapat diperbaiki atau ditentukan manual dengan klik peta.

CARA UPLOAD KE GITHUB
1. Buka repository GitHub aplikasi lama.
2. Hapus file lama atau upload seluruh isi folder ini ke bagian paling luar repository.
3. Pastikan index.html, app.js, style.css, package.json, vercel.json dan folder api terlihat langsung.
4. Commit changes.
5. Vercel akan melakukan deploy otomatis.

CATATAN
Proses 90 alamat dapat memerlukan beberapa menit karena layanan OpenStreetMap gratis mewajibkan permintaan tidak terlalu cepat. Jangan menekan tombol Proses alamat berulang kali. Tunggu sampai status selesai.
