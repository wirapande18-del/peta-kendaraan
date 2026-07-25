PETA KENDARAAN V14.8 - PERBAIKAN SINKRONISASI SUPABASE

Perbaikan utama:
1. Memperbaiki fungsi freshDirty yang sebelumnya memanggil dirinya sendiri tanpa henti.
2. Mencegah error JavaScript: too much recursion.
3. Menambahkan pengaman agar proses awal sinkronisasi tidak berjalan ganda.
4. Memperbarui versi dan cache-busting file menjadi V14.8.

Cara pasang:
- Upload seluruh isi ZIP ini ke repository GitHub yang digunakan Vercel.
- Commit perubahan.
- Tunggu deployment selesai.
- Buka aplikasi lalu tekan Ctrl+Shift+R satu kali.

Data dan fitur lama tidak dihapus. Struktur tabel Supabase tetap sama.
