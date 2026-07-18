const DATA_KEY='vehicleMapDataV4';
const GEO_KEY='vehicleMapGeocodeCacheV4';
const FOLLOW_UP_KEY='vehicleMapFollowUpV1';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const normalizePlate=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const normalizePhone=p=>{let d=String(p||'').replace(/\D/g,'');if(d.startsWith('0'))d='62'+d.slice(1);return d;};
const normalizeAddress=s=>String(s||'').toUpperCase().replace(/\bJL\.?\b/g,'JALAN').replace(/\bJLN\.?\b/g,'JALAN').replace(/\bBR\.?\b/g,'BANJAR').replace(/\bDS\.?\b/g,'DESA').replace(/\bKEL\.?\b/g,'KELURAHAN').replace(/\bKEC\.?\b/g,'KECAMATAN').replace(/\bKAB\.?\b/g,'KABUPATEN').replace(/\bDPS\b/g,'DENPASAR').replace(/\bGYR\b/g,'GIANYAR').replace(/[;|]/g,',').replace(/\s+/g,' ').replace(/\s*,\s*/g,', ').trim();
const cacheKey=s=>normalizeAddress(s);
const readJSON=(k,f)=>{try{return JSON.parse(localStorage.getItem(k)||'null')??f;}catch{return f;}};
let vehicles=readJSON(DATA_KEY,null)||readJSON('vehicleMapDataV3',null)||[...(window.DEFAULT_VEHICLES||[])];
let followUps=readJSON(FOLLOW_UP_KEY,{}),activeFollowUpVehicle=null,selectedFollowUps=new Set(),batchQueue=[],batchIndex=0;
let geoCache=readJSON(GEO_KEY,null)||readJSON('vehicleMapGeocodeCacheV3',{})||{},filteredVehicles=[],stopRequested=false,markers=[],editingVehicle=null,manualMode=false,manualPreview=null;
const saveData=()=>localStorage.setItem(DATA_KEY,JSON.stringify(vehicles));
const saveGeo=()=>localStorage.setItem(GEO_KEY,JSON.stringify(geoCache));
const saveFollowUps=()=>localStorage.setItem(FOLLOW_UP_KEY,JSON.stringify(followUps));
const followUpKey=v=>normalizePlate(v&&v.POLICE_NO);
const followUpStatusLabel=s=>({BELUM:'Belum Follow Up',SUDAH:'Sudah Follow Up',TERKIRIM:'Sudah Terkirim',BELUM_DIBACA:'Belum Dibaca',DIBACA:'Sudah Dibaca',DIBALAS:'Sudah Dibalas',NOMOR_TIDAK_AKTIF:'Nomor Tidak Aktif',TIDAK_ADA_WHATSAPP:'Tidak Ada WhatsApp',BOOKING:'Booking',TIDAK_TERHUBUNG:'Tidak Terhubung',FOLLOW_UP_ULANG:'Follow Up Ulang',SELESAI:'Selesai'}[s]||s||'Belum Follow Up');
const followUpReasonLabel=s=>({REMINDER_SERVICE:'Reminder service berkala',CUSTOMER_SIBUK:'Customer sedang sibuk',TIDAK_DIANGKAT:'Telepon tidak diangkat',NOMOR_TIDAK_AKTIF:'Nomor tidak aktif',TIDAK_ADA_WHATSAPP:'Nomor tidak ada WhatsApp',SUDAH_SERVICE:'Sudah melakukan service',SERVICE_DI_TEMPAT_LAIN:'Service di tempat lain',KENDARAAN_DIJUAL:'Kendaraan sudah dijual',PINDAH_DOMISILI:'Customer pindah domisili',MENUNGGU_KONFIRMASI:'Menunggu konfirmasi customer',JANJI_SERVICE:'Customer janji datang service',BELUM_BERSEDIA:'Customer belum bersedia service',LAINNYA:'Lainnya'}[s]||s||'-');
const formatFollowUpDate=s=>s?String(s).split('-').reverse().join('/'):'-';
function followUpPopupHtml(v){const f=followUps[followUpKey(v)];if(!f)return '<div class="follow-up-status-box"><b>Status Follow Up:</b> Belum ada data</div>';return `<div class="follow-up-status-box"><b>Status:</b> ${esc(followUpStatusLabel(f.status))}<br><b>Reason:</b> ${esc(followUpReasonLabel(f.reason))}<br><b>Tanggal:</b> ${esc(formatFollowUpDate(f.date))}<br><b>Next:</b> ${esc(formatFollowUpDate(f.nextDate))}</div>`;}


