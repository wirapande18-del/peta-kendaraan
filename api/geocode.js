const REGENCIES = {
  DENPASAR: 'Denpasar', GIANYAR: 'Gianyar', BADUNG: 'Badung', TABANAN: 'Tabanan',
  JEMBRANA: 'Jembrana', BULELENG: 'Buleleng', BANGLI: 'Bangli', KLUNGKUNG: 'Klungkung', KARANGASEM: 'Karangasem'
};

const DISTRICT_TO_REGENCY = {
  // Gianyar
  SUKAWATI:'Gianyar', BLAHBATUH:'Gianyar', GIANYAR:'Gianyar', UBUD:'Gianyar',
  TEGALLALANG:'Gianyar', TAMPAKSIRING:'Gianyar', PAYANGAN:'Gianyar',
  // Bangli
  BANGLI:'Bangli', SUSUT:'Bangli', TEMBUKU:'Bangli', KINTAMANI:'Bangli',
  // Karangasem
  KARANGASEM:'Karangasem', ABANG:'Karangasem', BEBANDEM:'Karangasem', RENDANG:'Karangasem',
  SELAT:'Karangasem', SIDEMEN:'Karangasem', MANGGIS:'Karangasem', KUBU:'Karangasem',
  // Klungkung
  KLUNGKUNG:'Klungkung', BANJARANGKAN:'Klungkung', DAWAN:'Klungkung', NUSA_PENIDA:'Klungkung',
  // Badung
  KUTA:'Badung', KUTA_SELATAN:'Badung', KUTA_UTARA:'Badung', MENGWI:'Badung',
  ABIANSEMAL:'Badung', PETANG:'Badung',
  // Tabanan
  TABANAN:'Tabanan', KEDIRI:'Tabanan', MARGA:'Tabanan', BATURITI:'Tabanan', PENEBEL:'Tabanan',
  KERAMBITAN:'Tabanan', SELEMADEG:'Tabanan', PUPUAN:'Tabanan',
  // Jembrana
  NEGARA:'Jembrana', MELAYA:'Jembrana', MENDOYO:'Jembrana', PEKUTATAN:'Jembrana', JEMBRANA:'Jembrana',
  // Buleleng
  BULELENG:'Buleleng', GEROKGAK:'Buleleng', SERIRIT:'Buleleng', BUSUNGBIU:'Buleleng',
  BANJAR:'Buleleng', SUKASADA:'Buleleng', SAWAN:'Buleleng', KUBUTAMBAHAN:'Buleleng', TEJAKULA:'Buleleng',
  // Kota Denpasar
  DENPASAR_SELATAN:'Denpasar', DENPASAR_TIMUR:'Denpasar', DENPASAR_BARAT:'Denpasar', DENPASAR_UTARA:'Denpasar'
};

const PLACE_HINTS = {
  BATUBULAN:['Sukawati','Gianyar'], BURUAN:['Blahbatuh','Gianyar'], BEDULU:['Blahbatuh','Gianyar'],
  KERAMAS:['Blahbatuh','Gianyar'], MEDAHAN:['Blahbatuh','Gianyar'], SABA:['Blahbatuh','Gianyar'],
  PEJENG:['Tampaksiring','Gianyar'], MANUKAYA:['Tampaksiring','Gianyar'], SINGAPADU:['Sukawati','Gianyar'],
  CELUK:['Sukawati','Gianyar'], GUWANG:['Sukawati','Gianyar'], MAS:['Ubud','Gianyar'],
  KUTRI:['Blahbatuh','Gianyar'], PELIATAN:['Ubud','Gianyar'],
  PERING_SARI:['Selat','Karangasem'], YANGAPI:['Tembuku','Bangli'], PENINJOAN:['Tembuku','Bangli'],
  PENGOTAN:['Bangli','Bangli'], KUBUTAMBAHAN:['Kubutambahan','Buleleng'],
  PEGUYANGAN_KANGIN:['Denpasar Utara','Denpasar'], PEGUYANGAN:['Denpasar Utara','Denpasar'],
  ANTASURA:['Denpasar Utara','Denpasar'], TONJA:['Denpasar Utara','Denpasar'], UBUNG:['Denpasar Utara','Denpasar'],
  KESIMAN:['Denpasar Timur','Denpasar'], PENATIH:['Denpasar Timur','Denpasar'],
  SANUR:['Denpasar Selatan','Denpasar'], SESETAN:['Denpasar Selatan','Denpasar'],
  PEMECUTAN:['Denpasar Barat','Denpasar'], PADANGSAMBIAN:['Denpasar Barat','Denpasar']
};

const AREA_BOUNDS = {
  DENPASAR:[-8.80,-8.50,115.05,115.34], GIANYAR:[-8.76,-8.05,115.15,115.58],
  BADUNG:[-8.92,-8.05,114.95,115.33], TABANAN:[-8.88,-8.05,114.70,115.27],
  JEMBRANA:[-8.68,-8.00,114.35,114.98], BULELENG:[-8.45,-7.95,114.35,115.55],
  BANGLI:[-8.62,-8.02,115.16,115.58], KLUNGKUNG:[-8.92,-8.30,115.25,115.75],
  KARANGASEM:[-8.68,-8.00,115.35,115.78]
};

