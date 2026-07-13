module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method tidak diizinkan' });

  const address = String(req.query.address || '').trim();
  if (!address) return res.status(400).json({ error: 'Alamat wajib diisi' });
  if (address.length > 300) return res.status(400).json({ error: 'Alamat terlalu panjang' });

  const query = `${address}, Bali, Indonesia`;
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'id');
  url.searchParams.set('q', query);

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'id',
        'User-Agent': 'PetaKendaraanService/1.0 (Vercel web app)'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Layanan alamat gagal (${response.status})` });
    }

    const data = await response.json();
    if (!Array.isArray(data) || !data[0]) return res.status(200).json({ found: false });

    return res.status(200).json({
      found: true,
      lat: Number(data[0].lat),
      lng: Number(data[0].lon),
      displayName: data[0].display_name || ''
    });
  } catch (error) {
    return res.status(500).json({ error: 'Tidak dapat terhubung ke layanan alamat' });
  }
};