const REGION_RULES=[
  {regency:'Gianyar',district:'Ubud',words:['UBUD','PELIATAN','MAS','LODTUNDUH','SAYAN','CAMPUHAN','PENESTANAN','KEDewATAN'.toUpperCase(),'PETULU']},
  {regency:'Gianyar',district:'Sukawati',words:['SUKAWATI','BATUBULAN','BATU BULAN','CELUK','GUWANG','SINGAPADU','KEMENUH','BATUAN']},
  {regency:'Gianyar',district:'Blahbatuh',words:['BLAHBATUH','BLAH BATUH','BELEGA','BONA','BURUAN','KERAMAS','MEDAHAN','SABA']},
  {regency:'Gianyar',district:'Gianyar',words:['GIANYAR','ABIANBASE','BENG','BITERA','SAMPLANGAN','SERONGGA','SIANGAN','TULIKUP']},
  {regency:'Gianyar',district:'Tegallalang',words:['TEGALLALANG','TEGALALANG','KELIKI','SEBATU','KENDERAN','TARO']},
  {regency:'Gianyar',district:'Tampaksiring',words:['TAMPAKSIRING','MANUKAYA','PEJENG','SANDING']},
  {regency:'Gianyar',district:'Payangan',words:['PAYANGAN','BUAHAN','BUAHAN KAJA','KERTA','MELINGGIH','PUHU']},
  {regency:'Badung',district:'Mengwi',words:['MENGWI','KAPAL','SEMPIDI','TUMBAK BAYUH','CEMAGI']},
  {regency:'Badung',district:'Abiansemal',words:['ABIANSEMAL','BLahkiuh'.toUpperCase(),'MAMBAL','SANGEH','SIBANG']},
  {regency:'Badung',district:'Kuta',words:['KUTA','LEGIAN','SEMINYAK','TUBAN']},
  {regency:'Badung',district:'Kuta Utara',words:['KUTA UTARA','CANGGU','KEROBOKAN','DALUNG','TIBUBENENG']},
  {regency:'Badung',district:'Kuta Selatan',words:['KUTA SELATAN','JIMBARAN','NUSA DUA','PECATU','UNGASAN']},
  {regency:'Denpasar',district:'Denpasar Selatan',words:['DENPASAR SELATAN','SANUR','SESETAN','PEDUNGAN','RENON']},
  {regency:'Denpasar',district:'Denpasar Timur',words:['DENPASAR TIMUR','KESIMAN','PENATIH']},
  {regency:'Denpasar',district:'Denpasar Barat',words:['DENPASAR BARAT','PEMECUTAN','PADANGSAMBIAN']},
  {regency:'Denpasar',district:'Denpasar Utara',words:['DENPASAR UTARA','PEGUYANGAN','TONJA','UBUNG']},
  {regency:'Tabanan',district:'Tabanan',words:['TABANAN']},
  {regency:'Jembrana',district:'Negara',words:['NEGARA','JEMBRANA']},
  {regency:'Buleleng',district:'Buleleng',words:['SINGARAJA','BULELENG']},
  {regency:'Karangasem',district:'Karangasem',words:['AMLAPURA','KARANGASEM']},
  {regency:'Klungkung',district:'Klungkung',words:['SEMARAPURA','KLUNGKUNG']},
  {regency:'Bangli',district:'Bangli',words:['BANGLI']}
];
function inferRegion(v){
  const explicitRegency=String(v.REGENCY||v.KABUPATEN||v.KABUPATEN_KOTA||'').trim();
  const explicitDistrict=String(v.DISTRICT||v.KECAMATAN||'').trim();
  if(explicitRegency||explicitDistrict)return{regency:explicitRegency||'Belum diketahui',district:explicitDistrict||'Belum diketahui',source:'data'};
  const hay=normalizeAddress([v.ADDRESS,v.GEOCODED_ADDRESS,v.CLEANED_ADDRESS].filter(Boolean).join(' '));
  const found=REGION_RULES.find(r=>r.words.some(w=>hay.includes(w)));
  if(found)return{regency:found.regency,district:found.district,source:'alamat'};
  return{regency:'Belum diketahui',district:'Belum diketahui',source:'unknown'};
}
function enrichRegions(){vehicles.forEach(v=>{const r=inferRegion(v);v._regency=r.regency;v._district=r.district;v._regionSource=r.source;});}
function buildRegionFilters(){
  enrichRegions();
  const reg=$('regencyFilter'),dist=$('districtFilter'); if(!reg||!dist)return;
  const currentReg=reg.value,currentDist=dist.value;
  const regencies=[...new Set(vehicles.map(v=>v._regency).filter(Boolean))].sort();
  reg.innerHTML='<option value="">Semua Kabupaten/Kota</option>'+regencies.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  reg.value=regencies.includes(currentReg)?currentReg:'';
  const districts=[...new Set(vehicles.filter(v=>!reg.value||v._regency===reg.value).map(v=>v._district).filter(Boolean))].sort();
  dist.innerHTML='<option value="">Semua Kecamatan</option>'+districts.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  dist.value=districts.includes(currentDist)?currentDist:'';
}
function currentFollowUpStatus(v){return followUps[followUpKey(v)]?.status||'BELUM';}
function updateSelectionUi(){
  if($('selectedCount'))$('selectedCount').textContent=`${selectedFollowUps.size} dipilih`;
  if($('filteredCount'))$('filteredCount').textContent=`${filteredVehicles.length} data`;
}
function waMessage(v){const name=v.CUSTOMER||'Bapak/Ibu',plate=v.POLICE_NO||'kendaraan Anda';return `Selamat pagi ${name}. Kami dari Agung Toyota ingin mengingatkan jadwal service berkala kendaraan ${plate}. Apakah kami dapat membantu membuatkan booking service?`}
function markWaOpened(v){
  const key=followUpKey(v),old=followUps[key]||{},today=new Date().toISOString().slice(0,10);
  const rec={...old,plate:v.POLICE_NO||'',customer:v.CUSTOMER||'',model:v.MODEL||'',status:'TERKIRIM',date:today,reason:old.reason||'REMINDER_SERVICE',nextDate:old.nextDate||'',note:old.note||'WhatsApp dibuka dari antrean follow up.',updatedAt:new Date().toISOString()};
  rec.history=[...(old.history||[]),{status:'TERKIRIM',date:today,reason:rec.reason,nextDate:rec.nextDate,note:'WhatsApp dibuka dari antrean follow up.',savedAt:rec.updatedAt}];
  followUps[key]=rec;saveFollowUps();
}
window.openSingleWa=key=>{const v=vehicles.find(x=>followUpKey(x)===key);if(!v)return alert('Data kendaraan tidak ditemukan.');const phone=normalizePhone(v.TELEPHONE_CP);if(!phone)return alert('Nomor WhatsApp belum tersedia.');markWaOpened(v);window.open(`https://wa.me/${phone}?text=${encodeURIComponent(waMessage(v))}`,'_blank','noopener');applyFilter();};
function openNextBatchWa(){
  while(batchIndex<batchQueue.length&&!normalizePhone(batchQueue[batchIndex].TELEPHONE_CP))batchIndex++;
  if(batchIndex>=batchQueue.length){$('status').textContent='Antrean WhatsApp selesai. Silakan perbarui status berdasarkan hasil chat.';batchQueue=[];batchIndex=0;applyFilter();return;}
  const v=batchQueue[batchIndex++],phone=normalizePhone(v.TELEPHONE_CP);markWaOpened(v);
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(waMessage(v))}`,'_blank','noopener');
  $('status').textContent=`WA ${batchIndex}/${batchQueue.length}: ${v.POLICE_NO||'-'} dibuka. Klik “Mulai WA Berurutan” lagi untuk customer berikutnya.`;
  applyFilter();
}

const ADVISOR_COLORS=['#1769e0','#d92d20','#16a34a','#9333ea','#f59e0b','#0891b2','#db2777','#65a30d','#ea580c','#4f46e5','#0f766e','#7c2d12'];
let advisorColorMap={};
const map=L.map('map').setView([-8.4095,115.1889],9);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors',crossOrigin:true}).addTo(map);

function hydrateCoordinates(){vehicles.forEach(v=>{const c=geoCache[cacheKey(v.ADDRESS)];if(c){v.lat=Number(c.lat);v.lng=Number(c.lng);v.geocodeFailed=false;}});}
function updateStats(){const mapped=vehicles.filter(v=>Number.isFinite(v.lat)&&Number.isFinite(v.lng)).length;const failed=vehicles.filter(v=>v.geocodeFailed===true).length;const pending=vehicles.filter(v=>v.ADDRESS&&!Number.isFinite(v.lat)&&v.geocodeFailed!==true).length;$('totalData').textContent=vehicles.length;$('mappedData').textContent=mapped;$('pendingData').textContent=pending;$('failedData').textContent=failed;}
function buildAdvisorFilter(){const current=$('advisorFilter').value;const names=[...new Set(vehicles.map(v=>v.SERVICE_ADVISOR).filter(Boolean))].sort();advisorColorMap=Object.fromEntries(names.map((n,i)=>[n,ADVISOR_COLORS[i%ADVISOR_COLORS.length]]));$('advisorFilter').innerHTML='<option value="">Semua Service Advisor</option>'+names.map(n=>`<option>${esc(n)}</option>`).join('');$('advisorFilter').value=names.includes(current)?current:'';renderLegend(names);}
const advisorColor=name=>advisorColorMap[name]||'#64748b';
function markerIcon(name){const color=advisorColor(name);return L.divIcon({className:'advisor-marker-wrap',html:`<div class="advisor-marker" style="--marker-color:${color}"><span></span></div>`,iconSize:[34,44],iconAnchor:[17,43],popupAnchor:[0,-40]});}
function renderLegend(names){$('advisorLegend').innerHTML=names.length?names.map(n=>`<div class="legend-item"><span class="legend-dot" style="background:${advisorColor(n)}"></span><span>${esc(n)}</span></div>`).join(''):'<small>Belum ada data Service Advisor.</small>';}
function popupHtml(v){const phone=normalizePhone(v.TELEPHONE_CP),q=encodeURIComponent(`${v.lat||''},${v.lng||''}`),key=esc(followUpKey(v)),r=inferRegion(v);return `<div class="popup"><h3>${esc(v.POLICE_NO||'-')} · ${esc(v.MODEL||'-')}</h3><div class="popup-grid"><b>Customer</b><span>${esc(v.CUSTOMER||'-')}</span><b>Tahun</b><span>${esc(v.VIN||'-')}</span><b>KM</b><span>${esc(v.KM||'-')}</span><b>Advisor</b><span>${esc(v.SERVICE_ADVISOR||'-')}</span><b>Kontak</b><span>${esc(v.contact_person||'-')}</span><b>Telepon</b><span>${esc(v.TELEPHONE_CP||'-')}</span><b>Alamat</b><span>${esc(v.ADDRESS||'-')}</span><b>Kabupaten</b><span>${esc(r.regency)}</span><b>Kecamatan</b><span>${esc(r.district)}</span>${v.GEOCODE_PRECISION?`<b>Ketepatan</b><span>${esc(v.GEOCODE_PRECISION)}</span>`:''}</div>${followUpPopupHtml(v)}<div class="popup-actions">${phone?`<button class="wa mini" onclick="openSingleWa('${key}')">WhatsApp</button>`:''}<a target="_blank" href="https://www.google.com/maps/search/?api=1&query=${q}">Buka Google Maps</a><button class="follow-up-popup-btn mini" onclick="openFollowUp('${key}')">Reason Follow Up</button><button class="danger mini" onclick="deleteOne('${esc(normalizePlate(v.POLICE_NO))}')">Hapus</button></div></div>`;}
function renderMarkers(){markers.forEach(m=>map.removeLayer(m));markers=[];const bounds=[];filteredVehicles.forEach(v=>{if(!Number.isFinite(v.lat)||!Number.isFinite(v.lng))return;const m=L.marker([v.lat,v.lng],{icon:markerIcon(v.SERVICE_ADVISOR)}).addTo(map).bindPopup(popupHtml(v));m.vehicle=v;markers.push(m);bounds.push([v.lat,v.lng]);});if(bounds.length===1)map.setView(bounds[0],15);else if(bounds.length>1)map.fitBounds(bounds,{padding:[25,25]});}
function renderList(){const list=$('vehicleList');list.innerHTML=filteredVehicles.slice(0,400).map(v=>{const key=normalizePlate(v.POLICE_NO),status=currentFollowUpStatus(v),unknown=v._district==='Belum diketahui';return `<div class="vehicle-item"><input class="vehicle-check" type="checkbox" data-key="${esc(key)}" ${selectedFollowUps.has(key)?'checked':''}><div class="vehicle-content" data-plate="${esc(key)}"><div class="vehicle-title"><span class="legend-dot" style="background:${advisorColor(v.SERVICE_ADVISOR)}"></span><b>${esc(v.POLICE_NO||'-')} · ${esc(v.MODEL||'-')}</b></div><span>${esc(v.CUSTOMER||'-')}</span><span>SA: ${esc(v.SERVICE_ADVISOR||'-')}</span><span>${esc(v.ADDRESS||'-')}</span><div class="region-row"><span class="region-badge regency">${esc(v._regency)}</span><span class="region-badge ${unknown?'unknown':''}">${esc(v._district)}</span><span class="status-badge status-${esc(status)}">${esc(followUpStatusLabel(status))}</span></div>${v.GEOCODE_PRECISION?`<span>Ketepatan: ${esc(v.GEOCODE_PRECISION)}</span>`:''}</div></div>`}).join('')||'<small>Tidak ada data.</small>';list.querySelectorAll('.vehicle-content').forEach(el=>el.onclick=()=>focusVehicle(el.dataset.plate));list.querySelectorAll('.vehicle-check').forEach(el=>el.onchange=()=>{el.checked?selectedFollowUps.add(el.dataset.key):selectedFollowUps.delete(el.dataset.key);updateSelectionUi();});updateSelectionUi();}
function focusVehicle(key){const v=vehicles.find(x=>normalizePlate(x.POLICE_NO)===key);if(!v)return;if(!Number.isFinite(v.lat))return openAddressEditor(v);map.setView([v.lat,v.lng],16);const m=markers.find(x=>x.vehicle===v);if(m)m.openPopup();}
function applyFilter(){enrichRegions();const q=$('searchInput').value.trim().toLowerCase(),adv=$('advisorFilter').value,reg=$('regencyFilter')?.value||'',dist=$('districtFilter')?.value||'',fu=$('followUpStatusFilter')?.value||'';filteredVehicles=vehicles.filter(v=>(!q||Object.values(v).join(' ').toLowerCase().includes(q))&&(!adv||v.SERVICE_ADVISOR===adv)&&(!reg||v._regency===reg)&&(!dist||v._district===dist)&&(!fu||currentFollowUpStatus(v)===fu));renderList();renderMarkers();updateStats();}
function normalizeRow(r){const obj={};Object.keys(r).forEach(k=>obj[String(k).trim()]=String(r[k]??'').trim());return obj;}
async function importFile(file){const buf=await file.arrayBuffer(),wb=XLSX.read(buf,{type:'array'}),ws=wb.Sheets[wb.SheetNames[0]],rows=XLSX.utils.sheet_to_json(ws,{defval:''}).map(normalizeRow);const existing=new Set(vehicles.map(v=>normalizePlate(v.POLICE_NO)).filter(Boolean));let added=0,ignored=0,invalid=0;for(const row of rows){const key=normalizePlate(row.POLICE_NO);if(!key){invalid++;continue;}if(existing.has(key)){ignored++;continue;}vehicles.push(row);existing.add(key);added++;}saveData();hydrateCoordinates();buildAdvisorFilter();buildRegionFilters();applyFilter();$('status').textContent=`Upload selesai: ${added} ditambah, ${ignored} duplikat diabaikan, ${invalid} tanpa plat.`;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function geocodeAddress(address){
  let lastError=null;
  for(let attempt=0;attempt<5;attempt++){
    if(stopRequested)return null;
    try{
      const res=await fetch(`/api/geocode?address=${encodeURIComponent(address)}&attempt=${attempt}`),data=await res.json().catch(()=>({}));
      if(!res.ok){if(res.status===429||res.status===503){lastError=new Error(data.error||'Layanan alamat sibuk');await sleep(1800);continue;}throw new Error(data.error||'Geocoding gagal');}
      if(data.found)return{lat:Number(data.lat),lng:Number(data.lng),displayName:data.displayName||'',cleanedAddress:data.cleanedAddress||normalizeAddress(address),queryUsed:data.queryUsed||'',precision:data.precision||'alamat'};
      if(attempt<4)await sleep(1150);
    }catch(e){lastError=e;if(attempt<4)await sleep(1800);}
  }
  if(lastError&&/sibuk|429|503/i.test(lastError.message))throw lastError;
  return null;
}
async function processVehicle(v){
  const original=String(v.ADDRESS||'').trim(),key=cacheKey(original);if(!original){v.geocodeFailed=true;v.GEOCODE_ERROR='Alamat kosong';return false;}
  if(geoCache[key]){Object.assign(v,geoCache[key]);v.geocodeFailed=false;return true;}
  const r=await geocodeAddress(original);
  if(!r){v.geocodeFailed=true;v.GEOCODE_ERROR='Tidak ditemukan setelah 5 percobaan';return false;}
  v.lat=r.lat;v.lng=r.lng;v.geocodeFailed=false;delete v.GEOCODE_ERROR;v.GEOCODED_ADDRESS=r.displayName;v.GEOCODE_QUERY=r.queryUsed;v.GEOCODE_PRECISION=r.precision;
  geoCache[key]={lat:r.lat,lng:r.lng,displayName:r.displayName,queryUsed:r.queryUsed,precision:r.precision,manual:false};saveGeo();return true;
}
$('startGeocodeBtn').onclick=async()=>{stopRequested=false;let cleanedCount=0;vehicles.forEach(v=>{if(v.ADDRESS&&!Number.isFinite(v.lat)){const r=cleanAddressSmart(v.ADDRESS);if(r.cleaned&&r.cleaned!==v.ADDRESS){v.ORIGINAL_ADDRESS=v.ORIGINAL_ADDRESS||v.ADDRESS;v.CLEANED_ADDRESS=r.cleaned;v.ADDRESS=r.cleaned;v.ADDRESS_CONFIDENCE=r.confidence;v.ADDRESS_STATUS=r.status;v.geocodeFailed=false;cleanedCount++;}}});saveData();const todo=vehicles.filter(v=>v.ADDRESS&&!Number.isFinite(v.lat));let ok=0,failed=0;for(let i=0;i<todo.length;i++){if(stopRequested)break;const v=todo[i];$('status').textContent=`Memproses ${i+1}/${todo.length}: ${v.POLICE_NO}`;try{const success=await processVehicle(v);success?ok++:failed++;}catch(e){v.geocodeFailed=true;v.GEOCODE_ERROR=e.message||'Gagal';failed++;}$('status').textContent+=v.geocodeFailed?' — gagal':' — berhasil';saveData();updateStats();if((i+1)%5===0)applyFilter();await sleep(1200);}applyFilter();$('status').textContent=stopRequested?`Proses dihentikan. Berhasil ${ok}, gagal ${failed}.`:`Selesai: ${ok} berhasil, ${failed} gagal. ${cleanedCount} alamat diperbaiki otomatis.`;};
function failedVehicles(){return vehicles.filter(v=>v.geocodeFailed===true);}
function renderFailedList(){const rows=failedVehicles();$('failedList').innerHTML=rows.length?rows.map(v=>`<div class="failed-item" data-plate="${esc(normalizePlate(v.POLICE_NO))}"><b>${esc(v.POLICE_NO||'-')} · ${esc(v.CUSTOMER||'-')}</b><span>${esc(v.ADDRESS||'-')}</span>${v.GEOCODE_PRECISION?`<span>Ketepatan: ${esc(v.GEOCODE_PRECISION)}</span>`:''}</div>`).join(''):'<small>Tidak ada alamat gagal.</small>';$('failedList').querySelectorAll('.failed-item').forEach(el=>el.onclick=()=>openAddressEditor(vehicles.find(v=>normalizePlate(v.POLICE_NO)===el.dataset.plate)));}
function openFailedModal(){$('addressModal').classList.remove('hidden');$('editAddressBox').classList.add('hidden');renderFailedList();}
function closeModal(){manualMode=false;editingVehicle=null;$('addressModal').classList.add('hidden');$('manualHelp').textContent='';if(manualPreview){map.removeLayer(manualPreview);manualPreview=null;}}
function openAddressEditor(v){if(!v)return;editingVehicle=v;$('addressModal').classList.remove('hidden');$('editAddressBox').classList.remove('hidden');$('editVehicleTitle').textContent=`${v.POLICE_NO||'-'} · ${v.CUSTOMER||'-'}`;$('editAddressInput').value=normalizeAddress(v.ADDRESS||'');$('manualHelp').textContent='';}
$('retryAddressBtn').onclick=async()=>{if(!editingVehicle)return;const oldKey=cacheKey(editingVehicle.ADDRESS),newAddress=$('editAddressInput').value.trim();if(!newAddress)return alert('Alamat tidak boleh kosong.');$('status').textContent='Mencari alamat yang diperbaiki...';try{const r=await geocodeAddress(newAddress);if(!r)return alert('Alamat masih belum ditemukan. Gunakan tombol Klik titik di peta.');editingVehicle.ADDRESS=newAddress;editingVehicle.lat=r.lat;editingVehicle.lng=r.lng;editingVehicle.geocodeFailed=false;editingVehicle.GEOCODED_ADDRESS=r.displayName;delete geoCache[oldKey];geoCache[cacheKey(newAddress)]={lat:r.lat,lng:r.lng,displayName:r.displayName,manual:false};saveGeo();saveData();applyFilter();renderFailedList();map.setView([r.lat,r.lng],16);closeModal();$('status').textContent='Alamat berhasil diperbaiki.';}catch(e){alert(e.message);}};
$('manualPointBtn').onclick=()=>{if(!editingVehicle)return;manualMode=true;$('manualHelp').textContent='Tutup kotak ini lalu klik lokasi kendaraan pada peta.';$('addressModal').classList.add('hidden');$('status').textContent='Klik titik lokasi yang benar pada peta.';};
map.on('click',e=>{if(!manualMode||!editingVehicle)return;if(manualPreview)map.removeLayer(manualPreview);manualPreview=L.marker(e.latlng).addTo(map);if(!confirm('Gunakan titik ini untuk kendaraan '+(editingVehicle.POLICE_NO||'')+'?'))return;const newAddress=$('editAddressInput').value.trim()||editingVehicle.ADDRESS;editingVehicle.ADDRESS=newAddress;editingVehicle.lat=e.latlng.lat;editingVehicle.lng=e.latlng.lng;editingVehicle.geocodeFailed=false;geoCache[cacheKey(newAddress)]={lat:e.latlng.lat,lng:e.latlng.lng,displayName:'Titik manual',manual:true};saveGeo();saveData();manualMode=false;map.removeLayer(manualPreview);manualPreview=null;applyFilter();$('status').textContent='Titik manual berhasil disimpan.';});
$('showFailedBtn').onclick=openFailedModal;$('closeModalBtn').onclick=closeModal;$('cancelEditBtn').onclick=()=>{$('editAddressBox').classList.add('hidden');editingVehicle=null;};$('addressModal').onclick=e=>{if(e.target===$('addressModal'))closeModal();};
$('stopBtn').onclick=()=>stopRequested=true;
$('fileInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{await importFile(f);}catch(err){alert('File gagal dibaca: '+err.message);}finally{e.target.value='';}};
$('deleteAllBtn').onclick=()=>{if(!confirm('Hapus semua data kendaraan?'))return;vehicles=[];selectedFollowUps.clear();saveData();buildAdvisorFilter();buildRegionFilters();applyFilter();$('status').textContent='Semua data kendaraan sudah dihapus.';};
$('restoreDefaultBtn').onclick=()=>{if(!confirm('Pulihkan data awal? Data saat ini akan diganti.'))return;vehicles=[...(window.DEFAULT_VEHICLES||[])];saveData();hydrateCoordinates();buildAdvisorFilter();buildRegionFilters();applyFilter();$('status').textContent='Data awal dipulihkan.';};
window.deleteOne=key=>{if(!confirm('Hapus kendaraan ini?'))return;vehicles=vehicles.filter(v=>normalizePlate(v.POLICE_NO)!==key);saveData();buildAdvisorFilter();applyFilter();};
$('searchInput').oninput=applyFilter;$('advisorFilter').onchange=applyFilter;$('regencyFilter').onchange=()=>{buildRegionFilters();applyFilter();};$('districtFilter').onchange=applyFilter;$('followUpStatusFilter').onchange=applyFilter;$('showAllBtn').onclick=()=>{$('searchInput').value='';$('advisorFilter').value='';$('regencyFilter').value='';buildRegionFilters();$('districtFilter').value='';$('followUpStatusFilter').value='';applyFilter();};$('selectVisibleBtn').onclick=()=>{filteredVehicles.forEach(v=>selectedFollowUps.add(followUpKey(v)));renderList();};$('clearSelectionBtn').onclick=()=>{selectedFollowUps.clear();renderList();};$('startBatchWaBtn').onclick=()=>{if(batchQueue.length&&batchIndex<batchQueue.length)return openNextBatchWa();batchQueue=vehicles.filter(v=>selectedFollowUps.has(followUpKey(v)));batchIndex=0;if(!batchQueue.length)return alert('Pilih minimal satu customer.');openNextBatchWa();};
hydrateCoordinates();buildAdvisorFilter();buildRegionFilters();applyFilter();saveData();setTimeout(()=>map.invalidateSize(),200);window.addEventListener('resize',()=>map.invalidateSize());

// ===== Analisa dan perbaikan alamat Excel =====
let addressAnalysis=[];
const BALI_CORRECTIONS={
  'TEGALLANG':'TEGALLALANG','TEGALALANG':'TEGALLALANG','ABIANS MAL':'ABIANSEMAL','ABIANSMAL':'ABIANSEMAL',
  'SUKOWATI':'SUKAWATI','BLAHBATUH':'BLAHBATUH','BLAH BATUH':'BLAHBATUH','TAMPAK SIRING':'TAMPAKSIRING',
  'KINTAMANI':'KINTAMANI','KARANG ASEM':'KARANGASEM','KLUNGKUNG':'KLUNGKUNG','TABANAN':'TABANAN',
  'JEMBRANA':'JEMBRANA','BULELENG':'BULELENG','BADUNG':'BADUNG','DENPASAR':'DENPASAR','GIANYAR':'GIANYAR','BANGLI':'BANGLI'
};
const BALI_HINTS={
  'BATUBULAN':'Sukawati, Gianyar','CELUK':'Sukawati, Gianyar','GUWANG':'Sukawati, Gianyar','SINGAPADU':'Sukawati, Gianyar',
  'UBUD':'Ubud, Gianyar','MAS':'Ubud, Gianyar','PENESTANAN':'Ubud, Gianyar','PAYANGAN':'Payangan, Gianyar',
  'TEGALLALANG':'Tegallalang, Gianyar','TAMPAKSIRING':'Tampaksiring, Gianyar','BLAHBATUH':'Blahbatuh, Gianyar',
  'GIANYAR':'Gianyar, Bali','DENPASAR':'Denpasar, Bali','MENGWI':'Mengwi, Badung','ABIANSEMAL':'Abiansemal, Badung',
  'KUTA':'Kuta, Badung','SEMINYAK':'Kuta, Badung','CANGGU':'Kuta Utara, Badung','TABANAN':'Tabanan, Bali',
  'NEGARA':'Jembrana, Bali','SINGARAJA':'Buleleng, Bali','AMLAPURA':'Karangasem, Bali','SEMARAPURA':'Klungkung, Bali',
  'BANGLI':'Bangli, Bali','KINTAMANI':'Kintamani, Bangli'
};
function titleAddress(s){return String(s||'').toLowerCase().replace(/(^|[\s,])([a-z])/g,(m,p,c)=>p+c.toUpperCase());}
function cleanAddressSmart(input){
  const original=String(input||'').trim();
  if(!original)return {cleaned:'',confidence:0,status:'Kosong',notes:'Alamat kosong'};
  let s=normalizeAddress(original).replace(/\bNO\.?\s*(\d+)/g,'Nomor $1');
  let corrections=0;
  for(const [bad,good] of Object.entries(BALI_CORRECTIONS)){
    const re=new RegExp('\\b'+bad.replace(/ /g,'\\s+')+'\\b','g');
    if(re.test(s)){s=s.replace(re,good);corrections++;}
  }
  const hasBali=/\bBALI\b/.test(s), hasKab=/\b(DENPASAR|GIANYAR|BADUNG|TABANAN|JEMBRANA|BULELENG|BANGLI|KLUNGKUNG|KARANGASEM)\b/.test(s);
  let hint='';
  if(!hasKab){for(const [place,area] of Object.entries(BALI_HINTS)){if(new RegExp('\\b'+place+'\\b').test(s)){hint=area;break;}}}
  if(hint&&!s.includes(hint.toUpperCase()))s+=', '+hint;
  if(!hasBali)s+=', Bali';
  if(!/\bINDONESIA\b/.test(s))s+=', Indonesia';
  s=s.replace(/,\s*,+/g,',').replace(/\s+/g,' ').trim();
  const words=original.split(/\s+/).filter(Boolean).length;
  let confidence=55;
  if(words>=3)confidence+=12;if(/JALAN|BANJAR|DESA|KELURAHAN/.test(s))confidence+=8;if(hasKab||hint)confidence+=15;if(corrections===0)confidence+=5;
  confidence=Math.min(98,confidence);
  let status=confidence>=85?'Baik':confidence>=65?'Perlu dicek':'Kurang lengkap';
  return {cleaned:titleAddress(s),confidence,status,notes:corrections?`${corrections} ejaan diperbaiki`:hint?'Wilayah Bali ditambahkan':'Format dinormalisasi'};
}
function runAddressAnalysis(){
  addressAnalysis=vehicles.map((v,i)=>{const r=cleanAddressSmart(v.ADDRESS);return {index:i,plate:v.POLICE_NO||'',original:v.ADDRESS||'',...r};});
  renderAddressAnalysis();$('analysisModal').classList.remove('hidden');
}
function confidenceClass(n){return n>=85?'conf-green':n>=65?'conf-yellow':'conf-red';}
function statusClass(s){return s==='Baik'?'status-ok':s==='Perlu dicek'?'status-check':'status-fail';}
function renderAddressAnalysis(){
  const good=addressAnalysis.filter(x=>x.confidence>=85).length,check=addressAnalysis.filter(x=>x.confidence>=65&&x.confidence<85).length,bad=addressAnalysis.filter(x=>x.confidence<65).length;
  $('analysisSummary').innerHTML=`<div><strong>${addressAnalysis.length}</strong><span>Total alamat</span></div><div><strong>${good}</strong><span>Baik</span></div><div><strong>${check}</strong><span>Perlu dicek</span></div><div><strong>${bad}</strong><span>Kurang lengkap</span></div>`;
  $('analysisRows').innerHTML=addressAnalysis.map((x,i)=>`<tr><td><b>${esc(x.plate||'-')}</b></td><td>${esc(x.original||'-')}</td><td><textarea class="address-edit" data-i="${i}">${esc(x.cleaned)}</textarea></td><td><span class="confidence-badge ${confidenceClass(x.confidence)}">${x.confidence}%</span></td><td class="${statusClass(x.status)}">${esc(x.status)}<br><small>${esc(x.notes)}</small></td></tr>`).join('');
  document.querySelectorAll('.address-edit').forEach(el=>el.oninput=()=>{addressAnalysis[Number(el.dataset.i)].cleaned=el.value.trim();});
}
function applyCleanedAddresses(){
  let changed=0;
  addressAnalysis.forEach(x=>{const v=vehicles[x.index];if(!v)return;const cleaned=x.cleaned.trim();v.ORIGINAL_ADDRESS=v.ORIGINAL_ADDRESS||v.ADDRESS||'';v.CLEANED_ADDRESS=cleaned;v.ADDRESS_CONFIDENCE=x.confidence;v.ADDRESS_STATUS=x.status;if(cleaned&&cleaned!==v.ADDRESS){const oldKey=cacheKey(v.ADDRESS);delete geoCache[oldKey];v.ADDRESS=cleaned;delete v.lat;delete v.lng;v.geocodeFailed=false;delete v.GEOCODE_ERROR;changed++;}});
  saveData();applyFilter();$('status').textContent=`${changed} alamat diperbarui. Klik Proses alamat untuk mencari titiknya.`;alert(`${changed} alamat berhasil diterapkan ke data aplikasi.`);
}
function downloadCleanedExcel(){
  const rows=addressAnalysis.map(x=>{const v=vehicles[x.index]||{};return {...v,ALAMAT_ASLI:x.original,ALAMAT_HASIL_PERBAIKAN:x.cleaned,KEYAKINAN_ALAMAT:x.confidence+'%',STATUS_ALAMAT:x.status,CATATAN_ALAMAT:x.notes};});
  const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Alamat Diperbaiki');XLSX.writeFile(wb,`alamat-kendaraan-diperbaiki-${new Date().toISOString().slice(0,10)}.xlsx`);
}
$('analyzeAddressBtn').onclick=runAddressAnalysis;
$('closeAnalysisBtn').onclick=()=>$('analysisModal').classList.add('hidden');
$('applyCleanedBtn').onclick=applyCleanedAddresses;
$('downloadCleanedBtn').onclick=downloadCleanedExcel;
$('analysisModal').onclick=e=>{if(e.target===$('analysisModal'))$('analysisModal').classList.add('hidden');};


// ===== Reason Follow Up =====
function renderFollowUpHistory(history=[]){$('followUpHistory').innerHTML=history.length?[...history].reverse().map(x=>`<div class="follow-up-history-item"><b>${esc(formatFollowUpDate(x.date))} — ${esc(followUpStatusLabel(x.status))}</b><br>Reason: ${esc(followUpReasonLabel(x.reason))}<br>Next: ${esc(formatFollowUpDate(x.nextDate))}<br>Catatan: ${esc(x.note||'-')}</div>`).join(''):'<div class="follow-up-history-empty">Belum ada riwayat follow up.</div>';}
window.openFollowUp=key=>{const v=vehicles.find(x=>followUpKey(x)===key);if(!v)return alert('Data kendaraan tidak ditemukan.');activeFollowUpVehicle=v;const f=followUps[key];$('followUpVehicleInfo').textContent=`${v.POLICE_NO||'-'} · ${v.MODEL||'-'} · ${v.CUSTOMER||'-'}`;$('followUpStatus').value=f?.status||'BELUM';$('followUpDate').value=f?.date||new Date().toISOString().slice(0,10);$('followUpReason').value=f?.reason||'';$('followUpNextDate').value=f?.nextDate||'';$('followUpNote').value=f?.note||'';renderFollowUpHistory(f?.history||[]);$('followUpModal').classList.remove('hidden');};
function closeFollowUp(){activeFollowUpVehicle=null;$('followUpModal').classList.add('hidden');}
$('closeFollowUpBtn').onclick=closeFollowUp;$('cancelFollowUpBtn').onclick=closeFollowUp;$('followUpModal').onclick=e=>{if(e.target===$('followUpModal'))closeFollowUp();};
$('saveFollowUpBtn').onclick=()=>{if(!activeFollowUpVehicle)return;const key=followUpKey(activeFollowUpVehicle),date=$('followUpDate').value,reason=$('followUpReason').value;if(!date)return alert('Tanggal follow up harus diisi.');if(!reason)return alert('Reason follow up harus dipilih.');const old=followUps[key]||{},record={plate:activeFollowUpVehicle.POLICE_NO||'',customer:activeFollowUpVehicle.CUSTOMER||'',model:activeFollowUpVehicle.MODEL||'',status:$('followUpStatus').value,date,reason,nextDate:$('followUpNextDate').value,note:$('followUpNote').value.trim(),updatedAt:new Date().toISOString()};record.history=[...(old.history||[]),{status:record.status,date:record.date,reason:record.reason,nextDate:record.nextDate,note:record.note,savedAt:record.updatedAt}];followUps[key]=record;saveFollowUps();closeFollowUp();applyFilter();alert('Data follow up berhasil disimpan.');};
$('deleteFollowUpBtn').onclick=()=>{if(!activeFollowUpVehicle)return;const key=followUpKey(activeFollowUpVehicle);if(!followUps[key])return alert('Belum ada data follow up.');if(!confirm('Hapus seluruh data follow up kendaraan ini?'))return;delete followUps[key];saveFollowUps();closeFollowUp();applyFilter();};
$('downloadFollowUpBtn').onclick=()=>{const rows=vehicles.map(v=>{const f=followUps[followUpKey(v)]||{};const r=inferRegion(v);return {...v,KABUPATEN_TERDETEKSI:r.regency,KECAMATAN_TERDETEKSI:r.district,STATUS_FOLLOW_UP:followUpStatusLabel(f.status||'BELUM'),TANGGAL_FOLLOW_UP:f.date||'',REASON_FOLLOW_UP:followUpReasonLabel(f.reason),FOLLOW_UP_BERIKUTNYA:f.nextDate||'',CATATAN_FOLLOW_UP:f.note||''};});if(!rows.length)return alert('Belum ada data kendaraan.');const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Kendaraan Follow Up');XLSX.writeFile(wb,`data-kendaraan-follow-up-${new Date().toISOString().slice(0,10)}.xlsx`);};

// ===== V6: Minimize / Maximize sidebar kiri dan kanan =====
(function initCollapsibleLayout(){
  const layout=document.getElementById('appLayout');
  const leftBtn=document.getElementById('toggleLeftSidebar');
  const rightBtn=document.getElementById('toggleRightSidebar');
  if(!layout||!leftBtn||!rightBtn)return;
  const LAYOUT_KEY='vehicleMapLayoutV6';
  let saved={};
  try{saved=JSON.parse(localStorage.getItem(LAYOUT_KEY)||'{}')||{};}catch(_){saved={};}
  const mobile=()=>window.matchMedia('(max-width:780px)').matches;
  const refreshMap=()=>setTimeout(()=>{try{map.invalidateSize();}catch(_){}},280);
  const save=()=>{if(mobile())return;localStorage.setItem(LAYOUT_KEY,JSON.stringify({leftCollapsed:layout.classList.contains('left-collapsed'),rightCollapsed:layout.classList.contains('right-collapsed')}));};
  if(!mobile()){
    if(saved.leftCollapsed)layout.classList.add('left-collapsed');
    if(saved.rightCollapsed)layout.classList.add('right-collapsed');
  }
  leftBtn.onclick=()=>{
    if(mobile()){
      layout.classList.toggle('left-mobile-open');
      layout.classList.remove('right-mobile-open');
    }else{
      layout.classList.toggle('left-collapsed');save();
    }
    refreshMap();
  };
  rightBtn.onclick=()=>{
    if(mobile()){
      layout.classList.toggle('right-mobile-open');
      layout.classList.remove('left-mobile-open');
    }else{
      layout.classList.toggle('right-collapsed');save();
    }
    refreshMap();
  };
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){layout.classList.remove('left-mobile-open','right-mobile-open');refreshMap();}
  });
  window.addEventListener('resize',()=>{
    if(!mobile())layout.classList.remove('left-mobile-open','right-mobile-open');
    refreshMap();
  });
  refreshMap();
})();