function cleanAddress(input) {
  return String(input || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\bJLN?\.?\b/g, 'JALAN')
    .replace(/\bBR\.?\b/g, 'BANJAR')
    .replace(/\bDSN\.?\b/g, 'DUSUN')
    .replace(/\bDS\.?\b/g, 'DESA')
    .replace(/\bLINK\.?\b|\bLINGK\.?\b/g, 'LINGKUNGAN')
    .replace(/\bKEL\.?\b/g, 'KELURAHAN')
    .replace(/\bKEC\.?\b/g, 'KECAMATAN')
    .replace(/\bKAB\.?\b/g, 'KABUPATEN')
    .replace(/\bDPS\b/g, 'DENPASAR')
    .replace(/\bGYR\b/g, 'GIANYAR')
    .replace(/\bBLAH\s+BATUH\b/g, 'BLAHBATUH')
    .replace(/\bTEGAL+ALANG\b|\bTEGALLANG\b/g, 'TEGALLALANG')
    .replace(/\bTAMPAK\s*SIRING\b/g, 'TAMPAKSIRING')
    .replace(/\bKARANG\s+ASEM\b/g, 'KARANGASEM')
    .replace(/\bPERING\s*SARI\b/g, 'PERING SARI')
    .replace(/[;|/]+/g, ',')
    .replace(/\s*[-–—]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/,+/g, ',')
    .replace(/^,|,$/g, '')
    .trim();
}

function titleCase(s) {
  return s.toLowerCase().replace(/(^|[\s,])([a-z])/g, (_, p, c) => p + c.toUpperCase());
}

function inferArea(cleaned) {
  const tokenText = cleaned.replace(/[^A-Z0-9 ]/g, ' ');
  let regency = '';
  for (const [key, value] of Object.entries(REGENCIES)) {
    if (new RegExp(`\\b${key}\\b`).test(tokenText)) { regency = value; break; }
  }
  let district = '';
  for (const [key, value] of Object.entries(DISTRICT_TO_REGENCY)) {
    const phrase = key.replace(/_/g, ' ');
    if (new RegExp(`\\b${phrase}\\b`).test(tokenText)) {
      district = titleCase(phrase);
      if (!regency) regency = value;
      break;
    }
  }
  let placeHint = null;
  for (const [key, value] of Object.entries(PLACE_HINTS)) {
    const phrase = key.replace(/_/g, ' ');
    if (new RegExp(`\\b${phrase}\\b`).test(tokenText)) { placeHint = value; break; }
  }
  if (placeHint) {
    // Nama desa/kelurahan lebih spesifik daripada kecamatan yang mungkin salah di data Excel.
    district = placeHint[0];
    if (!regency) regency = placeHint[1];
  }
  return { district, regency };
}

function stripPrefixes(s) {
  return s.replace(/\b(BANJAR|DUSUN|LINGKUNGAN|DESA|KELURAHAN|KECAMATAN|KABUPATEN|DINAS)\b/gi, ' ')
    .replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim();
}

function buildQueries(address) {
  const cleaned = cleanAddress(address)
    .replace(/(?:,?\s*)BALI(?:,?\s*INDONESIA)?$/i, '')
    .replace(/(?:,?\s*)INDONESIA$/i, '').trim();
  const { district, regency } = inferArea(cleaned);
  const parts = cleaned.split(',').map(x => x.trim()).filter(Boolean);
  const withoutHouse = cleaned
    .replace(/\b(NO|NOMOR)\.?\s*\d+[A-Z]?(?:\s*BLOK\s*[A-Z0-9.-]+)?\b/gi, '')
    .replace(/\bBLOK\s*[A-Z0-9.-]+\b/gi, '')
    .replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim();
  const simple = stripPrefixes(withoutHouse);
  const first = parts[0] || '';
  const firstSimple = stripPrefixes(first);
  const tail = parts.slice(-3).join(', ');
  const area = [district, regency, 'Bali', 'Indonesia'].filter(Boolean).join(', ');
  const queries = [
    [withoutHouse, regency && !withoutHouse.includes(regency.toUpperCase()) ? regency : '', 'Bali, Indonesia'].filter(Boolean).join(', '),
    [simple, regency && !simple.includes(regency.toUpperCase()) ? regency : '', 'Bali, Indonesia'].filter(Boolean).join(', '),
    [firstSimple, area].filter(Boolean).join(', '),
    [tail, regency && !tail.toUpperCase().includes(String(regency).toUpperCase()) ? regency : '', 'Bali, Indonesia'].filter(Boolean).join(', '),
    area
  ];
  return [...new Set(queries.map(q => q.replace(/,\s*,/g, ',').trim()).filter(q => q.length > 8))];
}

