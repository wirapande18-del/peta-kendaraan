PETA KENDARAAN SERVICE - VERSI 14.7

PERBAIKAN UTAMA
1. Upload memiliki dua mode:
   - Update data lama + tambah data baru.
   - Ganti semua data kendaraan dengan file baru.
2. Mode Ganti Semua menghapus data kendaraan lama yang tidak terdapat di file baru, termasuk dari Supabase setelah sinkron berhasil.
3. Sebelum mengambil ulang data cloud, perubahan lokal yang masih baru disimpan terlebih dahulu agar data lama tidak muncul kembali setelah refresh.
4. Penanda perubahan lokal yang sudah terlalu lama/kedaluwarsa tidak lagi otomatis mengunggah cache lama ke Supabase.
5. Proses upload menunggu sinkronisasi online selesai dan memberikan status yang jelas.
6. Cache file aplikasi dinaikkan ke versi 14.7 agar browser Huawei/Chrome mengambil kode terbaru.

CARA PEMAKAIAN
- Pilih "Update data lama + tambah data baru" untuk upload rutin yang hanya menambah atau melengkapi data.
- Pilih "Ganti semua data kendaraan dengan file ini" bila file Excel merupakan daftar terbaru yang harus menjadi satu-satunya data aktif.
- Setelah status menampilkan "Data online sudah sinkron", refresh halaman untuk memastikan hasil tetap sama.
