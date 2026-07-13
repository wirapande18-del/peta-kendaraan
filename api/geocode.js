function cleanAddress(input) {
  return String(input || '')
    .toUpperCase()
    .replace(/\bJL\.?\b/g, 'JALAN')
    .replace(/\bJLN\.?\b/g, 'JALAN')
    .replace(/\bBR\.?\b/g, 'BANJAR')
    .replace(/\bDS\.?\b/g, 'DESA')
    .replace(/\bKEL\.?\b/g, 'KELURAHAN')
    .replace(/\bKEC\.?\b/g, 'KECAMATAN')
    .replace(/\bKAB\.?\b/g, 'KABUPATEN')
    .replace(/\bDPS\b/g, 'DENPASAR')
    .replace(/\bGYR\b/g, 'GIANYAR')
    .replace(/[;|]/g, ',')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim();
}

async function searchNominatim(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'id');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('q', query);
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'id',
      'User-Agent': 'PetaKendaraanService/2.0 (Vercel web app)'
    }
  });
  if (!response.ok) throw new Error(`Layanan alamat gagal (${response.status})`);
  const data = await response.json();
  return Array.isArray(data) ? data[0] : null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method tidak diizinkan' });

  const original = String(req.query.address || '').trim();
  if (!original) return res.status(400).json({ error: 'Alamat wajib diisi' });
  if (original.length > 300) return res.status(400).json({ error: 'Alamat terlalu panjang' });

  const cleaned = cleanAddress(original);
  const attempts = [
    `${cleaned}, Bali, Indonesia`,
    cleaned,
    `${cleaned}, Indonesia`
  ];

  try {
    for (const query of [...new Set(attempts)]) {
      const hit = await searchNominatim(query);
      if (hit) {
        return res.status(200).json({
          found: true,
          lat: Number(hit.lat),
          lng: Number(hit.lon),
          displayName: hit.display_name || '',
          cleanedAddress: cleaned,
          queryUsed: query
        });
      }
    }
    return res.status(200).json({ found: false, cleanedAddress: cleaned });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Tidak dapat terhubung ke layanan alamat' });
  }
};