function hitText(hit) {
  return [hit.display_name,...Object.values(hit.address||{})].join(' ').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
}

function hitMatchesArea(hit, expected={}) {
  const lat=Number(hit.lat),lon=Number(hit.lon),regency=String(expected.regency||'').toUpperCase();
  if (!(lat >= -8.95 && lat <= -8.0 && lon >= 114.35 && lon <= 115.78)) return false;
  if (!regency) return true;
  const bounds=AREA_BOUNDS[regency];
  if(bounds&&!(lat>=bounds[0]&&lat<=bounds[1]&&lon>=bounds[2]&&lon<=bounds[3]))return false;
  const text=hitText(hit);
  const conflicting=Object.keys(AREA_BOUNDS).find(name=>name!==regency&&text.includes(name));if(conflicting)return false;
  if(text.includes(regency))return true;
  // Beberapa hasil OSM tidak menulis kabupaten, tetapi koordinat di dalam batas yang diketahui tetap aman.
  return Boolean(bounds);
}

function hitScore(hit,expected={}) {
  const text=hitText(hit),district=String(expected.district||'').toUpperCase(),regency=String(expected.regency||'').toUpperCase();
  let score=0;if(regency&&text.includes(regency))score+=5;if(district&&text.includes(district))score+=4;
  if(hit.address?.road||hit.address?.pedestrian)score+=3;if(hit.address?.house_number)score+=2;
  if(['house','building','residential','road'].includes(hit.type))score+=2;return score;
}

async function searchNominatim(query, expected) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '5');
  url.searchParams.set('countrycodes', 'id');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('viewbox', '114.35,-8.00,115.75,-8.95');
  url.searchParams.set('bounded', '1');
  url.searchParams.set('q', query);
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'id,en;q=0.8',
      'User-Agent': 'PetaKendaraanService/4.0 (Vercel application)'
    }
  });
  if (!response.ok) throw new Error(`Layanan alamat sedang sibuk (${response.status})`);
  const data = await response.json();
  if (!Array.isArray(data) || !data.length) return null;
  return data.filter(x=>hitMatchesArea(x,expected)).sort((a,b)=>hitScore(b,expected)-hitScore(a,expected))[0]||null;
}

async function searchNominatimMany(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '8');
  url.searchParams.set('countrycodes', 'id');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('viewbox', '114.35,-8.00,115.78,-8.95');
  url.searchParams.set('bounded', '1');
  url.searchParams.set('q', /\b(BALI|INDONESIA)\b/i.test(query) ? query : `${query}, Bali, Indonesia`);
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'id,en;q=0.8',
      'User-Agent': 'PetaKendaraanService/4.1 (Vercel application)'
    }
  });
  if (!response.ok) throw new Error(`Layanan pencarian sedang sibuk (${response.status})`);
  const data = await response.json();
  if (!Array.isArray(data)) return [];
  return data.filter(hit => hitMatchesArea(hit, {})).slice(0, 8).map(hit => ({
    lat: Number(hit.lat), lng: Number(hit.lon), displayName: hit.display_name || '',
    type: hit.type || '', category: hit.category || ''
  }));
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method tidak diizinkan' });
  const original = String(req.query.address || '').trim();
  if (!original) return res.status(400).json({ error: 'Alamat wajib diisi' });
  if (String(req.query.mode || '') === 'search') {
    try {
      const results = await searchNominatimMany(original);
      return res.status(200).json({ found: results.length > 0, results });
    } catch (error) {
      return res.status(503).json({ error: error.message || 'Pencarian lokasi gagal', retryable: true });
    }
  }
  const attempt = Math.max(0, Math.min(4, Number(req.query.attempt || 0)));
  const cleaned = cleanAddress(original);
  const expected = inferArea(cleaned);
  const queries = buildQueries(cleaned);
  const query = queries[attempt];
  if (!query) return res.status(200).json({ found: false, cleanedAddress: titleCase(cleaned), attempts: queries.length });
  try {
    const hit = await searchNominatim(query,expected);
    if (!hit) return res.status(200).json({ found: false, cleanedAddress: titleCase(cleaned), queryUsed: query, attempt, attempts: queries.length });
    const precision = attempt <= 1 ? 'alamat' : attempt <= 3 ? 'wilayah' : 'kabupaten';
    return res.status(200).json({
      found: true, lat: Number(hit.lat), lng: Number(hit.lon), displayName: hit.display_name || '',
      cleanedAddress: titleCase(cleaned), queryUsed: query, attempt, attempts: queries.length, precision,
      expectedRegency: expected.regency||'', expectedDistrict: expected.district||''
    });
  } catch (error) {
    return res.status(503).json({ error: error.message || 'Tidak dapat terhubung ke layanan alamat', retryable: true });
  }
};

module.exports._test={cleanAddress,inferArea,buildQueries,hitMatchesArea,hitScore};
