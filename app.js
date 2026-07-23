const APP_VERSION='14.0.0';window.PETA_APP_VERSION=APP_VERSION;
const DATA_KEY='vehicleMapDataV4';
const GEO_KEY='vehicleMapGeocodeCacheV4';
const FOLLOW_UP_KEY='vehicleMapFollowUpV1';
const WA_TEMPLATE_KEY='vehicleMapWaTemplatesV1';
const WA_ACTIVE_TEMPLATE_KEY='vehicleMapActiveWaTemplateV1';
const WA_TEMPLATE_BACKUP_KEY='vehicleMapWaTemplatesBackupV1';
const WA_TEST_NUMBER_KEY='vehicleMapWaTestNumberV1';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const normalizePlate=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const advisorName=s=>String(s||'').trim().replace(/\s+/g,' ');
const advisorKey=s=>advisorName(s).toLocaleUpperCase('id-ID');
const normalizePhone=p=>{let d=String(p||'').replace(/\D/g,'');if(d.startsWith('0'))d='62'+d.slice(1);return d;};
function getPhoneRaw(v){
  if(!v)return '';
  const direct=[v.TELEPHONE_CP,v.telephone_cp,v.WA_CP,v['WA CP'],v.WHATSAPP,v.WA,v.PHONE,v['NO HP'],v.NOMOR_HP,v.MOBILE_PHONE];
  const found=direct.find(x=>String(x??'').trim()!=='');
  if(found!==undefined)return String(found).trim();
  for(const [k,val] of Object.entries(v)){
    const nk=String(k).trim().toUpperCase().replace(/[._-]+/g,' ').replace(/\s+/g,' ');
    if(['TELEPHONE CP','WA CP','WHATSAPP','WA','PHONE','NO HP','NOMOR HP','MOBILE PHONE'].includes(nk)&&String(val??'').trim()!=='')return String(val).trim();
  }
  return '';
}
const getPhone=v=>normalizePhone(getPhoneRaw(v));
const normalizeAddress=s=>String(s||'').toUpperCase().replace(/\bJL\.?\b/g,'JALAN').replace(/\bJLN\.?\b/g,'JALAN').replace(/\bBR\.?\b/g,'BANJAR').replace(/\bDS\.?\b/g,'DESA').replace(/\bKEL\.?\b/g,'KELURAHAN').replace(/\bKEC\.?\b/g,'KECAMATAN').replace(/\bKAB\.?\b/g,'KABUPATEN').replace(/\bDPS\b/g,'DENPASAR').replace(/\bGYR\b/g,'GIANYAR').replace(/[;|]/g,',').replace(/\s+/g,' ').replace(/\s*,\s*/g,', ').trim();
const cacheKey=s=>normalizeAddress(s);
const readJSON=(k,f)=>{try{return JSON.parse(localStorage.getItem(k)||'null')??f;}catch{return f;}};
let vehicles=readJSON(DATA_KEY,null)||readJSON('vehicleMapDataV3',null)||[...(window.DEFAULT_VEHICLES||[])];
vehicles=vehicles.map(v=>{const phone=getPhoneRaw(v);return phone&&!v.TELEPHONE_CP?{...v,TELEPHONE_CP:phone}:v;});
let followUps=readJSON(FOLLOW_UP_KEY,{}),activeFollowUpVehicle=null,selectedFollowUps=new Set(),batchQueue=[],batchIndex=0;
let geoCache=readJSON(GEO_KEY,null)||readJSON('vehicleMapGeocodeCacheV3',{})||{},filteredVehicles=[],stopRequested=false,markers=[],editingVehicle=null,manualMode=false,manualPreview=null;
const safeStore=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(err){console.warn('Penyimpanan lokal gagal:',err);const status=document.getElementById('status');if(status)status.textContent='Penyimpanan HP penuh/terblokir. Peta tetap dapat digunakan.';return false;}};
async function saveLarge(key,value){try{if(!window.BigStore)throw new Error('Penyimpanan data besar tidak tersedia');await BigStore.set(key,value);return true;}catch(err){console.warn('IndexedDB gagal:',err);$('status').textContent='Penyimpanan data besar gagal. Periksa izin penyimpanan browser.';return false;}}
async function saveData(){const saved=await saveLarge('vehicles',vehicles);window.CloudSync?.queue('vehicles');return saved;}
async function saveGeo(){const saved=await saveLarge('geoCache',geoCache);window.CloudSync?.queue('geoCache');return saved;}
async function saveFollowUps(){invalidateFollowUpLookup();const text=JSON.stringify(followUps);if(text.length<1500000)safeStore(FOLLOW_UP_KEY,followUps);const saved=await saveLarge('followUps',followUps);window.CloudSync?.queue('followUps');return saved;}
async function loadLargeStoreData(){
  if(!window.BigStore)return;
  try{
    const [savedVehicles,savedGeo,savedFollowUps]=await Promise.all([BigStore.get('vehicles'),BigStore.get('geoCache'),BigStore.get('followUps')]);
    if(Array.isArray(savedVehicles))vehicles=savedVehicles;else if(await saveData()){localStorage.removeItem(DATA_KEY);localStorage.removeItem('vehicleMapDataV3');}
    if(savedGeo&&typeof savedGeo==='object')geoCache=savedGeo;else if(await saveGeo()){localStorage.removeItem(GEO_KEY);localStorage.removeItem('vehicleMapGeocodeCacheV3');}
    if(savedFollowUps&&typeof savedFollowUps==='object'){followUps=savedFollowUps;invalidateFollowUpLookup();}else await saveFollowUps();
    vehicles=vehicles.map(v=>{const phone=getPhoneRaw(v);return phone&&!v.TELEPHONE_CP?{...v,TELEPHONE_CP:phone}:v;});const recovered=reconcileFollowUps();if(recovered)await saveFollowUps();
    hydrateCoordinates();buildAdvisorFilter();buildRegionFilters();applyFilter();
    navigator.storage?.persist?.().catch(()=>{});const estimate=await BigStore.estimate().catch(()=>({})),used=estimate.usage?Math.round(estimate.usage/1048576):0,quota=estimate.quota?Math.round(estimate.quota/1048576):0;
    $('status').textContent=`Versi ${APP_VERSION} · ${vehicles.length.toLocaleString('id-ID')} data siap${recovered?` · ${recovered} status follow up dipulihkan`:''}${quota?` · Penyimpanan ${used} MB dari ${quota} MB`:''}`;
  }catch(err){console.warn(err);$('status').textContent='Penyimpanan besar tidak dapat dibuka. Data bawaan tetap ditampilkan.';}
}
const identityText=s=>String(s||'').toLocaleUpperCase('id-ID').replace(/[^A-Z0-9]/g,'');
const primaryFollowUpKey=v=>{const frame=normalizeFrame(v?.['NO RANGKA']||v?.NO_RANGKA||v?.CHASSIS_NO),plate=normalizePlate(v?.POLICE_NO);return frame?`F:${frame}`:`P:${plate}`;};
const followUpKey=v=>primaryFollowUpKey(v);
let followUpLookupCache=null;
function invalidateFollowUpLookup(){followUpLookupCache=null;}
function buildFollowUpLookup(){
  const byPlate=new Map(),byFrame=new Map(),byCustomerModel=new Map(),vehicleIdentityCount=new Map(),addUnique=(map,key,value)=>{if(!key)return;if(!map.has(key))map.set(key,value);else if(map.get(key)!==value)map.set(key,null);};
  vehicles.forEach(v=>{const k=`${identityText(v?.CUSTOMER)}|${identityText(v?.MODEL)}`;vehicleIdentityCount.set(k,(vehicleIdentityCount.get(k)||0)+1);});
  Object.entries(followUps).forEach(([key,record])=>{addUnique(byPlate,normalizePlate(record?.plate),key);addUnique(byFrame,normalizeFrame(record?.frame||record?.noRangka),key);const cm=`${identityText(record?.customer)}|${identityText(record?.model)}`;if(vehicleIdentityCount.get(cm)===1)addUnique(byCustomerModel,cm,key);});
  return followUpLookupCache={byPlate,byFrame,byCustomerModel};
}
function followUpEntry(v){
  const frame=normalizeFrame(v?.['NO RANGKA']||v?.NO_RANGKA||v?.CHASSIS_NO),plate=normalizePlate(v?.POLICE_NO),direct=[frame&&`F:${frame}`,plate&&`P:${plate}`,plate].filter(Boolean);
  for(const key of direct)if(followUps[key])return{key,record:followUps[key]};
  const lookup=followUpLookupCache||buildFollowUpLookup(),candidate=(frame&&lookup.byFrame.get(frame))||(plate&&lookup.byPlate.get(plate))||lookup.byCustomerModel.get(`${identityText(v?.CUSTOMER)}|${identityText(v?.MODEL)}`);
  return candidate&&followUps[candidate]?{key:candidate,record:followUps[candidate]}:null;
}
const getFollowUp=v=>followUpEntry(v)?.record;
function reconcileFollowUps(){let recovered=0;vehicles.forEach(v=>{const entry=followUpEntry(v),primary=primaryFollowUpKey(v);if(entry&&!followUps[primary]){followUps[primary]={...entry.record,plate:v.POLICE_NO||entry.record.plate||'',frame:v['NO RANGKA']||v.NO_RANGKA||v.CHASSIS_NO||entry.record.frame||'',customer:v.CUSTOMER||entry.record.customer||'',model:v.MODEL||entry.record.model||''};if(entry.key!==primary)delete followUps[entry.key];recovered++;}});if(recovered)invalidateFollowUpLookup();return recovered;}
const followUpStatusLabel=s=>({BELUM:'Belum Follow Up',SUDAH:'Sudah Follow Up',TERKIRIM:'WA Dibuka (Otomatis)',CENTANG_SATU:'Centang Satu',BELUM_DIBACA:'Centang Dua - Belum Dibaca',DIBACA:'Dibaca - Tidak Dibalas',DIBALAS:'Sudah Dibalas',NOMOR_TIDAK_AKTIF:'Nomor Tidak Aktif',TIDAK_ADA_WHATSAPP:'Tidak Ada WhatsApp',BOOKING:'Booking',TIDAK_TERHUBUNG:'Tidak Terhubung',FOLLOW_UP_ULANG:'Follow Up Ulang',SELESAI:'Selesai'}[s]||s||'Belum Follow Up');
const followUpReasonLabel=s=>({REMINDER_SERVICE:'Reminder service berkala',PESAN_CENTANG_SATU:'Pesan centang satu',PESAN_CENTANG_DUA:'Pesan centang dua tetapi belum dibaca',DIBACA_TIDAK_DIBALAS:'Pesan dibaca tetapi tidak dibalas',CUSTOMER_MEMBALAS:'Customer membalas pesan',CUSTOMER_SIBUK:'Customer sedang sibuk',TIDAK_DIANGKAT:'Telepon tidak diangkat',NOMOR_TIDAK_AKTIF:'Nomor tidak aktif',TIDAK_ADA_WHATSAPP:'Nomor tidak ada WhatsApp',SUDAH_SERVICE:'Sudah melakukan service',SERVICE_DI_TEMPAT_LAIN:'Service di tempat lain',KENDARAAN_DIJUAL:'Kendaraan sudah dijual',PINDAH_DOMISILI:'Customer pindah domisili',MENUNGGU_KONFIRMASI:'Menunggu konfirmasi customer',JANJI_SERVICE:'Customer janji datang service',BELUM_BERSEDIA:'Customer belum bersedia service',LAINNYA:'Lainnya'}[s]||s||'-');
const formatFollowUpDate=s=>s?String(s).split('-').reverse().join('/'):'-';
function followUpPopupHtml(v){const f=getFollowUp(v);if(!f)return '<div class="follow-up-status-box"><b>Status Follow Up:</b> Belum ada data</div>';return `<div class="follow-up-status-box"><b>Status:</b> ${esc(followUpStatusLabel(f.status))}<br><b>Reason:</b> ${esc(followUpReasonLabel(f.reason))}<br><b>Tanggal:</b> ${esc(formatFollowUpDate(f.date))}<br><b>Next:</b> ${esc(formatFollowUpDate(f.nextDate))}</div>`;}


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
const REGION_COORD_BOUNDS={
  Denpasar:[-8.80,-8.50,115.05,115.34],Gianyar:[-8.76,-8.05,115.15,115.58],Badung:[-8.92,-8.05,114.95,115.33],
  Tabanan:[-8.88,-8.05,114.70,115.27],Jembrana:[-8.68,-8.00,114.35,114.98],Buleleng:[-8.45,-7.95,114.35,115.55],
  Bangli:[-8.62,-8.02,115.16,115.58],Klungkung:[-8.92,-8.30,115.25,115.75],Karangasem:[-8.68,-8.00,115.35,115.78]
};
const REGION_PLACE_HINTS=[
  {regency:'Gianyar',district:'Blahbatuh',words:['KERAMAS','MEDAHAN','BONA','BELEGA','BURUAN','SABA']},
  {regency:'Denpasar',district:'Denpasar Utara',words:['ANTASURA','PEGUYANGAN KANGIN','PEGUYANGAN']}
];
function inferRegion(v){
  const explicitRegency=String(v.REGENCY||v.KABUPATEN||v.KABUPATEN_KOTA||'').trim();
  const explicitDistrict=String(v.DISTRICT||v.KECAMATAN||'').trim();
  if(explicitRegency||explicitDistrict)return{regency:explicitRegency||'Belum diketahui',district:explicitDistrict||'Belum diketahui',source:'data'};
  const hay=normalizeAddress([v.ADDRESS,v.GEOCODED_ADDRESS,v.CLEANED_ADDRESS].filter(Boolean).join(' '));
  const placeHint=REGION_PLACE_HINTS.find(r=>r.words.some(w=>hay.includes(w)));
  if(placeHint)return{regency:placeHint.regency,district:placeHint.district,source:'desa'};
  const found=REGION_RULES.find(r=>r.words.some(w=>hay.includes(w)));
  if(found)return{regency:found.regency,district:found.district,source:'alamat'};
  return{regency:'Belum diketahui',district:'Belum diketahui',source:'unknown'};
}
function coordinateMatchesRegion(v,lat,lng,displayName=''){
  lat=Number(lat);lng=Number(lng);if(!Number.isFinite(lat)||!Number.isFinite(lng))return false;
  const region=inferRegion(v),bounds=REGION_COORD_BOUNDS[region.regency];if(!bounds)return true;
  const inside=lat>=bounds[0]&&lat<=bounds[1]&&lng>=bounds[2]&&lng<=bounds[3];if(!inside)return false;
  const text=normalizeAddress(displayName),conflicting=Object.keys(REGION_COORD_BOUNDS).find(name=>name!==region.regency&&text.includes(normalizeAddress(name)));if(conflicting)return false;return !text||text.includes(normalizeAddress(region.regency))||inside;
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
function currentFollowUpStatus(v){return getFollowUp(v)?.status||'BELUM';}
function updateSelectionUi(){
  if($('selectedCount'))$('selectedCount').textContent=`${selectedFollowUps.size} dipilih`;
  if($('filteredCount'))$('filteredCount').textContent=`${filteredVehicles.length} data`;
}
const DEFAULT_WA_TEMPLATES=[
  {id:'reminder-service',name:'Reminder Service Berkala',category:'REMINDER',active:true,message:'Selamat pagi Bapak/Ibu {nama}.\n\nKami dari Agung Toyota ingin mengingatkan bahwa kendaraan {model} dengan nomor polisi {plat} sudah waktunya melakukan service berkala.\n\nApakah kami dapat membantu membuatkan booking service?\n\nTerima kasih.'},
  {id:'promo-service',name:'Promo Service',category:'PROMO',active:true,message:'Selamat pagi Bapak/Ibu {nama}.\n\nSaat ini tersedia promo service untuk kendaraan {model} nomor polisi {plat}. Silakan balas pesan ini untuk mendapatkan informasi promo dan jadwal booking.\n\nTerima kasih.'},
  {id:'promo-oli',name:'Promo Ganti Oli',category:'PROMO',active:true,message:'Selamat pagi Bapak/Ibu {nama}.\n\nAda promo ganti oli untuk kendaraan {model} dengan nomor polisi {plat}. Kami siap membantu pengecekan dan booking service.\n\nTerima kasih.'},
  {id:'follow-up-booking',name:'Follow Up Booking',category:'REMINDER',active:true,message:'Selamat pagi Bapak/Ibu {nama}.\n\nKami ingin menindaklanjuti kebutuhan service kendaraan {model} nomor polisi {plat}. Kapan waktu yang paling nyaman untuk melakukan booking service?\n\nTerima kasih.'}
];
let waTemplates=readJSON(WA_TEMPLATE_KEY,null)||DEFAULT_WA_TEMPLATES.map(x=>({...x}));
let activeWaTemplateId=localStorage.getItem(WA_ACTIVE_TEMPLATE_KEY)||waTemplates[0]?.id||'';
let editingTemplateId='',waComposerVehicle=null,waComposerBatchMode=false;
const saveWaTemplates=(withBackup=true)=>{if(withBackup){const old=readJSON(WA_TEMPLATE_KEY,null);if(old)safeStore(WA_TEMPLATE_BACKUP_KEY,old);}const saved=safeStore(WA_TEMPLATE_KEY,waTemplates);window.CloudSync?.queue('settings');return saved;};
function makeTemplateId(){return 'tpl-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);}
function activeWaTemplates(){return waTemplates.filter(x=>x.active!==false);}
function getActiveWaTemplate(){return waTemplates.find(x=>x.id===activeWaTemplateId&&x.active!==false)||activeWaTemplates()[0]||waTemplates[0];}
function templateValues(v){const region=inferRegion(v||{});return {nama:v?.CUSTOMER||'Bapak/Ibu',plat:v?.POLICE_NO||'kendaraan Anda',model:v?.MODEL||'kendaraan',tahun:v?.YEAR||v?.TAHUN||'-',km:v?.KM||v?.ODOMETER||'-',sa:v?.SERVICE_ADVISOR||v?.SA||'-',alamat:v?.ADDRESS||'-',telepon:v?.PHONE||v?.WA_CP||v?.MOBILE_PHONE||'-',no_rangka:v?.['NO RANGKA']||v?.NO_RANGKA||v?.CHASSIS_NO||'-',service_terakhir:v?.['LAST SERVICE']||v?.LAST_SERVICE_DATE||v?.REPAIR_DATE||'-',jatuh_tempo:v?.DUE_DATE||v?.NEXT_SERVICE_DATE||'-',repair_type:v?.REPAIR_TYPE||v?.JOB||'-',kabupaten:region.regency||'-',kecamatan:region.district||'-',dealer:'Agung Toyota',tanggal:new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'})};}
function renderTemplateMessage(message,v){const values=templateValues(v);return String(message||'').replace(/\{(nama|plat|model|tahun|km|sa|alamat|telepon|no_rangka|service_terakhir|jatuh_tempo|repair_type|kabupaten|kecamatan|dealer|tanggal)\}/gi,(m,k)=>values[k.toLowerCase()]??m);}
function waMessage(v,templateId=activeWaTemplateId){const t=waTemplates.find(x=>x.id===templateId)||getActiveWaTemplate();return renderTemplateMessage(t?.message||DEFAULT_WA_TEMPLATES[0].message,v);}
function refreshTemplateSelectors(){
  const active=activeWaTemplates();if(!active.some(x=>x.id===activeWaTemplateId)&&active[0])activeWaTemplateId=active[0].id;
  localStorage.setItem(WA_ACTIVE_TEMPLATE_KEY,activeWaTemplateId||'');
  const options=active.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
  if($('quickTemplateSelect')){$('quickTemplateSelect').innerHTML=options||'<option>Belum ada template aktif</option>';$('quickTemplateSelect').value=activeWaTemplateId;}
  if($('waComposerTemplate')){$('waComposerTemplate').innerHTML=options;$('waComposerTemplate').value=activeWaTemplateId;}
  if($('activeTemplateBadge'))$('activeTemplateBadge').textContent=getActiveWaTemplate()?.name||'Belum ada';
}
function openWaComposer(v,batchMode=false){
  if(!activeWaTemplates().length)return alert('Belum ada template aktif. Aktifkan atau buat template terlebih dahulu.');
  waComposerVehicle=v;waComposerBatchMode=batchMode;refreshTemplateSelectors();
  $('waComposerVehicle').textContent=`${v.POLICE_NO||'-'} · ${v.MODEL||'-'} · ${v.CUSTOMER||'-'}`;
  $('waComposerMessage').value=waMessage(v,$('waComposerTemplate').value);$('waComposerModal').classList.remove('hidden');
}
function closeWaComposer(){waComposerVehicle=null;waComposerBatchMode=false;$('waComposerModal').classList.add('hidden');}

function markWaOpened(v){
  const key=followUpKey(v),entry=followUpEntry(v),old=entry?.record||{},today=new Date().toISOString().slice(0,10);if(entry&&entry.key!==key)delete followUps[entry.key];
  const manualStatus=old.status&&old.status!=='BELUM'&&old.status!=='TERKIRIM',currentStatus=manualStatus?old.status:'TERKIRIM';
  const rec={...old,plate:v.POLICE_NO||'',frame:v['NO RANGKA']||v.NO_RANGKA||v.CHASSIS_NO||'',customer:v.CUSTOMER||'',model:v.MODEL||'',status:currentStatus,date:old.date||today,reason:old.reason||'REMINDER_SERVICE',nextDate:old.nextDate||'',note:old.note||'WhatsApp dibuka dari antrean follow up.',updatedAt:new Date().toISOString()};
  rec.history=[...(old.history||[]),{status:'TERKIRIM',date:today,reason:rec.reason,nextDate:rec.nextDate,note:'WhatsApp dibuka dari antrean follow up.',savedAt:rec.updatedAt}];
  followUps[key]=rec;saveFollowUps();
}
window.openSingleWa=key=>{const v=vehicles.find(x=>followUpKey(x)===key);if(!v)return alert('Data kendaraan tidak ditemukan.');const phone=getPhone(v);if(!phone)return alert('Nomor WhatsApp belum tersedia.');openWaComposer(v,false);};
function openNextBatchWa(){
  while(batchIndex<batchQueue.length&&!getPhone(batchQueue[batchIndex]))batchIndex++;
  if(batchIndex>=batchQueue.length){$('status').textContent='Antrean WhatsApp selesai. Silakan perbarui status berdasarkan hasil chat.';batchQueue=[];batchIndex=0;applyFilter();return;}
  const v=batchQueue[batchIndex++];openWaComposer(v,true);
}

const ADVISOR_COLORS=['#1769e0','#d92d20','#16a34a','#9333ea','#f59e0b','#0891b2','#db2777','#65a30d','#ea580c','#4f46e5','#0f766e','#7c2d12'];
let advisorColorMap={};
if(typeof L==='undefined'){throw new Error('Leaflet gagal dimuat. Periksa koneksi internet lalu refresh halaman.');}
const map=L.map('map',{preferCanvas:true,zoomControl:true}).setView([-8.4095,115.1889],9);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors',crossOrigin:true}).addTo(map);
const markerLayer=typeof L.markerClusterGroup==='function'?L.markerClusterGroup({chunkedLoading:true,chunkInterval:120,chunkDelay:30,removeOutsideVisibleBounds:true,showCoverageOnHover:false,maxClusterRadius:55,zoomToBoundsOnClick:false}):L.layerGroup().addTo(map);
if(typeof markerLayer.addTo==='function'&&!map.hasLayer?.(markerLayer))markerLayer.addTo(map);
let markerRenderVersion=0,markersDirty=true;

function hydrateCoordinates(){let invalid=0;vehicles.forEach(v=>{if(v.MANUAL_LOCATION&&Number.isFinite(Number(v.lat))&&Number.isFinite(Number(v.lng))){v.lat=Number(v.lat);v.lng=Number(v.lng);v.geocodeFailed=false;return;}const key=cacheKey(v.ADDRESS),c=geoCache[key],lat=c?Number(c.lat):Number(v.lat),lng=c?Number(c.lng):Number(v.lng),display=c?.displayName||v.GEOCODED_ADDRESS||'';if(Number.isFinite(lat)&&Number.isFinite(lng)&&!coordinateMatchesRegion(v,lat,lng,display)){delete v.lat;delete v.lng;delete v.GEOCODED_ADDRESS;delete v.GEOCODE_QUERY;delete geoCache[key];v.geocodeFailed=false;v.GEOCODE_PRECISION='perlu diproses ulang';v.GEO_VALIDATION='Titik lama dihapus karena berada di luar wilayah alamat.';invalid++;return;}if(c){v.lat=lat;v.lng=lng;v.geocodeFailed=false;}});if(invalid){saveData();saveGeo();setTimeout(()=>{$('status').textContent=`${invalid} titik lama di luar wilayah dihapus. Klik Proses alamat untuk mencari ulang.`;},50);}return invalid;}
async function auditCoordinatesNow(){
  const invalid=hydrateCoordinates();await Promise.all([saveData(),saveGeo()]);applyFilter();
  const message=invalid?`${invalid} titik yang tidak sesuai wilayah sudah dihapus. Sekarang klik Proses alamat untuk mencari ulang.`:'Pemeriksaan selesai. Tidak ditemukan titik di luar batas wilayah.';
  $('status').textContent=`Versi ${APP_VERSION} · ${message}`;alert(message);
}
function updateStats(){const mapped=vehicles.filter(v=>Number.isFinite(v.lat)&&Number.isFinite(v.lng)).length;const failed=vehicles.filter(v=>v.geocodeFailed===true).length;const pending=vehicles.filter(v=>v.ADDRESS&&!Number.isFinite(v.lat)&&v.geocodeFailed!==true).length;$('totalData').textContent=vehicles.length;$('mappedData').textContent=mapped;$('pendingData').textContent=pending;$('failedData').textContent=failed;}
function buildAdvisorFilter(){const current=advisorKey($('advisorFilter').value),byKey=new Map();vehicles.forEach(v=>{const name=advisorName(v.SERVICE_ADVISOR);if(name&&!byKey.has(advisorKey(name)))byKey.set(advisorKey(name),name);});const names=[...byKey.values()].sort((a,b)=>a.localeCompare(b,'id'));advisorColorMap=Object.fromEntries(names.map(n=>[advisorKey(n),ADVISOR_COLORS[Math.abs([...advisorKey(n)].reduce((h,c)=>((h*31)+c.charCodeAt(0))|0,7))%ADVISOR_COLORS.length]]));$('advisorFilter').innerHTML='<option value="">Semua Service Advisor</option>'+names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');const selected=names.find(n=>advisorKey(n)===current)||'';$('advisorFilter').value=selected;renderLegend(names);window.renderDashboard?.();}
const advisorColor=name=>advisorColorMap[advisorKey(name)]||'#64748b';
function markerIcon(name){const color=advisorColor(name);return L.divIcon({className:'advisor-marker-wrap',html:`<div class="advisor-marker" style="--marker-color:${color}"><span></span></div>`,iconSize:[34,44],iconAnchor:[17,43],popupAnchor:[0,-40]});}
function renderLegend(names){$('advisorLegend').innerHTML=names.length?names.map(n=>`<div class="legend-item"><span class="legend-dot" style="background:${advisorColor(n)}"></span><span>${esc(n)}</span></div>`).join(''):'<small>Belum ada data Service Advisor.</small>';}
function popupHtml(v){const phone=getPhone(v),q=encodeURIComponent(`${v.lat||''},${v.lng||''}`),key=esc(followUpKey(v)),r=inferRegion(v);return `<div class="popup"><h3>${esc(v.POLICE_NO||'-')} · ${esc(v.MODEL||'-')}</h3><div class="popup-grid"><b>Customer</b><span>${esc(v.CUSTOMER||'-')}</span><b>Tahun/VIN</b><span>${esc(v.VIN||'-')}</span><b>No. Rangka</b><span>${esc(v['NO RANGKA']||v.NO_RANGKA||'-')}</span><b>KM</b><span>${esc(v.KM||'-')}</span><b>Last Service</b><span>${esc(v['LAST SERVICE']||v.LAST_SERVICE_DATE||'-')}</span><b>Advisor</b><span>${esc(v.SERVICE_ADVISOR||'-')}</span><b>Kontak</b><span>${esc(v.contact_person||'-')}</span><b>Telepon</b><span>${esc(getPhoneRaw(v)||'-')}</span><b>Alamat</b><span>${esc(v.ADDRESS||'-')}</span><b>Kabupaten</b><span>${esc(r.regency)}</span><b>Kecamatan</b><span>${esc(r.district)}</span>${v.GEOCODE_PRECISION?`<b>Ketepatan</b><span>${esc(v.GEOCODE_PRECISION)}</span>`:''}<b>Aplikasi</b><span>Versi ${APP_VERSION}</span></div>${followUpPopupHtml(v)}<div class="popup-actions">${phone?`<button class="wa mini" onclick="openSingleWa('${key}')">WhatsApp</button>`:''}<a target="_blank" href="https://www.google.com/maps/search/?api=1&query=${q}">Buka Google Maps</a><button class="location-edit-btn mini" onclick="openLocationEditor('${key}')">Cari & Pindahkan Titik</button><button class="follow-up-popup-btn mini" onclick="openFollowUp('${key}')">Input Status WA</button><button class="danger mini" onclick="deleteOne('${esc(normalizePlate(v.POLICE_NO))}')">Hapus</button></div></div>`;}
function renderMarkers(){
  markersDirty=false;const version=++markerRenderVersion;markerLayer.clearLayers();markers=[];
  const rows=filteredVehicles.filter(v=>Number.isFinite(v.lat)&&Number.isFinite(v.lng)),bounds=rows.map(v=>[v.lat,v.lng]);let index=0;
  const addChunk=deadline=>{if(version!==markerRenderVersion)return;const batch=[];let count=0;while(index<rows.length&&count<350&&(!deadline||deadline.timeRemaining()>2)){const v=rows[index++],m=L.marker([v.lat,v.lng],{icon:markerIcon(v.SERVICE_ADVISOR)}).bindPopup(()=>popupHtml(v));m.vehicle=v;markers.push(m);batch.push(m);count++;}if(batch.length)markerLayer.addLayers?markerLayer.addLayers(batch):batch.forEach(m=>markerLayer.addLayer(m));if(index<rows.length){(window.requestIdleCallback||((fn)=>setTimeout(()=>fn({timeRemaining:()=>8}),0)))(addChunk);}else{if(bounds.length===1)map.setView(bounds[0],15);else if(bounds.length>1)map.fitBounds(bounds,{padding:[25,25]});$('status').textContent=`${rows.length.toLocaleString('id-ID')} marker ditampilkan dalam kelompok.`;}};
  addChunk({timeRemaining:()=>8});
}

// ===== V13.6 Daftar kendaraan di dalam cluster =====
let activeCluster=null,clusterMarkers=[],clusterFilteredMarkers=[],clusterPage=1;
const CLUSTER_PAGE_SIZE=100;
function clusterVehicleText(marker){const v=marker.vehicle||{};return [v.POLICE_NO,v.CUSTOMER,v.MODEL,v.SERVICE_ADVISOR,v.ADDRESS,v['NO RANGKA']].join(' ').toLocaleLowerCase('id-ID');}
function renderClusterVehicles(){
  const total=clusterFilteredMarkers.length,pages=Math.max(1,Math.ceil(total/CLUSTER_PAGE_SIZE));clusterPage=Math.max(1,Math.min(clusterPage,pages));const start=(clusterPage-1)*CLUSTER_PAGE_SIZE,visible=clusterFilteredMarkers.slice(start,start+CLUSTER_PAGE_SIZE);
  $('clusterSummary').textContent=total===clusterMarkers.length?`${total.toLocaleString('id-ID')} kendaraan`:`${total.toLocaleString('id-ID')} dari ${clusterMarkers.length.toLocaleString('id-ID')} kendaraan`;
  $('clusterVehicleList').innerHTML=visible.length?visible.map((marker,i)=>{const v=marker.vehicle||{},r=inferRegion(v);return `<button class="cluster-vehicle-item" data-i="${start+i}" type="button"><i class="cluster-dot" style="--vehicle-color:${advisorColor(v.SERVICE_ADVISOR)}"></i><span class="cluster-vehicle-main"><b>${esc(v.POLICE_NO||'-')} · ${esc(v.MODEL||'-')}</b><span>${esc(v.CUSTOMER||'-')} · SA: ${esc(v.SERVICE_ADVISOR||'-')}</span><span>${esc(v.ADDRESS||'-')}</span></span><strong>${esc(r.district||'-')}</strong></button>`;}).join(''):'<div class="cluster-empty">Kendaraan tidak ditemukan.</div>';
  $('clusterVehicleList').querySelectorAll('.cluster-vehicle-item').forEach(el=>el.onclick=()=>openVehicleFromCluster(clusterFilteredMarkers[Number(el.dataset.i)]));
  $('clusterPageInfo').textContent=`Halaman ${clusterPage} / ${pages}`;$('clusterPrevBtn').disabled=clusterPage<=1;$('clusterNextBtn').disabled=clusterPage>=pages;
}
function openClusterVehicles(cluster){
  if(!cluster||typeof cluster.getAllChildMarkers!=='function')return;activeCluster=cluster;clusterMarkers=cluster.getAllChildMarkers().filter(m=>m.vehicle).sort((a,b)=>String(a.vehicle.POLICE_NO||'').localeCompare(String(b.vehicle.POLICE_NO||''),'id'));clusterFilteredMarkers=[...clusterMarkers];clusterPage=1;$('clusterSearchInput').value='';renderClusterVehicles();$('clusterModal').classList.remove('hidden');
}
function closeClusterVehicles(){$('clusterModal').classList.add('hidden');activeCluster=null;clusterMarkers=[];clusterFilteredMarkers=[];clusterPage=1;}
function openVehicleFromCluster(marker){
  if(!marker||!marker.vehicle)return;const v=marker.vehicle;closeClusterVehicles();map.setView([Number(v.lat),Number(v.lng)],Math.max(18,map.getZoom()));setTimeout(()=>{if(typeof markerLayer.zoomToShowLayer==='function')markerLayer.zoomToShowLayer(marker,()=>marker.openPopup());else marker.openPopup();},120);
}
if(typeof markerLayer.on==='function'&&typeof L.markerClusterGroup==='function')markerLayer.on('clusterclick',e=>{if(e.originalEvent)L.DomEvent.stop(e.originalEvent);openClusterVehicles(e.layer);});
$('clusterSearchInput').oninput=()=>{const q=$('clusterSearchInput').value.trim().toLocaleLowerCase('id-ID');clusterFilteredMarkers=q?clusterMarkers.filter(m=>clusterVehicleText(m).includes(q)):[...clusterMarkers];clusterPage=1;renderClusterVehicles();};
$('clusterPrevBtn').onclick=()=>{if(clusterPage>1){clusterPage--;renderClusterVehicles();}};$('clusterNextBtn').onclick=()=>{const pages=Math.ceil(clusterFilteredMarkers.length/CLUSTER_PAGE_SIZE);if(clusterPage<pages){clusterPage++;renderClusterVehicles();}};
$('zoomClusterBtn').onclick=()=>{if(!activeCluster)return closeClusterVehicles();const bounds=activeCluster.getBounds?.();closeClusterVehicles();if(bounds?.isValid?.())map.fitBounds(bounds,{padding:[35,35],maxZoom:18});};
$('closeClusterBtn').onclick=closeClusterVehicles;$('cancelClusterBtn').onclick=closeClusterVehicles;$('clusterModal').onclick=e=>{if(e.target===$('clusterModal'))closeClusterVehicles();};
let listPage=1;
function renderList(){const list=$('vehicleList'),size=Number($('listPageSize')?.value||100),pages=Math.max(1,Math.ceil(filteredVehicles.length/size));listPage=Math.min(Math.max(1,listPage),pages);const start=(listPage-1)*size,visible=filteredVehicles.slice(start,start+size);list.innerHTML=visible.map(v=>{const key=normalizePlate(v.POLICE_NO),status=currentFollowUpStatus(v),unknown=v._district==='Belum diketahui',phone=getPhone(v);return `<div class="vehicle-item"><input class="vehicle-check" type="checkbox" data-key="${esc(key)}" ${selectedFollowUps.has(key)?'checked':''}><div class="vehicle-content" data-plate="${esc(key)}"><div class="vehicle-title"><span class="legend-dot" style="background:${advisorColor(v.SERVICE_ADVISOR)}"></span><b>${esc(v.POLICE_NO||'-')} · ${esc(v.MODEL||'-')}</b></div><span>${esc(v.CUSTOMER||'-')}</span><span>SA: ${esc(advisorName(v.SERVICE_ADVISOR)||'-')}</span><span>${esc(v.ADDRESS||'-')}</span><div class="region-row"><span class="region-badge regency">${esc(v._regency)}</span><span class="region-badge ${unknown?'unknown':''}">${esc(v._district)}</span><span class="status-badge status-${esc(status)}">${esc(followUpStatusLabel(status))}</span></div>${v.GEOCODE_PRECISION?`<span>Ketepatan: ${esc(v.GEOCODE_PRECISION)}</span>`:''}<div class="vehicle-follow-actions">${phone?`<button type="button" class="vehicle-wa-btn" data-wa="${esc(key)}">WhatsApp</button>`:''}<button type="button" class="vehicle-reason-btn" data-follow="${esc(key)}">Ubah Status</button></div></div></div>`}).join('')||'<small>Tidak ada data.</small>';list.querySelectorAll('.vehicle-content').forEach(el=>el.onclick=e=>{if(e.target.closest('button'))return;document.body.classList.contains('view-followup')?window.openFollowUp(el.dataset.plate):focusVehicle(el.dataset.plate);});list.querySelectorAll('.vehicle-wa-btn').forEach(el=>el.onclick=e=>{e.stopPropagation();window.openSingleWa(el.dataset.wa);});list.querySelectorAll('.vehicle-reason-btn').forEach(el=>el.onclick=e=>{e.stopPropagation();window.openFollowUp(el.dataset.follow);});list.querySelectorAll('.vehicle-check').forEach(el=>el.onchange=()=>{el.checked?selectedFollowUps.add(el.dataset.key):selectedFollowUps.delete(el.dataset.key);updateSelectionUi();});$('listPageInfo').textContent=`Halaman ${listPage} / ${pages} · ${filteredVehicles.length.toLocaleString('id-ID')} data`;$('listPrevBtn').disabled=listPage<=1;$('listNextBtn').disabled=listPage>=pages;updateSelectionUi();}
function focusVehicle(key){const v=vehicles.find(x=>normalizePlate(x.POLICE_NO)===key);if(!v)return;if(!Number.isFinite(v.lat))return openAddressEditor(v);map.setView([v.lat,v.lng],16);const m=markers.find(x=>x.vehicle===v);if(m){if(typeof markerLayer.zoomToShowLayer==='function')markerLayer.zoomToShowLayer(m,()=>m.openPopup());else m.openPopup();}}
let searchIndexCache=new WeakMap();
const searchText=v=>{let text=searchIndexCache.get(v);if(!text){text=[v.POLICE_NO,v.CUSTOMER,v.MODEL,v.SERVICE_ADVISOR,v.ADDRESS,v['NO RANGKA'],v.VIN,getPhoneRaw(v)].join(' ').toLocaleLowerCase('id-ID');searchIndexCache.set(v,text);}return text;};
function applyFilter(resetPage=true){enrichRegions();const q=$('searchInput').value.trim().toLocaleLowerCase('id-ID'),adv=$('advisorFilter').value,reg=$('regencyFilter')?.value||'',dist=$('districtFilter')?.value||'',fu=$('followUpStatusFilter')?.value||'';filteredVehicles=vehicles.filter(v=>(!q||searchText(v).includes(q))&&(!adv||advisorKey(v.SERVICE_ADVISOR)===advisorKey(adv))&&(!reg||v._regency===reg)&&(!dist||v._district===dist)&&(!fu||currentFollowUpStatus(v)===fu));if(resetPage)listPage=1;renderList();markersDirty=true;if(document.body.classList.contains('view-map'))renderMarkers();updateStats();updateWaReviewQueueCount();window.renderDashboard?.();}
// ===== Smart import Excel: posisi kolom bebas, kolom tambahan diabaikan =====
const IMPORT_FIELDS=['POLICE_NO','CUSTOMER','MODEL','VIN','KM','LAST SERVICE','NO RANGKA','SERVICE_ADVISOR','contact_person','TELEPHONE_CP','ADDRESS'];
const HEADER_ALIASES={
  POLICE_NO:['POLICE_NO','POLICE NO','NO POLISI','NOPOL','PLAT','PLAT NOMOR','NOMOR POLISI'],
  CUSTOMER:['CUSTOMER','CUSTOMER NAME','CUST NAME','NAMA CUSTOMER','NAMA PELANGGAN'],
  MODEL:['MODEL','MODEL TYPE','TIPE','TIPE KENDARAAN','JENIS KENDARAAN'],
  VIN:['VIN','YEAR','TAHUN','TAHUN KENDARAAN'],
  KM:['KM','KILOMETER','ODOMETER','LAST KM'],
  'LAST SERVICE':['LAST SERVICE','LAST_SERVICE','LAST SERVICE DATE','LAST_SERVICE_DATE','TANGGAL SERVICE','SERVICE TERAKHIR','REPAIR DATE'],
  'NO RANGKA':['NO RANGKA','NO_RANGKA','NOMOR RANGKA','CHASSIS NO','CHASSIS_NO','NO CHASSIS','FRAME NO','FRAME_NO'],
  SERVICE_ADVISOR:['SERVICE_ADVISOR','SERVICE ADVISOR','SA','ADVISOR'],
  contact_person:['CONTACT_PERSON','CONTACT PERSON','CONTACTPERSON','PIC','NAMA KONTAK'],
  TELEPHONE_CP:['TELEPHONE_CP','TELEPHONE CP','PHONE','NO HP','NOMOR HP','WHATSAPP','WA','WA CP','MOBILE PHONE'],
  ADDRESS:['ADDRESS','ALAMAT','CUSTOMER ADDRESS','ALAMAT CUSTOMER']
};
function normalizeHeaderName(value){return String(value??'').trim().toUpperCase().replace(/[._-]+/g,' ').replace(/\s+/g,' ');}
const HEADER_LOOKUP=(()=>{const out={};Object.entries(HEADER_ALIASES).forEach(([field,names])=>names.forEach(name=>out[normalizeHeaderName(name)]=field));return out;})();
function cellText(value){
  if(value===null||value===undefined)return '';
  if(value instanceof Date&&!isNaN(value))return value.toLocaleDateString('id-ID',{day:'2-digit',month:'2-digit',year:'numeric'});
  return String(value).trim();
}
function normalizeRow(r){
  const obj=Object.fromEntries(IMPORT_FIELDS.map(field=>[field,'']));
  Object.keys(r||{}).forEach(originalHeader=>{const field=HEADER_LOOKUP[normalizeHeaderName(originalHeader)];if(field)obj[field]=cellText(r[originalHeader]);});
  return obj;
}
function normalizeFrame(value){return String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
function hasValue(value){return String(value??'').trim()!=='';}
function mergeVehicle(oldRow,newRow){
  const merged={...oldRow};
  IMPORT_FIELDS.forEach(field=>{if(hasValue(newRow[field]))merged[field]=newRow[field];else if(!(field in merged))merged[field]='';});
  // Alamat yang berubah harus dicari ulang agar titik peta tidak memakai alamat lama.
  if(!oldRow.MANUAL_LOCATION&&hasValue(newRow.ADDRESS)&&normalizeAddress(newRow.ADDRESS)!==normalizeAddress(oldRow.ADDRESS||'')){
    delete merged.lat;delete merged.lng;delete merged.GEOCODED_ADDRESS;delete merged.GEOCODE_QUERY;delete merged.GEOCODE_PRECISION;
    merged.geocodeFailed=false;
  }
  return merged;
}
async function importFile(file){
  $('status').textContent='Membaca file dan menyiapkan data besar...';await sleep(20);
  const buf=await file.arrayBuffer();
  const wb=XLSX.read(buf,{type:'array',cellDates:true});
  const ws=wb.Sheets[wb.SheetNames[0]];
  const rawRows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false,dateNF:'dd/mm/yyyy'});
  const rows=rawRows.map(normalizeRow).filter(row=>IMPORT_FIELDS.some(field=>hasValue(row[field])));
  const frameIndex=new Map(),plateIndex=new Map(),customerModelIndex=new Map(),addUniqueIndex=(map,key,index)=>{if(!key)return;if(!map.has(key))map.set(key,index);else if(map.get(key)!==index)map.set(key,-1);};
  vehicles.forEach((v,i)=>{const frame=normalizeFrame(v['NO RANGKA']||v.NO_RANGKA||v.CHASSIS_NO),plate=normalizePlate(v.POLICE_NO),cm=`${identityText(v.CUSTOMER)}|${identityText(v.MODEL)}`;if(frame&&!frameIndex.has(frame))frameIndex.set(frame,i);if(plate&&!plateIndex.has(plate))plateIndex.set(plate,i);addUniqueIndex(customerModelIndex,cm,i);});
  let added=0,updated=0,unchanged=0;
  for(let rowNumber=0;rowNumber<rows.length;rowNumber++){
    const row=rows[rowNumber];row.SERVICE_ADVISOR=advisorName(row.SERVICE_ADVISOR);
    const plateKey=normalizePlate(row.POLICE_NO),frameKey=normalizeFrame(row['NO RANGKA']);
    let index=-1;
    if(frameKey&&frameIndex.has(frameKey))index=frameIndex.get(frameKey);
    if(index<0&&plateKey&&plateIndex.has(plateKey))index=plateIndex.get(plateKey);
    const customerModelKey=`${identityText(row.CUSTOMER)}|${identityText(row.MODEL)}`,customerModelMatch=customerModelIndex.get(customerModelKey);if(index<0&&Number.isInteger(customerModelMatch)&&customerModelMatch>=0)index=customerModelMatch;
    if(index>=0){
      const before=JSON.stringify(vehicles[index]);
      vehicles[index]=mergeVehicle(vehicles[index],row);
      const mergedFrame=normalizeFrame(vehicles[index]['NO RANGKA']||vehicles[index].NO_RANGKA||vehicles[index].CHASSIS_NO),mergedPlate=normalizePlate(vehicles[index].POLICE_NO);if(mergedFrame)frameIndex.set(mergedFrame,index);if(mergedPlate)plateIndex.set(mergedPlate,index);addUniqueIndex(customerModelIndex,`${identityText(vehicles[index].CUSTOMER)}|${identityText(vehicles[index].MODEL)}`,index);
      JSON.stringify(vehicles[index])===before?unchanged++:updated++;
    }else{
      index=vehicles.length;vehicles.push({...Object.fromEntries(IMPORT_FIELDS.map(field=>[field,''])),...row});if(frameKey)frameIndex.set(frameKey,index);if(plateKey)plateIndex.set(plateKey,index);addUniqueIndex(customerModelIndex,customerModelKey,index);added++;
    }
    if((rowNumber+1)%1000===0){$('status').textContent=`Memproses ${(rowNumber+1).toLocaleString('id-ID')} / ${rows.length.toLocaleString('id-ID')} data...`;await sleep(0);}
  }
  searchIndexCache=new WeakMap();invalidateFollowUpLookup();const recovered=reconcileFollowUps();await Promise.all([saveData(),recovered?saveFollowUps():Promise.resolve()]);hydrateCoordinates();buildAdvisorFilter();buildRegionFilters();applyFilter();
  $('status').textContent=`Upload selesai: ${added} data baru, ${updated} data diperbarui, ${unchanged} data sama.${recovered?` ${recovered} status follow up lama dipulihkan.`:''} Kolom tambahan diabaikan.`;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function geocodeAddress(address){
  let lastError=null;
  for(let attempt=0;attempt<5;attempt++){
    if(stopRequested)return null;
    try{
      const res=await fetch(`/api/geocode?address=${encodeURIComponent(address)}&attempt=${attempt}&v=13.2`),data=await res.json().catch(()=>({}));
      if(!res.ok){if(res.status===429||res.status===503){lastError=new Error(data.error||'Layanan alamat sibuk');await sleep(1800);continue;}throw new Error(data.error||'Geocoding gagal');}
      if(data.found){const candidate={ADDRESS:address};if(!coordinateMatchesRegion(candidate,Number(data.lat),Number(data.lng),data.displayName||'')){lastError=new Error('Hasil berada di luar wilayah alamat');continue;}return{lat:Number(data.lat),lng:Number(data.lng),displayName:data.displayName||'',cleanedAddress:data.cleanedAddress||normalizeAddress(address),queryUsed:data.queryUsed||'',precision:data.precision||'alamat'};}
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
  geoCache[key]={lat:r.lat,lng:r.lng,displayName:r.displayName,queryUsed:r.queryUsed,precision:r.precision,manual:false};return true;
}
$('startGeocodeBtn').onclick=async()=>{
  stopRequested=false;let cleanedCount=0;
  for(let i=0;i<vehicles.length;i++){const v=vehicles[i];if(v.ADDRESS&&!Number.isFinite(v.lat)){const r=cleanAddressSmart(v.ADDRESS);if(r.cleaned&&r.cleaned!==v.ADDRESS){v.ORIGINAL_ADDRESS=v.ORIGINAL_ADDRESS||v.ADDRESS;v.CLEANED_ADDRESS=r.cleaned;v.ADDRESS=r.cleaned;v.ADDRESS_CONFIDENCE=r.confidence;v.ADDRESS_STATUS=r.status;v.geocodeFailed=false;cleanedCount++;}}if((i+1)%500===0){$('status').textContent=`Menyiapkan alamat ${(i+1).toLocaleString('id-ID')} / ${vehicles.length.toLocaleString('id-ID')}...`;await sleep(0);}}
  searchIndexCache=new WeakMap();await saveData();const allTodo=vehicles.filter(v=>v.ADDRESS&&!Number.isFinite(v.lat)),batchValue=$('geocodeBatchSize')?.value||'250',limit=batchValue==='all'?allTodo.length:Number(batchValue),todo=allTodo.slice(0,limit),total=todo.length;let ok=0,failed=0;
  if(!total){$('status').textContent='Semua alamat sudah selesai diproses.';return;}
  for(let i=0;i<total;i++){
    if(stopRequested)break;const v=todo[i];$('status').textContent=`Proses alamat ${(i+1).toLocaleString('id-ID')} / ${total.toLocaleString('id-ID')}: ${v.POLICE_NO}`;
    try{const success=await processVehicle(v);success?ok++:failed++;}catch(e){v.geocodeFailed=true;v.GEOCODE_ERROR=e.message||'Gagal';failed++;}
    if((i+1)%10===0)updateStats();
    if((i+1)%50===0){await Promise.all([saveData(),saveGeo()]);$('status').textContent+=` · checkpoint tersimpan`;}
    if((i+1)%250===0){enrichRegions();window.renderDashboard?.();await sleep(0);}
    await sleep(1050);
  }
  await Promise.all([saveData(),saveGeo()]);applyFilter();const remaining=vehicles.filter(v=>v.ADDRESS&&!Number.isFinite(v.lat)).length;$('status').textContent=stopRequested?`Proses dihentikan dengan aman. Berhasil ${ok}, gagal ${failed}. Tersisa ${remaining.toLocaleString('id-ID')} alamat.`:`Sesi selesai: ${ok} berhasil, ${failed} gagal. Tersisa ${remaining.toLocaleString('id-ID')} alamat. ${cleanedCount} alamat diperbaiki otomatis.`;
};
function failedVehicles(){return vehicles.filter(v=>v.geocodeFailed===true);}
function renderFailedList(){const rows=failedVehicles();$('failedList').innerHTML=rows.length?rows.map(v=>`<div class="failed-item" data-plate="${esc(normalizePlate(v.POLICE_NO))}"><b>${esc(v.POLICE_NO||'-')} · ${esc(v.CUSTOMER||'-')}</b><span>${esc(v.ADDRESS||'-')}</span>${v.GEOCODE_PRECISION?`<span>Ketepatan: ${esc(v.GEOCODE_PRECISION)}</span>`:''}</div>`).join(''):'<small>Tidak ada alamat gagal.</small>';$('failedList').querySelectorAll('.failed-item').forEach(el=>el.onclick=()=>openAddressEditor(vehicles.find(v=>normalizePlate(v.POLICE_NO)===el.dataset.plate)));}
function openFailedModal(){$('addressModal').classList.remove('hidden');$('editAddressBox').classList.add('hidden');renderFailedList();}
function closeModal(){manualMode=false;editingVehicle=null;$('addressModal').classList.add('hidden');$('manualHelp').textContent='';if(manualPreview){map.removeLayer(manualPreview);manualPreview=null;}}
function openAddressEditor(v){if(!v)return;editingVehicle=v;$('addressModal').classList.remove('hidden');$('editAddressBox').classList.remove('hidden');$('editVehicleTitle').textContent=`${v.POLICE_NO||'-'} · ${v.CUSTOMER||'-'}`;$('editAddressInput').value=normalizeAddress(v.ADDRESS||'');$('manualHelp').textContent='';}
$('retryAddressBtn').onclick=async()=>{if(!editingVehicle)return;const oldKey=cacheKey(editingVehicle.ADDRESS),newAddress=$('editAddressInput').value.trim();if(!newAddress)return alert('Alamat tidak boleh kosong.');$('status').textContent='Mencari alamat yang diperbaiki...';try{const r=await geocodeAddress(newAddress);if(!r)return alert('Alamat masih belum ditemukan. Gunakan tombol Klik titik di peta.');editingVehicle.ADDRESS=newAddress;editingVehicle.lat=r.lat;editingVehicle.lng=r.lng;editingVehicle.geocodeFailed=false;editingVehicle.GEOCODED_ADDRESS=r.displayName;editingVehicle.MANUAL_LOCATION=false;delete editingVehicle.MANUAL_LOCATION_UPDATED_AT;delete geoCache[oldKey];geoCache[cacheKey(newAddress)]={lat:r.lat,lng:r.lng,displayName:r.displayName,manual:false};saveGeo();saveData();applyFilter();renderFailedList();map.setView([r.lat,r.lng],16);closeModal();$('status').textContent='Alamat berhasil diperbaiki.';}catch(e){alert(e.message);}};
$('manualPointBtn').onclick=()=>{if(!editingVehicle)return;manualMode=true;$('manualHelp').textContent='Tutup kotak ini lalu klik lokasi kendaraan pada peta.';$('addressModal').classList.add('hidden');$('status').textContent='Klik titik lokasi yang benar pada peta.';};
map.on('click',e=>{if(!manualMode||!editingVehicle)return;if(manualPreview)map.removeLayer(manualPreview);manualPreview=L.marker(e.latlng).addTo(map);if(!confirm('Gunakan titik ini untuk kendaraan '+(editingVehicle.POLICE_NO||'')+'?'))return;const newAddress=$('editAddressInput').value.trim()||editingVehicle.ADDRESS;editingVehicle.ADDRESS=newAddress;editingVehicle.lat=e.latlng.lat;editingVehicle.lng=e.latlng.lng;editingVehicle.geocodeFailed=false;editingVehicle.MANUAL_LOCATION=true;editingVehicle.MANUAL_LOCATION_UPDATED_AT=new Date().toISOString();editingVehicle.GEOCODE_PRECISION='titik manual';editingVehicle.GEOCODED_ADDRESS='Titik dipilih manual';saveData();manualMode=false;map.removeLayer(manualPreview);manualPreview=null;applyFilter();$('status').textContent='Titik manual berhasil disimpan.';});

// ===== V13.4 Cari lokasi dan pindahkan marker kendaraan =====
let locationEditVehicle=null,locationMap=null,locationMarker=null,locationResults=[];
function ensureLocationMap(){
  if(locationMap)return locationMap;
  locationMap=L.map('locationMiniMap',{preferCanvas:true,zoomControl:true}).setView([-8.4095,115.1889],9);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors',crossOrigin:true}).addTo(locationMap);
  locationMap.on('click',e=>setLocationCandidate({lat:e.latlng.lat,lng:e.latlng.lng,displayName:'Titik dipilih langsung pada peta'},-1));
  return locationMap;
}
function updateLocationMarkerText(label){
  if(!locationMarker){$('locationSelectedText').textContent='Belum dipilih';$('locationCoordinates').textContent='-';$('saveLocationBtn').disabled=true;return;}
  const p=locationMarker.getLatLng();$('locationSelectedText').textContent=label||'Titik dipilih manual';$('locationCoordinates').textContent=`Latitude ${p.lat.toFixed(7)} · Longitude ${p.lng.toFixed(7)}`;$('saveLocationBtn').disabled=false;
}
function setLocationCandidate(candidate,index=-1){
  if(!candidate||!Number.isFinite(Number(candidate.lat))||!Number.isFinite(Number(candidate.lng)))return;
  const m=ensureLocationMap(),lat=Number(candidate.lat),lng=Number(candidate.lng),label=candidate.displayName||'Titik dipilih manual';
  if(locationMarker)locationMarker.setLatLng([lat,lng]);else{locationMarker=L.marker([lat,lng],{draggable:true}).addTo(m);locationMarker.on('dragend',()=>updateLocationMarkerText('Titik digeser manual pada peta'));}
  locationMarker.locationLabel=label;m.setView([lat,lng],17);updateLocationMarkerText(label);
  document.querySelectorAll('.location-result').forEach((el,i)=>el.classList.toggle('selected',i===index));
}
function closeLocationEditor(){
  $('locationModal').classList.add('hidden');locationEditVehicle=null;locationResults=[];$('locationSearchResults').innerHTML='';$('locationSearchStatus').textContent='';
  if(locationMarker&&locationMap){locationMap.removeLayer(locationMarker);locationMarker=null;}
}
window.openLocationEditor=key=>{
  const v=vehicles.find(x=>followUpKey(x)===key)||vehicles.find(x=>normalizePlate(x.POLICE_NO)===normalizePlate(key));if(!v)return alert('Data kendaraan tidak ditemukan.');
  locationEditVehicle=v;map.closePopup();$('locationVehicleInfo').textContent=`${v.POLICE_NO||'-'} · ${v.CUSTOMER||'-'}`;$('locationSearchInput').value=v.ADDRESS||'';$('locationSearchResults').innerHTML='';$('locationSearchStatus').textContent='Masukkan alamat, link Google Maps, atau koordinat lalu klik Cari / Gunakan.';$('locationModal').classList.remove('hidden');
  const m=ensureLocationMap();setTimeout(()=>{m.invalidateSize();if(Number.isFinite(Number(v.lat))&&Number.isFinite(Number(v.lng)))setLocationCandidate({lat:Number(v.lat),lng:Number(v.lng),displayName:'Titik kendaraan saat ini'});else{m.setView([-8.4095,115.1889],9);updateLocationMarkerText('');}},80);
};
function decodeLocationInput(value){try{return decodeURIComponent(String(value||'').replace(/\+/g,' '));}catch(_){return String(value||'').replace(/\+/g,' ');}}
function extractCoordinates(value){
  const text=decodeLocationInput(value),patterns=[/@\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i,/(?:query|q|ll|destination)\s*=\s*(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)/i,/(?:^|[^\d.-])(-?\d{1,3}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)(?:[^\d.]|$)/];
  for(const pattern of patterns){const hit=text.match(pattern);if(!hit)continue;let a=Number(hit[1]),b=Number(hit[2]),lat=a,lng=b;if(Math.abs(a)>90&&Math.abs(b)<=90){lat=b;lng=a;}if(Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180)return{lat,lng};}
  return null;
}
function googlePlaceQuery(value){
  const text=String(value||'').trim();if(!/^https?:\/\//i.test(text))return '';
  try{const u=new URL(text),path=decodeLocationInput(u.pathname),place=path.match(/\/place\/([^/]+)/i);if(place&&place[1])return place[1].replace(/\s+/g,' ').trim();const q=u.searchParams.get('query')||u.searchParams.get('q');return q&&!extractCoordinates(q)?decodeLocationInput(q):'';}catch(_){return '';}
}
function coordinateInsideBali(point){return point&&point.lat>=-8.95&&point.lat<=-8.0&&point.lng>=114.35&&point.lng<=115.78;}
async function searchLocation(){
  const input=$('locationSearchInput').value.trim();if(input.length<3)return alert('Masukkan alamat, link Google Maps, atau koordinat.');
  const directPoint=extractCoordinates(input);
  if(directPoint){
    if(!coordinateInsideBali(directPoint)){$('locationSearchStatus').textContent='Koordinat terbaca, tetapi berada di luar wilayah Bali. Periksa kembali angka latitude dan longitude.';return;}
    locationResults=[];$('locationSearchResults').innerHTML='';setLocationCandidate({...directPoint,displayName:'Koordinat dari Google Maps / input manual'},-1);$('locationSearchStatus').textContent='Koordinat berhasil dibaca. Periksa marker, lalu klik Simpan Titik Ini.';return;
  }
  let query=googlePlaceQuery(input)||input;
  if(/^https?:\/\//i.test(input)&&query===input){$('locationSearchStatus').textContent='Link pendek belum memuat koordinat. Buka link Google Maps, lalu salin link lengkap atau salin angka koordinatnya.';return;}
  const btn=$('locationSearchBtn');btn.disabled=true;$('locationSearchStatus').textContent='Mencari lokasi...';$('locationSearchResults').innerHTML='';
  try{
    const res=await fetch(`/api/geocode?mode=search&address=${encodeURIComponent(query)}&v=13.5`),data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'Pencarian gagal.');
    locationResults=Array.isArray(data.results)?data.results:[];
    if(!locationResults.length){$('locationSearchStatus').textContent='Lokasi belum ditemukan. Tambahkan desa, kecamatan, kabupaten, dan Bali.';return;}
    $('locationSearchStatus').textContent=`Ditemukan ${locationResults.length} pilihan. Klik hasil yang benar, lalu marker masih bisa digeser.`;
    $('locationSearchResults').innerHTML=locationResults.map((r,i)=>`<button class="location-result" data-i="${i}" type="button">${esc(r.displayName||'Lokasi tanpa nama')}<small>${Number(r.lat).toFixed(6)}, ${Number(r.lng).toFixed(6)}</small></button>`).join('');
    $('locationSearchResults').querySelectorAll('.location-result').forEach(el=>el.onclick=()=>setLocationCandidate(locationResults[Number(el.dataset.i)],Number(el.dataset.i)));
    setLocationCandidate(locationResults[0],0);
  }catch(e){$('locationSearchStatus').textContent=e.message||'Pencarian lokasi gagal. Coba beberapa saat lagi.';}finally{btn.disabled=false;}
}
$('locationSearchBtn').onclick=searchLocation;$('locationSearchInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();searchLocation();}};
$('saveLocationBtn').onclick=async()=>{
  if(!locationEditVehicle||!locationMarker)return;const p=locationMarker.getLatLng(),label=locationMarker.locationLabel||$('locationSelectedText').textContent||'Titik manual';
  if(!confirm(`Simpan titik ini untuk kendaraan ${locationEditVehicle.POLICE_NO||'-'}?`))return;
  locationEditVehicle.lat=p.lat;locationEditVehicle.lng=p.lng;locationEditVehicle.geocodeFailed=false;locationEditVehicle.MANUAL_LOCATION=true;locationEditVehicle.MANUAL_LOCATION_UPDATED_AT=new Date().toISOString();locationEditVehicle.GEOCODED_ADDRESS=label;locationEditVehicle.GEOCODE_QUERY=$('locationSearchInput').value.trim();locationEditVehicle.GEOCODE_PRECISION='titik manual tersimpan';delete locationEditVehicle.GEOCODE_ERROR;
  const savedVehicle=locationEditVehicle;await saveData();closeLocationEditor();applyFilter();setTimeout(()=>{map.setView([savedVehicle.lat,savedVehicle.lng],17);const m=markers.find(x=>x.vehicle===savedVehicle);if(m){if(typeof markerLayer.zoomToShowLayer==='function')markerLayer.zoomToShowLayer(m,()=>m.openPopup());else m.openPopup();}},250);$('status').textContent=`Titik ${savedVehicle.POLICE_NO||''} berhasil dipindahkan dan disimpan permanen.`;
};
$('closeLocationBtn').onclick=closeLocationEditor;$('cancelLocationBtn').onclick=closeLocationEditor;$('locationModal').onclick=e=>{if(e.target===$('locationModal'))closeLocationEditor();};
$('showFailedBtn').onclick=openFailedModal;$('closeModalBtn').onclick=closeModal;$('cancelEditBtn').onclick=()=>{$('editAddressBox').classList.add('hidden');editingVehicle=null;};$('addressModal').onclick=e=>{if(e.target===$('addressModal'))closeModal();};
$('auditCoordinatesBtn').onclick=auditCoordinatesNow;
$('stopBtn').onclick=()=>stopRequested=true;
$('fileInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{await importFile(f);}catch(err){alert('File gagal dibaca: '+err.message);}finally{e.target.value='';}};
$('deleteAllBtn').onclick=()=>{if(!confirm('Hapus semua data kendaraan?'))return;vehicles=[];selectedFollowUps.clear();saveData();buildAdvisorFilter();buildRegionFilters();applyFilter();$('status').textContent='Semua data kendaraan sudah dihapus.';};
$('restoreDefaultBtn').onclick=()=>{if(!confirm('Pulihkan data awal? Data saat ini akan diganti.'))return;vehicles=[...(window.DEFAULT_VEHICLES||[])];saveData();hydrateCoordinates();buildAdvisorFilter();buildRegionFilters();applyFilter();$('status').textContent='Data awal dipulihkan.';};
window.deleteOne=key=>{if(!confirm('Hapus kendaraan ini?'))return;vehicles=vehicles.filter(v=>normalizePlate(v.POLICE_NO)!==key);saveData();buildAdvisorFilter();applyFilter();};
let searchTimer;$('searchInput').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>applyFilter(),250);};$('advisorFilter').onchange=applyFilter;$('regencyFilter').onchange=()=>{buildRegionFilters();applyFilter();};$('districtFilter').onchange=applyFilter;$('followUpStatusFilter').onchange=applyFilter;$('showAllBtn').onclick=()=>{$('searchInput').value='';$('advisorFilter').value='';$('regencyFilter').value='';buildRegionFilters();$('districtFilter').value='';$('followUpStatusFilter').value='';applyFilter();};$('selectVisibleBtn').onclick=()=>{filteredVehicles.forEach(v=>selectedFollowUps.add(followUpKey(v)));renderList();};$('clearSelectionBtn').onclick=()=>{selectedFollowUps.clear();renderList();};$('startBatchWaBtn').onclick=()=>{if(batchQueue.length&&batchIndex<batchQueue.length)return openNextBatchWa();batchQueue=vehicles.filter(v=>selectedFollowUps.has(followUpKey(v)));batchIndex=0;if(!batchQueue.length)return alert('Pilih minimal satu customer.');openNextBatchWa();};
$('listPrevBtn').onclick=()=>{if(listPage>1){listPage--;renderList();}};$('listNextBtn').onclick=()=>{const pages=Math.ceil(filteredVehicles.length/Number($('listPageSize').value||100));if(listPage<pages){listPage++;renderList();}};$('listPageSize').onchange=()=>{listPage=1;renderList();};
hydrateCoordinates();buildAdvisorFilter();buildRegionFilters();applyFilter();const localStoreReady=loadLargeStoreData();
function refreshMapSize(){try{map.invalidateSize({pan:false,debounceMoveend:true});}catch(_){}}
[0,100,300,700,1200].forEach(ms=>setTimeout(refreshMapSize,ms));
window.addEventListener('load',refreshMapSize);
window.addEventListener('resize',refreshMapSize);
window.addEventListener('orientationchange',()=>[100,350,800].forEach(ms=>setTimeout(refreshMapSize,ms)));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(refreshMapSize,100);});
if(window.visualViewport)window.visualViewport.addEventListener('resize',refreshMapSize);

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
const QUICK_WA_REASON={CENTANG_SATU:'PESAN_CENTANG_SATU',BELUM_DIBACA:'PESAN_CENTANG_DUA',DIBACA:'DIBACA_TIDAK_DIBALAS',DIBALAS:'CUSTOMER_MEMBALAS'};
function syncQuickWaButtons(){const status=$('followUpStatus').value;document.querySelectorAll('.quick-wa-buttons button').forEach(btn=>btn.classList.toggle('active',btn.dataset.waStatus===status));}
function selectQuickWaStatus(status,reason){$('followUpStatus').value=status;$('followUpReason').value=reason||QUICK_WA_REASON[status]||$('followUpReason').value;syncQuickWaButtons();}
document.querySelectorAll('.quick-wa-buttons button').forEach(btn=>btn.onclick=()=>selectQuickWaStatus(btn.dataset.waStatus,btn.dataset.waReason));
$('followUpStatus').onchange=()=>{const reason=QUICK_WA_REASON[$('followUpStatus').value];if(reason)$('followUpReason').value=reason;syncQuickWaButtons();};
window.openFollowUp=key=>{const v=vehicles.find(x=>followUpKey(x)===key);if(!v)return alert('Data kendaraan tidak ditemukan.');activeFollowUpVehicle=v;const f=getFollowUp(v);$('followUpVehicleInfo').textContent=`${v.POLICE_NO||'-'} · ${v.MODEL||'-'} · ${v.CUSTOMER||'-'}`;$('followUpStatus').value=f?.status||'BELUM';$('followUpDate').value=f?.date||new Date().toISOString().slice(0,10);$('followUpReason').value=f?.reason||QUICK_WA_REASON[f?.status]||'';$('followUpNextDate').value=f?.nextDate||'';$('followUpNote').value=f?.note||'';syncQuickWaButtons();renderFollowUpHistory(f?.history||[]);$('followUpModal').classList.remove('hidden');};
function closeFollowUp(){activeFollowUpVehicle=null;$('followUpModal').classList.add('hidden');}
$('closeFollowUpBtn').onclick=closeFollowUp;$('cancelFollowUpBtn').onclick=closeFollowUp;$('followUpModal').onclick=e=>{if(e.target===$('followUpModal'))closeFollowUp();};
$('saveFollowUpBtn').onclick=()=>{if(!activeFollowUpVehicle)return;const key=followUpKey(activeFollowUpVehicle),entry=followUpEntry(activeFollowUpVehicle),date=$('followUpDate').value,reason=$('followUpReason').value;if(!date)return alert('Tanggal follow up harus diisi.');if(!reason)return alert('Reason follow up harus dipilih.');const old=entry?.record||{};if(entry&&entry.key!==key)delete followUps[entry.key];const record={plate:activeFollowUpVehicle.POLICE_NO||'',frame:activeFollowUpVehicle['NO RANGKA']||activeFollowUpVehicle.NO_RANGKA||activeFollowUpVehicle.CHASSIS_NO||'',customer:activeFollowUpVehicle.CUSTOMER||'',model:activeFollowUpVehicle.MODEL||'',status:$('followUpStatus').value,date,reason,nextDate:$('followUpNextDate').value,note:$('followUpNote').value.trim(),updatedAt:new Date().toISOString()};record.history=[...(old.history||[]),{status:record.status,date:record.date,reason:record.reason,nextDate:record.nextDate,note:record.note,savedAt:record.updatedAt}];followUps[key]=record;saveFollowUps();closeFollowUp();applyFilter();alert('Data follow up berhasil disimpan.');};
$('deleteFollowUpBtn').onclick=()=>{if(!activeFollowUpVehicle)return;const entry=followUpEntry(activeFollowUpVehicle);if(!entry)return alert('Belum ada data follow up.');if(!confirm('Hapus seluruh data follow up kendaraan ini?'))return;delete followUps[entry.key];delete followUps[followUpKey(activeFollowUpVehicle)];saveFollowUps();closeFollowUp();applyFilter();};
$('downloadFollowUpBtn').onclick=()=>{const rows=vehicles.map(v=>{const f=getFollowUp(v)||{};const r=inferRegion(v);return {...v,KABUPATEN_TERDETEKSI:r.regency,KECAMATAN_TERDETEKSI:r.district,STATUS_FOLLOW_UP:followUpStatusLabel(f.status||'BELUM'),TANGGAL_FOLLOW_UP:f.date||'',REASON_FOLLOW_UP:followUpReasonLabel(f.reason),FOLLOW_UP_BERIKUTNYA:f.nextDate||'',CATATAN_FOLLOW_UP:f.note||''};});if(!rows.length)return alert('Belum ada data kendaraan.');const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Kendaraan Follow Up');XLSX.writeFile(wb,`data-kendaraan-follow-up-${new Date().toISOString().slice(0,10)}.xlsx`);};

// ===== V13.8 Antrean cek hasil WhatsApp =====
let waReviewQueue=[],waReviewFiltered=[],waReviewIndex=0,waReviewSessionTotal=0,waReviewSessionStep=0;
function waReviewCandidates(){return vehicles.filter(v=>currentFollowUpStatus(v)==='TERKIRIM').sort((a,b)=>String(getFollowUp(a)?.updatedAt||getFollowUp(a)?.date||'').localeCompare(String(getFollowUp(b)?.updatedAt||getFollowUp(b)?.date||'')));}
function updateWaReviewQueueCount(){const count=vehicles.filter(v=>currentFollowUpStatus(v)==='TERKIRIM').length;if($('waReviewBadge'))$('waReviewBadge').textContent=`${count.toLocaleString('id-ID')} Belum Dicek`;if($('waReviewNavCount'))$('waReviewNavCount').textContent=count.toLocaleString('id-ID');if($('openWaReviewNavBtn')){$('openWaReviewNavBtn').classList.toggle('has-queue',count>0);$('openWaReviewNavBtn').title=count?`${count} customer menunggu pemeriksaan`:'Belum ada hasil WA yang perlu diperiksa';}return count;}
function waReviewSearchText(v){const r=inferRegion(v);return [v.POLICE_NO,v.CUSTOMER,v.MODEL,v.SERVICE_ADVISOR,v.ADDRESS,r.regency,r.district,getPhoneRaw(v)].join(' ').toLocaleLowerCase('id-ID');}
function rebuildWaReviewQueue(keepVehicle=null){
  waReviewQueue=waReviewCandidates();const q=$('waReviewSearchInput').value.trim().toLocaleLowerCase('id-ID');waReviewFiltered=q?waReviewQueue.filter(v=>waReviewSearchText(v).includes(q)):[...waReviewQueue];
  if(keepVehicle&&waReviewFiltered.includes(keepVehicle))waReviewIndex=waReviewFiltered.indexOf(keepVehicle);else waReviewIndex=Math.max(0,Math.min(waReviewIndex,waReviewFiltered.length-1));updateWaReviewQueueCount();
}
function activeWaReviewVehicle(){return waReviewFiltered[waReviewIndex]||null;}
function renderWaReviewQueue(){
  const active=activeWaReviewVehicle(),limit=300,visible=waReviewFiltered.slice(0,limit);$('waReviewQueueList').innerHTML=visible.length?visible.map((v,i)=>{const r=inferRegion(v);return `<button class="wa-review-queue-item ${v===active?'active':''}" data-i="${i}" type="button"><span class="wa-review-queue-number">${i+1}</span><span class="wa-review-queue-main"><b>${esc(v.POLICE_NO||'-')} · ${esc(v.MODEL||'-')}</b><span>${esc(v.CUSTOMER||'-')}</span><span>SA: ${esc(v.SERVICE_ADVISOR||'-')} · ${esc(r.district||r.regency||'-')}</span><em>Belum Dicek</em></span></button>`;}).join(''):'<div class="cluster-empty">Tidak ada customer yang cocok.</div>';
  $('waReviewQueueList').querySelectorAll('.wa-review-queue-item').forEach(btn=>btn.onclick=()=>{waReviewIndex=Number(btn.dataset.i);const fullIndex=waReviewQueue.indexOf(activeWaReviewVehicle());if(fullIndex>=0)waReviewSessionStep=Math.min(waReviewSessionTotal-1,fullIndex);renderWaReview();});
}
function renderWaReview(){
  updateWaReviewQueueCount();const v=activeWaReviewVehicle(),empty=waReviewQueue.length===0,noActive=!v,emptyBox=$('waReviewEmpty');emptyBox.classList.toggle('hidden',!noActive);$('waReviewActive').classList.toggle('hidden',noActive);$('waReviewSkipBtn').disabled=noActive;$('waReviewNextBtn').disabled=noActive;emptyBox.querySelector('b').textContent=empty?'Semua hasil WhatsApp sudah diperiksa':'Customer tidak ditemukan';emptyBox.querySelector('span').textContent=empty?'Tidak ada customer berstatus WA Dibuka.':'Coba kata pencarian yang berbeda.';
  renderWaReviewQueue();if(!v){$('waReviewProgressText').textContent=empty?`Selesai ${waReviewSessionTotal} dari ${waReviewSessionTotal}`:'Customer 0 dari 0';$('waReviewProgressBar').style.width=empty?'100%':'0%';return;}
  const r=inferRegion(v),phone=getPhone(v);$('waReviewVehicleTitle').textContent=`${v.POLICE_NO||'-'} · ${v.MODEL||'-'}`;$('waReviewCustomerName').textContent=v.CUSTOMER||'-';$('waReviewVehicleMeta').textContent=`SA: ${v.SERVICE_ADVISOR||'-'} · ${r.district||r.regency||'-'}`;$('waReviewPhone').textContent=`WhatsApp: ${getPhoneRaw(v)||'Nomor belum tersedia'}`;$('waReviewOpenChatBtn').disabled=!phone;
  const step=Math.min(waReviewSessionTotal,Math.max(1,waReviewSessionStep+1)),total=Math.max(waReviewSessionTotal,1);$('waReviewProgressText').textContent=`Customer ${step} dari ${waReviewSessionTotal}`;$('waReviewProgressBar').style.width=`${Math.min(100,step/total*100)}%`;
}
function openWaReview(){waReviewIndex=0;waReviewSessionStep=0;document.body.classList.remove('nav-mobile-open');$('waReviewSearchInput').value='';rebuildWaReviewQueue();waReviewSessionTotal=waReviewQueue.length;$('waReviewModal').classList.remove('hidden');renderWaReview();}
function closeWaReview(){$('waReviewModal').classList.add('hidden');waReviewQueue=[];waReviewFiltered=[];waReviewIndex=0;}
function advanceWaReview(){if(!waReviewFiltered.length)return;waReviewIndex=(waReviewIndex+1)%waReviewFiltered.length;waReviewSessionStep=Math.min(waReviewSessionTotal-1,waReviewSessionStep+1);renderWaReview();}
async function saveWaReviewStatus(status,reason){
  const v=activeWaReviewVehicle();if(!v)return;const key=followUpKey(v),entry=followUpEntry(v),old=entry?.record||{},today=new Date().toISOString().slice(0,10),updatedAt=new Date().toISOString();if(entry&&entry.key!==key)delete followUps[entry.key];
  const record={...old,plate:v.POLICE_NO||'',frame:v['NO RANGKA']||v.NO_RANGKA||v.CHASSIS_NO||'',customer:v.CUSTOMER||'',model:v.MODEL||'',status,date:today,reason,nextDate:old.nextDate||'',note:old.note||'',updatedAt};record.history=[...(old.history||[]),{status,date:today,reason,nextDate:record.nextDate,note:record.note,savedAt:updatedAt}];followUps[key]=record;await saveFollowUps();waReviewSessionStep=Math.min(waReviewSessionTotal,waReviewSessionStep+1);rebuildWaReviewQueue();applyFilter(false);renderWaReview();$('status').textContent=`Status ${v.POLICE_NO||''} disimpan: ${followUpStatusLabel(status)}.`;
}
$('openWaReviewNavBtn').onclick=openWaReview;$('closeWaReviewBtn').onclick=closeWaReview;$('waReviewModal').onclick=e=>{if(e.target===$('waReviewModal'))closeWaReview();};
$('waReviewSearchInput').oninput=()=>{const keep=activeWaReviewVehicle();rebuildWaReviewQueue(keep);renderWaReview();};
$('waReviewOpenChatBtn').onclick=()=>{const v=activeWaReviewVehicle(),phone=getPhone(v);if(!v||!phone)return alert('Nomor WhatsApp belum tersedia.');window.open(`https://wa.me/${phone}`,'_blank','noopener');};
document.querySelectorAll('.wa-review-status-grid button').forEach(btn=>btn.onclick=()=>saveWaReviewStatus(btn.dataset.reviewStatus,btn.dataset.reviewReason));
$('waReviewSkipBtn').onclick=advanceWaReview;$('waReviewNextBtn').onclick=advanceWaReview;updateWaReviewQueueCount();


// ===== V8: Template WhatsApp editable, pencarian, preview, test WA, backup =====
function categoryLabel(c){return ({REMINDER:'Reminder Service',PROMO:'Promo',BOOKING:'Booking',FOLLOW_UP:'Follow Up',BODY_PAINT:'Body & Paint',UCAPAN:'Ucapan',LAINNYA:'Lainnya'}[c]||c||'Lainnya');}
function renderTemplateList(){
  const box=$('templateList'),q=String($('templateSearchInput')?.value||'').trim().toLowerCase();
  const list=waTemplates.filter(t=>!q||`${t.name} ${t.category} ${categoryLabel(t.category)}`.toLowerCase().includes(q));
  box.innerHTML=list.length?list.map(t=>`<button type="button" class="template-list-item category-${esc(t.category||'LAINNYA')} ${t.id===editingTemplateId?'selected':''}" data-id="${esc(t.id)}"><b>${esc(t.name)}</b><small>${esc(categoryLabel(t.category))} · ${t.active!==false?'Aktif':'Nonaktif'}</small></button>`).join(''):'<small>Tidak ada template yang cocok.</small>';
  box.querySelectorAll('.template-list-item').forEach(el=>el.onclick=()=>loadTemplateEditor(el.dataset.id));
}
function loadTemplateEditor(id){
  const t=waTemplates.find(x=>x.id===id);if(!t)return;editingTemplateId=id;
  $('templateNameInput').value=t.name||'';$('templateCategoryInput').value=t.category||'LAINNYA';$('templateMessageInput').value=t.message||'';$('templateActiveInput').checked=t.active!==false;renderTemplateList();updateTemplatePreview();
}
function updateTemplatePreview(){if($('templatePreview'))$('templatePreview').textContent=renderTemplateMessage($('templateMessageInput').value,vehicles[0]||{});}
function openTemplateManager(){refreshTemplateSelectors();renderTemplateList();if(!editingTemplateId||!waTemplates.some(x=>x.id===editingTemplateId))editingTemplateId=waTemplates[0]?.id||'';if(editingTemplateId)loadTemplateEditor(editingTemplateId);$('testWaNumberInput').value=localStorage.getItem(WA_TEST_NUMBER_KEY)||'';$('templateModal').classList.remove('hidden');}
function closeTemplateManager(){$('templateModal').classList.add('hidden');}
$('manageTemplatesBtn').onclick=openTemplateManager;$('closeTemplateBtn').onclick=closeTemplateManager;$('templateModal').onclick=e=>{if(e.target===$('templateModal'))closeTemplateManager();};
$('templateSearchInput').oninput=renderTemplateList;
$('quickTemplateSelect').onchange=e=>{activeWaTemplateId=e.target.value;localStorage.setItem(WA_ACTIVE_TEMPLATE_KEY,activeWaTemplateId);refreshTemplateSelectors();};
$('newTemplateBtn').onclick=()=>{const t={id:makeTemplateId(),name:'Template Baru',category:'LAINNYA',active:true,message:'Selamat pagi Bapak/Ibu {nama}.\n\n'};waTemplates.push(t);saveWaTemplates();loadTemplateEditor(t.id);refreshTemplateSelectors();};
$('duplicateTemplateBtn').onclick=()=>{const src=waTemplates.find(x=>x.id===editingTemplateId);if(!src)return alert('Pilih template yang akan diduplikat.');const t={...src,id:makeTemplateId(),name:(src.name||'Template')+' - Salinan'};waTemplates.push(t);saveWaTemplates();loadTemplateEditor(t.id);refreshTemplateSelectors();};
$('saveTemplateBtn').onclick=()=>{const name=$('templateNameInput').value.trim(),message=$('templateMessageInput').value.trim();if(!name)return alert('Nama template harus diisi.');if(!message)return alert('Isi pesan harus diisi.');let t=waTemplates.find(x=>x.id===editingTemplateId);if(!t){t={id:makeTemplateId()};waTemplates.push(t);editingTemplateId=t.id;}Object.assign(t,{name,category:$('templateCategoryInput').value,message,active:$('templateActiveInput').checked});saveWaTemplates();refreshTemplateSelectors();renderTemplateList();alert('Template berhasil disimpan dan backup sebelumnya dibuat.');};
$('deleteTemplateBtn').onclick=()=>{const t=waTemplates.find(x=>x.id===editingTemplateId);if(!t)return;if(waTemplates.length<=1)return alert('Minimal harus ada satu template.');if(!confirm(`Hapus template “${t.name}”?`))return;waTemplates=waTemplates.filter(x=>x.id!==editingTemplateId);editingTemplateId=waTemplates[0]?.id||'';saveWaTemplates();refreshTemplateSelectors();if(editingTemplateId)loadTemplateEditor(editingTemplateId);};
$('restoreTemplateBackupBtn').onclick=()=>{const backup=readJSON(WA_TEMPLATE_BACKUP_KEY,null);if(!backup?.length)return alert('Belum ada backup template. Backup dibuat setiap kali template disimpan atau diubah.');if(!confirm('Kembalikan template ke kondisi sebelum perubahan terakhir?'))return;const current=waTemplates;waTemplates=backup;safeStore(WA_TEMPLATE_BACKUP_KEY,current);saveWaTemplates(false);editingTemplateId=waTemplates[0]?.id||'';refreshTemplateSelectors();loadTemplateEditor(editingTemplateId);alert('Backup template berhasil dipulihkan.');};
$('resetTemplatesBtn').onclick=()=>{if(!confirm('Pulihkan template bawaan? Template buatan Anda akan diganti.'))return;waTemplates=DEFAULT_WA_TEMPLATES.map(x=>({...x}));activeWaTemplateId=waTemplates[0].id;editingTemplateId=activeWaTemplateId;saveWaTemplates();refreshTemplateSelectors();loadTemplateEditor(editingTemplateId);};

// ===== V10: AI Offline Gratis pembuat dan perapih pesan WhatsApp =====
let offlineAiVariation=0;
function setAiWriterState(state,text){
  const badge=$('aiStatusBadge'),buttons=[$('generateAiMessageBtn'),$('improveAiMessageBtn')].filter(Boolean);
  if(badge){badge.className='ai-status '+(state||'');badge.textContent=text||'Siap Offline';}
  buttons.forEach(btn=>btn.disabled=state==='loading');
}
function capitalizeSentence(text){
  return String(text||'').trim().replace(/\s+/g,' ').replace(/^./,c=>c.toUpperCase());
}
function extractPromoDetail(prompt){
  const p=String(prompt||'').trim();
  const discount=(p.match(/(?:diskon|potongan)\s*([0-9]{1,2}\s*%)/i)||[])[1];
  const price=(p.match(/(?:rp\.?\s*)?[0-9][0-9.,]{3,}/i)||[])[0];
  return {discount,price};
}
function detectOfflineTopic(prompt,category){
  const p=String(prompt||'').toLowerCase();
  if(/oli|oil/.test(p))return 'ganti oli dan pemeriksaan kendaraan';
  if(/ac|air conditioner|dingin/.test(p))return 'pemeriksaan dan perawatan AC';
  if(/rem|brake|kampas/.test(p))return 'pemeriksaan sistem pengereman';
  if(/aki|battery|baterai/.test(p))return 'pemeriksaan kondisi aki';
  if(/ban|spooring|balancing/.test(p))return 'pemeriksaan ban, spooring, dan balancing';
  if(/body|paint|coating|cat/.test(p))return 'perawatan Body & Paint';
  if(/t-care|tcare/.test(p))return 'pemanfaatan layanan T-Care';
  if(/booking/.test(p))return 'booking service';
  if(category==='REMINDER')return 'service berkala';
  if(category==='BOOKING')return 'booking service';
  if(category==='BODY_PAINT')return 'perawatan Body & Paint';
  return 'service dan perawatan kendaraan';
}
function greetingByTone(tone,variant){
  if(tone==='formal')return variant%2?'Dengan hormat, Bapak/Ibu {nama}.':'Yth. Bapak/Ibu {nama},';
  if(tone==='ramah')return variant%2?'Halo Bapak/Ibu {nama} 👋':'Selamat pagi Bapak/Ibu {nama}.';
  if(tone==='singkat')return 'Halo Bapak/Ibu {nama}.';
  return variant%2?'Selamat pagi Bapak/Ibu {nama}.':'Om Swastyastu Bapak/Ibu {nama}.';
}
function closingByTone(tone,variant){
  if(tone==='persuasif')return variant%2?'Kuota layanan terbatas. Silakan balas pesan ini agar kami bantu jadwalkan booking Anda.':'Yuk booking sekarang agar kendaraan tetap nyaman dan terawat. Kami siap membantu.';
  if(tone==='singkat')return 'Silakan balas pesan ini untuk booking. Terima kasih.';
  if(tone==='formal')return 'Mohon menghubungi kami untuk pengaturan jadwal kunjungan. Terima kasih atas kepercayaan Anda.';
  return variant%2?'Silakan balas pesan ini, kami siap membantu proses booking. Terima kasih.':'Kami dengan senang hati membantu menentukan jadwal service yang nyaman. Terima kasih.';
}
function buildOfflineMessage({prompt,category,tone,length,variant}){
  const topic=detectOfflineTopic(prompt,category),detail=extractPromoDetail(prompt),greeting=greetingByTone(tone,variant);
  const vehicle='Kendaraan {model} dengan nomor polisi {plat}';
  let body='';
  if(category==='PROMO'){
    const benefit=detail.discount?`tersedia promo diskon ${detail.discount}`:detail.price?`tersedia penawaran spesial ${detail.price}`:'tersedia promo spesial';
    const variants=[
      `${benefit} untuk ${topic}.`,
      `Saat ini {dealer} menghadirkan ${benefit} untuk ${topic}.`,
      `Kami ingin menginformasikan bahwa ${benefit} yang dapat dimanfaatkan untuk ${vehicle}.`
    ];
    body=variants[variant%variants.length];
  }else if(category==='BOOKING'){
    body=`Kami siap membantu proses booking ${topic} untuk ${vehicle}.`;
  }else if(category==='FOLLOW_UP'){
    body=`Kami menindaklanjuti informasi sebelumnya mengenai ${topic} untuk ${vehicle}.`;
  }else if(category==='BODY_PAINT'){
    body=`Kami menyediakan ${topic} untuk membantu menjaga tampilan dan perlindungan ${vehicle}.`;
  }else if(category==='UCAPAN'){
    body=`Semoga Bapak/Ibu {nama} selalu sehat dan aktivitasnya berjalan lancar bersama ${vehicle}.`;
  }else{
    const variants=[
      `${vehicle} sudah memasuki waktu yang disarankan untuk ${topic}.`,
      `Kami ingin mengingatkan jadwal ${topic} untuk ${vehicle}.`,
      `Agar performa dan kenyamanan tetap terjaga, ${vehicle} disarankan melakukan ${topic}.`
    ];
    body=variants[variant%variants.length];
  }
  const extra=capitalizeSentence(prompt);
  let parts=[greeting,'',body];
  if(length==='panjang')parts.push('',`Perawatan tepat waktu membantu menjaga keamanan, kenyamanan, serta kondisi kendaraan. Service terakhir: {service_terakhir}. Jadwal berikutnya: {jatuh_tempo}.`);
  if(length!=='pendek' && extra && !/^buat|^bikin|^rapikan/i.test(extra))parts.push('',`Informasi: ${extra.replace(/[.]$/,'')}.`);
  parts.push('',closingByTone(tone,variant),'','{dealer}');
  return parts.join('\n').replace(/\n{3,}/g,'\n\n').trim();
}
function improveOfflineMessage(message,tone,length){
  let text=String(message||'').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  text=text.split('\n').map(line=>line.trim()).join('\n');
  if(!/[.!?}]$/.test(text))text+='.';
  if(!/\{nama\}/i.test(text))text=`${greetingByTone(tone,offlineAiVariation)}\n\n${text}`;
  if(!/booking|balas pesan|hubungi/i.test(text))text+=`\n\n${closingByTone(tone,offlineAiVariation)}`;
  if(!/\{dealer\}/i.test(text))text+='\n\n{dealer}';
  if(length==='pendek'){
    const paras=text.split(/\n\n+/).filter(Boolean);
    text=paras.slice(0,4).join('\n\n');
  }
  return text;
}
function requestAiMessage(task){
  const prompt=$('aiPromptInput')?.value.trim()||'',currentMessage=$('templateMessageInput')?.value.trim()||'';
  if(task==='generate'&&!prompt)return alert('Tulis topik terlebih dahulu. Contoh: Promo ganti oli diskon 15% dan ajak booking.');
  if(task==='improve'&&!currentMessage)return alert('Isi pesan masih kosong. Tulis pesan terlebih dahulu atau gunakan tombol Buat Pesan Offline.');
  setAiWriterState('loading','Memproses offline...');
  try{
    offlineAiVariation++;
    const tone=$('aiToneInput')?.value||'sopan-profesional',length=$('aiLengthInput')?.value||'sedang';
    const message=task==='generate'?buildOfflineMessage({prompt,category:$('templateCategoryInput')?.value||'LAINNYA',tone,length,variant:offlineAiVariation}):improveOfflineMessage(currentMessage,tone,length);
    $('templateMessageInput').value=message;updateTemplatePreview();setAiWriterState('success','Gratis · Offline');
  }catch(err){setAiWriterState('error','Gagal');alert(err.message||'Pesan gagal dibuat.');}
}

// ===== V11: Smart AI Offline - analisa kendaraan dan rekomendasi service =====
function parseSmartVehiclePrompt(prompt){
  const t=String(prompt||'').toLowerCase();
  const year=(t.match(/\b(19|20)\d{2}\b/)||[])[0]||'';
  let km=0;
  const kmMatch=t.match(/(\d{1,3}(?:[.,]\d{3})+|\d{4,6})\s*(?:km|kilometer)?/);
  if(kmMatch)km=parseInt(kmMatch[1].replace(/[.,]/g,''),10)||0;
  const late=(t.match(/(?:telat|terlambat|belum service)\s*(?:selama)?\s*(\d+)\s*bulan/)||[])[1];
  const models=['avanza','veloz','rush','fortuner','innova','zenix','agya','calya','raize','yaris','alphard','camry','hilux','hiace','sienta','corolla','vios'];
  const model=models.find(m=>t.includes(m))||'';
  return {year,km,lateMonths:late?Number(late):0,model:model?model.charAt(0).toUpperCase()+model.slice(1):'{model}',text:t};
}
function smartServiceRecommendations(info){
  const rec=[];
  const add=x=>{if(!rec.includes(x))rec.push(x)};
  add('Ganti oli mesin dan filter oli');
  if(info.km>=20000)add('Periksa/ganti filter udara dan filter AC');
  if(info.km>=40000){add('Brake service dan pemeriksaan kampas rem');add('Rotasi ban, spooring, dan balancing');}
  if(info.km>=60000){add('Periksa coolant dan sistem pendingin');add('Periksa oli transmisi sesuai tipe kendaraan');}
  if(info.km>=80000){add('Periksa busi atau sistem pembakaran');add('Periksa suspensi dan kaki-kaki');}
  if(info.km>=100000){add('Periksa oli gardan/differential bila tersedia');add('Pemeriksaan menyeluruh kebocoran dan mounting');}
  const age=info.year?new Date().getFullYear()-Number(info.year):0;
  if(age>=3)add('Tes kondisi aki dan sistem pengisian');
  if(age>=5)add('Periksa kinerja AC dan kebocoran refrigerant');
  if(info.lateMonths>=6)add('Lakukan general check karena jadwal service sudah terlambat');
  return rec.slice(0,7);
}
function buildSmartFollowUpMessage(info,recs,tone,length){
  const late=info.lateMonths?` sudah terlambat sekitar ${info.lateMonths} bulan dari jadwal service`:'';
  const kmText=info.km?` dengan kilometer sekitar ${info.km.toLocaleString('id-ID')} km`:'';
  const top=recs.slice(0,length==='pendek'?2:length==='panjang'?5:3).map(x=>x.toLowerCase()).join(', ');
  let msg=`${greetingByTone(tone,offlineAiVariation)}\n\nKendaraan ${info.model} dengan nomor polisi {plat}${kmText}${late}. Kami menyarankan ${top} agar kondisi kendaraan tetap aman dan nyaman digunakan.`;
  if(length==='panjang')msg+=`\n\nService terakhir tercatat pada {service_terakhir}, dengan perkiraan jadwal berikutnya {jatuh_tempo}. Rekomendasi akhir tetap menyesuaikan hasil pemeriksaan teknisi di bengkel.`;
  msg+=`\n\n${closingByTone(tone,offlineAiVariation)}\n\n{dealer}`;
  return msg;
}
function runSmartServiceAnalysis(){
  const prompt=$('aiPromptInput')?.value.trim()||'';
  if(!prompt)return alert('Tulis data kendaraan. Contoh: Rush 2021 80.000 km, terlambat 8 bulan.');
  const info=parseSmartVehiclePrompt(prompt),recs=smartServiceRecommendations(info);
  const box=$('smartAiResult');
  if(box){
    box.classList.remove('hidden');
    box.innerHTML=`<h4>🔧 Rekomendasi untuk ${escapeHtml(info.model)} ${escapeHtml(info.year||'')}</h4><div>${info.km?`Kilometer: <b>${info.km.toLocaleString('id-ID')} km</b>`:'Kilometer belum disebutkan.'}${info.lateMonths?` · Terlambat: <b>${info.lateMonths} bulan</b>`:''}</div><ul>${recs.map(r=>`<li>${escapeHtml(r)}</li>`).join('')}</ul><div class="smart-tags"><span class="smart-tag">Offline</span><span class="smart-tag">Tanpa API</span><span class="smart-tag">Bisa diedit</span></div><button id="useSmartMessageBtn" type="button" class="ai-button">Gunakan sebagai Pesan WA</button>`;
    $('useSmartMessageBtn').onclick=()=>{
      offlineAiVariation++;
      const msg=buildSmartFollowUpMessage(info,recs,$('aiToneInput')?.value||'sopan-profesional',$('aiLengthInput')?.value||'sedang');
      $('templateMessageInput').value=msg;updateTemplatePreview();setAiWriterState('success','Smart AI Offline');
    };
  }
  setAiWriterState('success','Analisa selesai');
}
if($('smartServiceBtn'))$('smartServiceBtn').onclick=runSmartServiceAnalysis;

if($('generateAiMessageBtn'))$('generateAiMessageBtn').onclick=()=>requestAiMessage('generate');
if($('improveAiMessageBtn'))$('improveAiMessageBtn').onclick=()=>requestAiMessage('improve');
$('templateMessageInput').oninput=updateTemplatePreview;
document.querySelectorAll('.template-token-help button').forEach(btn=>btn.onclick=()=>{const input=$('templateMessageInput'),token=btn.dataset.token,start=input.selectionStart??input.value.length,end=input.selectionEnd??start;input.value=input.value.slice(0,start)+token+input.value.slice(end);input.focus();input.selectionStart=input.selectionEnd=start+token.length;updateTemplatePreview();});
$('testTemplateWaBtn').onclick=()=>{const raw=$('testWaNumberInput').value.trim(),phone=normalizePhone(raw);if(phone.length<10)return alert('Masukkan nomor WA tes yang benar.');localStorage.setItem(WA_TEST_NUMBER_KEY,raw);const msg=renderTemplateMessage($('templateMessageInput').value,vehicles[0]||{});window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,'_blank');};
$('exportTemplatesBtn').onclick=()=>{const rows=waTemplates.map(t=>({NAMA_TEMPLATE:t.name,KATEGORI:t.category,ISI_PESAN:t.message,AKTIF:t.active!==false?'YA':'TIDAK'}));const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Template WA');XLSX.writeFile(wb,`template-whatsapp-${new Date().toISOString().slice(0,10)}.xlsx`);};
$('templateFileInput').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const wb=XLSX.read(await file.arrayBuffer(),{type:'array'}),ws=wb.Sheets[wb.SheetNames[0]],rows=XLSX.utils.sheet_to_json(ws,{defval:''});let added=0;rows.forEach(r=>{const name=String(r.NAMA_TEMPLATE||r['Nama Template']||r.NAMA||'').trim(),message=String(r.ISI_PESAN||r['Isi Pesan']||r.PESAN||'').trim();if(!name||!message)return;waTemplates.push({id:makeTemplateId(),name,category:String(r.KATEGORI||'LAINNYA').toUpperCase(),message,active:!/^TIDAK|NO|FALSE|0$/i.test(String(r.AKTIF||'YA'))});added++;});saveWaTemplates();refreshTemplateSelectors();renderTemplateList();alert(`${added} template berhasil diimport.`);}catch(err){alert('Template gagal diimport: '+err.message);}finally{e.target.value='';}};
$('waComposerTemplate').onchange=e=>{activeWaTemplateId=e.target.value;localStorage.setItem(WA_ACTIVE_TEMPLATE_KEY,activeWaTemplateId);$('waComposerMessage').value=waMessage(waComposerVehicle,activeWaTemplateId);refreshTemplateSelectors();};
$('closeWaComposerBtn').onclick=closeWaComposer;$('cancelWaComposerBtn').onclick=closeWaComposer;$('waComposerModal').onclick=e=>{if(e.target===$('waComposerModal'))closeWaComposer();};
$('sendWaComposerBtn').onclick=()=>{if(!waComposerVehicle)return;const phone=getPhone(waComposerVehicle);if(!phone)return alert('Nomor WhatsApp belum tersedia.');const message=$('waComposerMessage').value.trim();if(!message)return alert('Pesan tidak boleh kosong.');const v=waComposerVehicle,batchMode=waComposerBatchMode;markWaOpened(v);window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,'_blank','noopener');closeWaComposer();$('status').textContent=batchMode?`WA ${batchIndex}/${batchQueue.length}: ${v.POLICE_NO||'-'} dibuka. Klik “Mulai WA Berurutan” lagi untuk customer berikutnya.`:`WhatsApp ${v.POLICE_NO||'-'} dibuka.`;applyFilter();};
refreshTemplateSelectors();

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

// ===== V14: jembatan sinkronisasi Supabase =====
window.PetaCloudBridge={
  ready(){return localStoreReady;},
  getState(){
    return {
      vehicles,
      followUps,
      geoCache,
      settings:{waTemplates,activeWaTemplateId}
    };
  },
  vehicleKey(v,index=0){
    const frame=normalizeFrame(v?.['NO RANGKA']||v?.NO_RANGKA||v?.CHASSIS_NO);
    const plate=normalizePlate(v?.POLICE_NO);
    if(frame)return `F:${frame}`;
    if(plate)return `P:${plate}`;
    return `X:${identityText(v?.CUSTOMER)}:${identityText(v?.MODEL)}:${index}`;
  },
  async applyState(cloudState){
    if(Array.isArray(cloudState?.vehicles))vehicles=cloudState.vehicles;
    if(cloudState?.followUps&&typeof cloudState.followUps==='object')followUps=cloudState.followUps;
    if(cloudState?.geoCache&&typeof cloudState.geoCache==='object')geoCache=cloudState.geoCache;
    if(Array.isArray(cloudState?.settings?.waTemplates)&&cloudState.settings.waTemplates.length){
      waTemplates=cloudState.settings.waTemplates;
      activeWaTemplateId=cloudState.settings.activeWaTemplateId||waTemplates[0]?.id||'';
      safeStore(WA_TEMPLATE_KEY,waTemplates);
      localStorage.setItem(WA_ACTIVE_TEMPLATE_KEY,activeWaTemplateId);
    }
    await Promise.all([
      window.BigStore?.set('vehicles',vehicles),
      window.BigStore?.set('followUps',followUps),
      window.BigStore?.set('geoCache',geoCache)
    ]);
    invalidateFollowUpLookup();
    reconcileFollowUps();
    searchIndexCache=new WeakMap();
    hydrateCoordinates();
    buildAdvisorFilter();
    buildRegionFilters();
    applyFilter();
    refreshTemplateSelectors();
  },
  refresh(){
    searchIndexCache=new WeakMap();
    invalidateFollowUpLookup();
    hydrateCoordinates();
    buildAdvisorFilter();
    buildRegionFilters();
    applyFilter();
    refreshTemplateSelectors();
  }
};
