module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Gunakan metode POST.' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI belum diaktifkan. Tambahkan OPENAI_API_KEY di Environment Variables Vercel.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const task = String(body.task || 'generate').slice(0, 20);
    const prompt = String(body.prompt || '').trim().slice(0, 2000);
    const currentMessage = String(body.currentMessage || '').trim().slice(0, 5000);
    const category = String(body.category || 'LAINNYA').slice(0, 50);
    const tone = String(body.tone || 'sopan-profesional').slice(0, 50);
    const length = String(body.length || 'sedang').slice(0, 30);

    if (task === 'generate' && !prompt) return res.status(400).json({ error: 'Perintah untuk AI masih kosong.' });
    if (task === 'improve' && !currentMessage) return res.status(400).json({ error: 'Isi pesan yang akan dirapikan masih kosong.' });

    const userInput = task === 'improve'
      ? `Rapikan pesan WhatsApp berikut tanpa mengubah maksudnya:\n\n${currentMessage}`
      : `Buat pesan WhatsApp berdasarkan permintaan berikut:\n\n${prompt}`;

    const instructions = `Anda adalah asisten customer service bengkel Toyota di Indonesia. Tulis hanya isi pesan WhatsApp, tanpa judul, tanpa penjelasan, dan tanpa tanda kutip. Kategori: ${category}. Gaya: ${tone}. Panjang: ${length}. Gunakan Bahasa Indonesia yang alami, sopan, tidak berlebihan, dan memiliki ajakan booking yang jelas bila sesuai. Pertahankan atau gunakan variabel yang relevan dari daftar ini: {nama}, {plat}, {model}, {tahun}, {km}, {sa}, {alamat}, {telepon}, {no_rangka}, {service_terakhir}, {jatuh_tempo}, {repair_type}, {kabupaten}, {kecamatan}, {dealer}, {tanggal}. Jangan mengarang harga, diskon, tanggal promo, atau manfaat yang tidak diberikan pengguna. Jangan gunakan markdown.`;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5-mini',
        instructions,
        input: userInput,
        max_output_tokens: 700
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || 'Layanan AI gagal merespons.' });
    const message = (data.output || []).flatMap(item => item.content || []).filter(c => c.type === 'output_text').map(c => c.text).join('\n').trim();
    if (!message) return res.status(502).json({ error: 'AI tidak menghasilkan pesan. Silakan coba lagi.' });
    return res.status(200).json({ message });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Terjadi kesalahan pada AI.' });
  }
};
