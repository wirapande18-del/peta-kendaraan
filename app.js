const DATA_KEY='vehicleMapDataV2';
const GEO_KEY='vehicleMapGeocodeCacheV2';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const normalizePlate=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const normalizePhone=p=>{let d=String(p||'').replace(/\D/g,'');if(d.startsWith('0'))d='62'+d.slice(1);return d;};
const readJSON=(k,f)=>{try{return JSON.parse(localStorage.getItem(k)||'null')??f;}catch{return f;}};
const saveData=()=>localStorage.setItem(DATA_KEY,JSON.stringify(vehicles));
const geoCache=readJSON(GEO_KEY,{});
const saveGeo=()=>localStorage.setItem(GEO_KEY,JSON.stringify(geoCache));
let vehicles=readJSON(DATA_KEY,null)||[...(window.DEFAULT_VEHICLES||[])];
let filteredVehicles=[];
let stopRequested=false;
let markers=[];

const map=L.map('map').setView([-8.4095,115.1889],9);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors',crossOrigin:true}).addTo(map);

function hydrateCoordinates(){
  vehicles.forEach(v=>{const c=geoCache[String(v.ADDRESS||'').trim()];if(c){v.lat=c.lat;v.lng=c.lng;}});
}
function updateStats(){
  $('totalData').textContent=vehicles.length;
  $('mappedData').textContent=vehicles.filter(v=>Number.isFinite(v.lat)&&Number.isFinite(v.lng)).length;
  $('failedData').textContent=vehicles.filter(v=>v.geocodeFailed).length;
}
function buildAdvisorFilter(){
  const current=$('advisorFilter').value;
  const names=[...new Set(vehicles.map(v=>v.SERVICE_ADVISOR).filter(Boolean))].sort();
  $('advisorFilter').innerHTML='<option value="">Semua Service Advisor</option>'+names.map(n=>`<option>${esc(n)}</option>`).join('');
  $('advisorFilter').value=names.includes(current)?current:'';
}
function popupHtml(v){
  const phone=normalizePhone(v.TELEPHONE_CP);
  const q=encodeURIComponent(`${v.lat||''},${v.lng||''}`);
  return `<div class="popup"><h3>${esc(v.POLICE_NO||'-')} · ${esc(v.MODEL||'-')}</h3>
  <div class="popup-grid"><b>Customer</b><span>${esc(v.CUSTOMER||'-')}</span><b>Tahun</b><span>${esc(v.VIN||'-')}</span><b>KM</b><span>${esc(v.KM||'-')}</span><b>Advisor</b><span>${esc(v.SERVICE_ADVISOR||'-')}</span><b>Kontak</b><span>${esc(v.contact_person||'-')}</span><b>Telepon</b><span>${esc(v.TELEPHONE_CP||'-')}</span><b>Alamat</b><span>${esc(v.ADDRESS||'-')}</span></div>
  <div class="popup-actions">${phone?`<a class="wa" target="_blank" href="https://wa.me/${phone}">WhatsApp</a>`:''}<a target="_blank" href="https://www.google.com/maps/search/?api=1&query=${q}">Buka Google Maps</a><button class="danger mini" onclick="deleteOne('${esc(normalizePlate(v.POLICE_NO))}')">Hapus</button></div></div>`;
}
function renderMarkers(){
  markers.forEach(m=>map.removeLayer(m));markers=[];
  const bounds=[];
  filteredVehicles.forEach(v=>{if(!Number.isFinite(v.lat)||!Number.isFinite(v.lng))return;const m=L.marker([v.lat,v.lng]).addTo(map).bindPopup(popupHtml(v));m.vehicle=v;markers.push(m);bounds.push([v.lat,v.lng]);});
  if(bounds.length===1)map.setView(bounds[0],15);else if(bounds.length>1)map.fitBounds(bounds,{padding:[25,25]});
}
function renderList(){
  const list=$('vehicleList');
  list.innerHTML=filteredVehicles.slice(0,400).map(v=>`<div class="vehicle-item" data-plate="${esc(normalizePlate(v.POLICE_NO))}"><b>${esc(v.POLICE_NO||'-')} · ${esc(v.MODEL||'-')}</b><span>${esc(v.CUSTOMER||'-')}</span><span>${esc(v.ADDRESS||'-')}</span></div>`).join('')||'<small>Tidak ada data.</small>';
  list.querySelectorAll('.vehicle-item').forEach(el=>el.onclick=()=>focusVehicle(el.dataset.plate));
}
function focusVehicle(key){
  const v=vehicles.find(x=>normalizePlate(x.POLICE_NO)===key);if(!v)return;
  if(!Number.isFinite(v.lat))return alert('Alamat kendaraan ini belum diproses.');
  map.setView([v.lat,v.lng],16);const m=markers.find(x=>x.vehicle===v);if(m)m.openPopup();
}
function applyFilter(){
  const q=$('searchInput').value.trim().toLowerCase(),adv=$('advisorFilter').value;
  filteredVehicles=vehicles.filter(v=>(!q||Object.values(v).join(' ').toLowerCase().includes(q))&&(!adv||v.SERVICE_ADVISOR===adv));
  renderList();renderMarkers();updateStats();
}
function normalizeRow(r){
  const obj={};Object.keys(r).forEach(k=>obj[String(k).trim()]=String(r[k]??'').trim());return obj;
}
async function importFile(file){
  const buf=await file.arrayBuffer();const wb=XLSX.read(buf,{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(ws,{defval:''}).map(normalizeRow);
  const existing=new Set(vehicles.map(v=>normalizePlate(v.POLICE_NO)).filter(Boolean));let added=0,ignored=0,invalid=0;
  for(const row of rows){const key=normalizePlate(row.POLICE_NO);if(!key){invalid++;continue;}if(existing.has(key)){ignored++;continue;}vehicles.push(row);existing.add(key);added++;}
  saveData();hydrateCoordinates();buildAdvisorFilter();applyFilter();
  $('status').textContent=`Upload selesai: ${added} ditambah, ${ignored} duplikat diabaikan, ${invalid} tanpa plat.`;
}
async function geocodeAddress(address){
  const url=`/api/geocode?address=${encodeURIComponent(address)}`;
  const res=await fetch(url);
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data.error||'Geocoding gagal');
  if(!data.found)return null;
  return{lat:Number(data.lat),lng:Number(data.lng)};
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
$('startGeocodeBtn').onclick=async()=>{
  stopRequested=false;const todo=vehicles.filter(v=>v.ADDRESS&&!geoCache[String(v.ADDRESS).trim()]);
  for(let i=0;i<todo.length;i++){
    if(stopRequested)break;const v=todo[i];$('status').textContent=`Memproses ${i+1}/${todo.length}: ${v.POLICE_NO}`;
    try{const r=await geocodeAddress(v.ADDRESS);if(r){v.lat=r.lat;v.lng=r.lng;geoCache[String(v.ADDRESS).trim()]=r;saveGeo();}else v.geocodeFailed=true;}catch(e){v.geocodeFailed=true;}
    saveData();updateStats();if((i+1)%10===0)applyFilter();await sleep(1100);
  }
  applyFilter();$('status').textContent=stopRequested?'Proses dihentikan':'Proses alamat selesai';
};
$('stopBtn').onclick=()=>stopRequested=true;
$('fileInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{await importFile(f);}catch(err){alert('File gagal dibaca: '+err.message);}finally{e.target.value='';}};
$('deleteAllBtn').onclick=()=>{if(!confirm('Hapus semua data kendaraan?'))return;vehicles=[];saveData();buildAdvisorFilter();applyFilter();$('status').textContent='Semua data kendaraan sudah dihapus.';};
$('restoreDefaultBtn').onclick=()=>{if(!confirm('Pulihkan data awal? Data saat ini akan diganti.'))return;vehicles=[...(window.DEFAULT_VEHICLES||[])];saveData();hydrateCoordinates();buildAdvisorFilter();applyFilter();$('status').textContent='Data awal dipulihkan.';};
window.deleteOne=key=>{if(!confirm('Hapus kendaraan ini?'))return;vehicles=vehicles.filter(v=>normalizePlate(v.POLICE_NO)!==key);saveData();buildAdvisorFilter();applyFilter();};
$('searchInput').oninput=applyFilter;$('advisorFilter').onchange=applyFilter;$('showAllBtn').onclick=()=>{$('searchInput').value='';$('advisorFilter').value='';applyFilter();};
hydrateCoordinates();buildAdvisorFilter();applyFilter();saveData();
setTimeout(()=>map.invalidateSize(),200);
window.addEventListener('resize',()=>map.invalidateSize());
