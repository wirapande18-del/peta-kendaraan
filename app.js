const DATA_KEY='vehicleMapDataV3';
const GEO_KEY='vehicleMapGeocodeCacheV3';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const normalizePlate=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const normalizePhone=p=>{let d=String(p||'').replace(/\D/g,'');if(d.startsWith('0'))d='62'+d.slice(1);return d;};
const normalizeAddress=s=>String(s||'').toUpperCase().replace(/\bJL\.?\b/g,'JALAN').replace(/\bJLN\.?\b/g,'JALAN').replace(/\bBR\.?\b/g,'BANJAR').replace(/\bDS\.?\b/g,'DESA').replace(/\bKEL\.?\b/g,'KELURAHAN').replace(/\bKEC\.?\b/g,'KECAMATAN').replace(/\bKAB\.?\b/g,'KABUPATEN').replace(/\bDPS\b/g,'DENPASAR').replace(/\bGYR\b/g,'GIANYAR').replace(/[;|]/g,',').replace(/\s+/g,' ').replace(/\s*,\s*/g,', ').trim();
const cacheKey=s=>normalizeAddress(s);
const readJSON=(k,f)=>{try{return JSON.parse(localStorage.getItem(k)||'null')??f;}catch{return f;}};
let vehicles=readJSON(DATA_KEY,null)||[...(window.DEFAULT_VEHICLES||[])];
let geoCache=readJSON(GEO_KEY,{}),filteredVehicles=[],stopRequested=false,markers=[],editingVehicle=null,manualMode=false,manualPreview=null;
const saveData=()=>localStorage.setItem(DATA_KEY,JSON.stringify(vehicles));
const saveGeo=()=>localStorage.setItem(GEO_KEY,JSON.stringify(geoCache));
const ADVISOR_COLORS=['#1769e0','#d92d20','#16a34a','#9333ea','#f59e0b','#0891b2','#db2777','#65a30d','#ea580c','#4f46e5','#0f766e','#7c2d12'];
let advisorColorMap={};
const map=L.map('map').setView([-8.4095,115.1889],9);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors',crossOrigin:true}).addTo(map);

