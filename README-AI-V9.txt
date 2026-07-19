PETA KENDARAAN V9 - AI PEMBUAT PESAN

Fitur AI terdapat di menu Kelola Template WhatsApp.
AI dapat membuat pesan baru dan merapikan pesan yang sudah ditulis.

CARA MENGAKTIFKAN AI DI VERCEL:
1. Buka project di Vercel.
2. Masuk ke Settings > Environment Variables.
3. Tambahkan:
   Name  : OPENAI_API_KEY
   Value : API key OpenAI Anda
4. Pilih Production, Preview, dan Development bila diperlukan.
5. Klik Save, kemudian Redeploy project.

Opsional:
Name  : OPENAI_MODEL
Value : gpt-5-mini

PENTING:
- Jangan menulis API key di app.js atau index.html.
- Tanpa OPENAI_API_KEY, semua fitur lama tetap bekerja; hanya tombol AI yang memberi pemberitahuan bahwa AI belum aktif.
- Penggunaan OpenAI API memiliki biaya sesuai pemakaian akun API Anda.
