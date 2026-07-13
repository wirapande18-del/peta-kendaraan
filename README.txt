PETA KENDARAAN SERVICE — SIAP VERCEL

CARA DEPLOY PALING MUDAH:
1. Buka https://vercel.com dan login.
2. Pilih Add New > Project.
3. Pilih tab "Import Third-Party" atau gunakan Vercel CLI.
4. Upload folder ini ke GitHub, lalu pilih repository tersebut di Vercel.
5. Framework Preset: Other.
6. Build Command: kosongkan.
7. Output Directory: kosongkan.
8. Klik Deploy.

Alternatif lewat komputer:
1. Install Node.js.
2. Buka terminal di folder ini.
3. Jalankan: npm install -g vercel
4. Jalankan: vercel
5. Jawab pertanyaan dengan Enter/default, lalu jalankan: vercel --prod

CATATAN:
- Tidak memerlukan Google Maps API key atau kartu kredit.
- Peta menggunakan OpenStreetMap.
- Pencarian koordinat alamat melewati fungsi server Vercel /api/geocode agar lebih stabil.
- Data kendaraan tersimpan di browser masing-masing (localStorage). Data di HP dan laptop belum otomatis sama.
- Upload Excel/CSV/TSV dapat dilakukan berkali-kali; plat yang sama diabaikan.
