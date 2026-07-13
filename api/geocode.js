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
    .replace(/\s*-\s*-+/g, ' ')
    .replace(/[;|/]/g, ',')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/,+/g, ',')
    .trim();
}

function buildQueries(address) {
  const c = cleanAddress(address).replace(/,?\s*BALI\s*,?\s*INDONESIA$/i, '').trim();
  const parts = c.split(',').map(x => x.trim()).filter(Boolean);
  const noHouse = c.replace(/\b(NO|NOMOR)\.?\s*\d+[A-Z]?\b/gi, '').replace(/\s+/g, ' ').trim();
  const withoutLocalPrefix = c.replace(/\b(BANJAR|DUSUN|LINGKUNGAN|LINK)\s+(DINAS\s+)?/gi, '').trim();
  const tail3 = parts.slice(-3).join(', ');
  const tail2 = parts.slice(-2).join(', ');
  return [...new Set([
    `${c}, Bali, Indonesia`,
    `${noHouse}, Bali, Indonesia`,
    `${withoutLocalPrefix}, Bali, Indonesia`,
    tail3 ? `${tail3}, Bali, Indonesia` : '',
    tail2 ? `${tail2}, Bali, Indonesia` : '',
    `${c}, Indonesia`
  ].filter(Boolean))];
}

async function searchNominatim(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'id');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('viewbox', '114.4,-8.0,115.8,-8.9');
  url.searchParams.set('bounded', '0');
  url.searchParams.set('q', query);
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'id',
      'User-Agent': 'PetaKendaraanService/3.0 (contact: app-owner)'
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
  if (original.length > 350) return res.status(400).json({ error: 'Alamat terlalu panjang' });
  const cleaned = cleanAddress(original);
  const attempts = buildQueries(cleaned);
  try {
    for (const query of attempts) {
      const hit = await searchNominatim(query);
      if (hit) return res.status(200).json({found:true,lat:Number(hit.lat),lng:Number(hit.lon),displayName:hit.display_name||'',cleanedAddress:cleaned,queryUsed:query});
    }
    return res.status(200).json({found:false,cleanedAddress:cleaned,attempts});
  } catch (error) {
    return res.status(503).json({ error: error.message || 'Tidak dapat terhubung ke layanan alamat' });
  }
};