function hydrateCoordinates(){vehicles.forEach(v=>{const c=geoCache[cacheKey(v.ADDRESS)];if(c){v.lat=Number(c.lat);v.lng=Number(c.lng);v.geocodeFailed=false;}});}
function updateStats(){$('totalData').textContent=vehicles.length;$('mappedData').textContent=vehicles.filter(v=>Number.isFinite(v.lat)&&Number.isFinite(v.lng)).length;$('failedData').textContent=vehicles.filter(v=>v.geocodeFailed||(!Number.isFinite(v.lat)&&v.ADDRESS)).length;}
function buildAdvisorFilter(){const current=$('advisorFilter').value;const names=[...new Set(vehicles.map(v=>v.SERVICE_ADVISOR).filter(Boolean))].sort();advisorColorMap=Object.fromEntries(names.map((n,i)=>[n,ADVISOR_COLORS[i%ADVISOR_COLORS.length]]));$('advisorFilter').innerHTML='<option value="">Semua Service Advisor</option>'+names.map(n=>`<option>${esc(n)}</option>`).join('');$('advisorFilter').value=names.includes(current)?current:'';renderLegend(names);}
const advisorColor=name=>advisorColorMap[name]||'#64748b';
function markerIcon(name){const color=advisorColor(name);return L.divIcon({className:'advisor-marker-wrap',html:`<div class="advisor-marker" style="--marker-color:${color}"><span></span></div>`,iconSize:[34,44],iconAnchor:[17,43],popupAnchor:[0,-40]});}
function renderLegend(names){$('advisorLegend').innerHTML=names.length?names.map(n=>`<div class="legend-item"><span class="legend-dot" style="background:${advisorColor(n)}"></span><span>${esc(n)}</span></div>`).join(''):'<small>Belum ada data Service Advisor.</small>';}
function popupHtml(v){const phone=normalizePhone(v.TELEPHONE_CP),q=encodeURIComponent(`${v.lat||''},${v.lng||''}`);return `<div class="popup"><h3>${esc(v.POLICE_NO||'-')} · ${esc(v.MODEL||'-')}</h3><div class="popup-grid"><b>Customer</b><span>${esc(v.CUSTOMER||'-')}</span><b>Tahun</b><span>${esc(v.VIN||'-')}</span><b>KM</b><span>${esc(v.KM||'-')}</span><b>Advisor</b><span>${esc(v.SERVICE_ADVISOR||'-')}</span><b>Kontak</b><span>${esc(v.contact_person||'-')}</span><b>Telepon</b><span>${esc(v.TELEPHONE_CP||'-')}</span><b>Alamat</b><span>${esc(v.ADDRESS||'-')}</span></div><div class="popup-actions">${phone?`<a class="wa" target="_blank" href="https://wa.me/${phone}">WhatsApp</a>`:''}<a target="_blank" href="https://www.google.com/maps/search/?api=1&query=${q}">Buka Google Maps</a><button class="danger mini" onclick="deleteOne('${esc(normalizePlate(v.POLICE_NO))}')">Hapus</button></div></div>`;}
function renderMarkers(){markers.forEach(m=>map.removeLayer(m));markers=[];const bounds=[];filteredVehicles.forEach(v=>{if(!Number.isFinite(v.lat)||!Number.isFinite(v.lng))return;const m=L.marker([v.lat,v.lng],{icon:markerIcon(v.SERVICE_ADVISOR)}).addTo(map).bindPopup(popupHtml(v));m.vehicle=v;markers.push(m);bounds.push([v.lat,v.lng]);});if(bounds.length===1)map.setView(bounds[0],15);else if(bounds.length>1)map.fitBounds(bounds,{padding:[25,25]});}
function renderList(){const list=$('vehicleList');list.innerHTML=filteredVehicles.slice(0,400).map(v=>`<div class="vehicle-item" data-plate="${esc(normalizePlate(v.POLICE_NO))}"><div class="vehicle-title"><span class="legend-dot" style="background:${advisorColor(v.SERVICE_ADVISOR)}"></span><b>${esc(v.POLICE_NO||'-')} · ${esc(v.MODEL||'-')}</b></div><span>${esc(v.CUSTOMER||'-')}</span><span>SA: ${esc(v.SERVICE_ADVISOR||'-')}</span><span>${esc(v.ADDRESS||'-')}</span></div>`).join('')||'<small>Tidak ada data.</small>';list.querySelectorAll('.vehicle-item').forEach(el=>el.onclick=()=>focusVehicle(el.dataset.plate));}
function focusVehicle(key){const v=vehicles.find(x=>normalizePlate(x.POLICE_NO)===key);if(!v)return;if(!Number.isFinite(v.lat))return openAddressEditor(v);map.setView([v.lat,v.lng],16);const m=markers.find(x=>x.vehicle===v);if(m)m.openPopup();}
function applyFilter(){const q=$('searchInput').value.trim().toLowerCase(),adv=$('advisorFilter').value;filteredVehicles=vehicles.filter(v=>(!q||Object.values(v).join(' ').toLowerCase().includes(q))&&(!adv||v.SERVICE_ADVISOR===adv));renderList();renderMarkers();updateStats();}
function normalizeRow(r){const obj={};Object.keys(r).forEach(k=>obj[String(k).trim()]=String(r[k]??'').trim());return obj;}
async function importFile(file){const buf=await file.arrayBuffer(),wb=XLSX.read(buf,{type:'array'}),ws=wb.Sheets[wb.SheetNames[0]],rows=XLSX.utils.sheet_to_json(ws,{defval:''}).map(normalizeRow);const existing=new Set(vehicles.map(v=>normalizePlate(v.POLICE_NO)).filter(Boolean));let added=0,ignored=0,invalid=0;for(const row of rows){const key=normalizePlate(row.POLICE_NO);if(!key){invalid++;continue;}if(existing.has(key)){ignored++;continue;}vehicles.push(row);existing.add(key);added++;}saveData();hydrateCoordinates();buildAdvisorFilter();applyFilter();$('status').textContent=`Upload selesai: ${added} ditambah, ${ignored} duplikat diabaikan, ${invalid} tanpa plat.`;}
async function geocodeAddress(address){const res=await fetch(`/api/geocode?address=${encodeURIComponent(address)}`),data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'Geocoding gagal');if(!data.found)return null;return{lat:Number(data.lat),lng:Number(data.lng),displayName:data.displayName||'',cleanedAddress:data.cleanedAddress||normalizeAddress(address)};}
async function processVehicle(v){const original=String(v.ADDRESS||'').trim(),key=cacheKey(original);if(!original)return false;if(geoCache[key]){Object.assign(v,geoCache[key]);v.geocodeFailed=false;return true;}const r=await geocodeAddress(original);if(!r){v.geocodeFailed=true;return false;}v.lat=r.lat;v.lng=r.lng;v.geocodeFailed=false;v.GEOCODED_ADDRESS=r.displayName;geoCache[key]={lat:r.lat,lng:r.lng,displayName:r.displayName,manual:false};saveGeo();return true;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
$('startGeocodeBtn').onclick=async()=>{stopRequested=false;const todo=vehicles.filter(v=>v.ADDRESS&&!Number.isFinite(v.lat));for(let i=0;i<todo.length;i++){if(stopRequested)break;const v=todo[i];$('status').textContent=`Memproses ${i+1}/${todo.length}: ${v.POLICE_NO}`;try{await processVehicle(v);}catch(e){v.geocodeFailed=true;}$('status').textContent+=v.geocodeFailed?' — gagal':' — berhasil';saveData();updateStats();if((i+1)%5===0)applyFilter();await sleep(1200);}applyFilter();$('status').textContent=stopRequested?'Proses dihentikan':'Proses alamat selesai';};
function failedVehicles(){return vehicles.filter(v=>v.geocodeFailed||(!Number.isFinite(v.lat)&&v.ADDRESS));}
function renderFailedList(){const rows=failedVehicles();$('failedList').innerHTML=rows.length?rows.map(v=>`<div class="failed-item" data-plate="${esc(normalizePlate(v.POLICE_NO))}"><b>${esc(v.POLICE_NO||'-')} · ${esc(v.CUSTOMER||'-')}</b><span>${esc(v.ADDRESS||'-')}</span></div>`).join(''):'<small>Tidak ada alamat gagal.</small>';$('failedList').querySelectorAll('.failed-item').forEach(el=>el.onclick=()=>openAddressEditor(vehicles.find(v=>normalizePlate(v.POLICE_NO)===el.dataset.plate)));}
function openFailedModal(){$('addressModal').classList.remove('hidden');$('editAddressBox').classList.add('hidden');renderFailedList();}
function closeModal(){manualMode=false;editingVehicle=null;$('addressModal').classList.add('hidden');$('manualHelp').textContent='';if(manualPreview){map.removeLayer(manualPreview);manualPreview=null;}}
function openAddressEditor(v){if(!v)return;editingVehicle=v;$('addressModal').classList.remove('hidden');$('editAddressBox').classList.remove('hidden');$('editVehicleTitle').textContent=`${v.POLICE_NO||'-'} · ${v.CUSTOMER||'-'}`;$('editAddressInput').value=normalizeAddress(v.ADDRESS||'');$('manualHelp').textContent='';}
$('retryAddressBtn').onclick=async()=>{if(!editingVehicle)return;const oldKey=cacheKey(editingVehicle.ADDRESS),newAddress=$('editAddressInput').value.trim();if(!newAddress)return alert('Alamat tidak boleh kosong.');$('status').textContent='Mencari alamat yang diperbaiki...';try{const r=await geocodeAddress(newAddress);if(!r)return alert('Alamat masih belum ditemukan. Gunakan tombol Klik titik di peta.');editingVehicle.ADDRESS=newAddress;editingVehicle.lat=r.lat;editingVehicle.lng=r.lng;editingVehicle.geocodeFailed=false;editingVehicle.GEOCODED_ADDRESS=r.displayName;delete geoCache[oldKey];geoCache[cacheKey(newAddress)]={lat:r.lat,lng:r.lng,displayName:r.displayName,manual:false};saveGeo();saveData();applyFilter();renderFailedList();map.setView([r.lat,r.lng],16);closeModal();$('status').textContent='Alamat berhasil diperbaiki.';}catch(e){alert(e.message);}};
$('manualPointBtn').onclick=()=>{if(!editingVehicle)return;manualMode=true;$('manualHelp').textContent='Tutup kotak ini lalu klik lokasi kendaraan pada peta.';$('addressModal').classList.add('hidden');$('status').textContent='Klik titik lokasi yang benar pada peta.';};
map.on('click',e=>{if(!manualMode||!editingVehicle)return;if(manualPreview)map.removeLayer(manualPreview);manualPreview=L.marker(e.latlng).addTo(map);if(!confirm('Gunakan titik ini untuk kendaraan '+(editingVehicle.POLICE_NO||'')+'?'))return;const newAddress=$('editAddressInput').value.trim()||editingVehicle.ADDRESS;editingVehicle.ADDRESS=newAddress;editingVehicle.lat=e.latlng.lat;editingVehicle.lng=e.latlng.lng;editingVehicle.geocodeFailed=false;geoCache[cacheKey(newAddress)]={lat:e.latlng.lat,lng:e.latlng.lng,displayName:'Titik manual',manual:true};saveGeo();saveData();manualMode=false;map.removeLayer(manualPreview);manualPreview=null;applyFilter();$('status').textContent='Titik manual berhasil disimpan.';});
$('showFailedBtn').onclick=openFailedModal;$('closeModalBtn').onclick=closeModal;$('cancelEditBtn').onclick=()=>{$('editAddressBox').classList.add('hidden');editingVehicle=null;};$('addressModal').onclick=e=>{if(e.target===$('addressModal'))closeModal();};
$('stopBtn').onclick=()=>stopRequested=true;
$('fileInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{await importFile(f);}catch(err){alert('File gagal dibaca: '+err.message);}finally{e.target.value='';}};
$('deleteAllBtn').onclick=()=>{if(!confirm('Hapus semua data kendaraan?'))return;vehicles=[];saveData();buildAdvisorFilter();applyFilter();$('status').textContent='Semua data kendaraan sudah dihapus.';};
$('restoreDefaultBtn').onclick=()=>{if(!confirm('Pulihkan data awal? Data saat ini akan diganti.'))return;vehicles=[...(window.DEFAULT_VEHICLES||[])];saveData();hydrateCoordinates();buildAdvisorFilter();applyFilter();$('status').textContent='Data awal dipulihkan.';};
window.deleteOne=key=>{if(!confirm('Hapus kendaraan ini?'))return;vehicles=vehicles.filter(v=>normalizePlate(v.POLICE_NO)!==key);saveData();buildAdvisorFilter();applyFilter();};
$('searchInput').oninput=applyFilter;$('advisorFilter').onchange=applyFilter;$('showAllBtn').onclick=()=>{$('searchInput').value='';$('advisorFilter').value='';applyFilter();};
hydrateCoordinates();buildAdvisorFilter();applyFilter();saveData();setTimeout(()=>map.invalidateSize(),200);window.addEventListener('resize',()=>map.invalidateSize());

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
  addressAnalysis.forEach(x=>{const v=vehicles[x.index];if(!v)return;const cleaned=x.cleaned.trim();v.ORIGINAL_ADDRESS=v.ORIGINAL_ADDRESS||v.ADDRESS||'';v.CLEANED_ADDRESS=cleaned;v.ADDRESS_CONFIDENCE=x.confidence;v.ADDRESS_STATUS=x.status;if(cleaned&&cleaned!==v.ADDRESS){v.ADDRESS=cleaned;delete v.lat;delete v.lng;v.geocodeFailed=false;changed++;}});
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
