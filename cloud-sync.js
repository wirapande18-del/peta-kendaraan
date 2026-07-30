(function(){
  const config=window.PETA_SUPABASE_CONFIG||{};
  const TABLES={vehicles:'vehicle_records',followUps:'follow_up_records',geoCache:'geo_cache_records',settings:'app_settings'};
  const PAGE_SIZE=1000,WRITE_BATCH=800,DELETE_BATCH=200;
  const DIRTY_KEY='petaCloudDirtyV14',DIRTY_TIME_KEY='petaCloudDirtyTimeV14',DIRTY_MAX_AGE=10*60*1000;
  const known={vehicles:new Map(),followUps:new Map(),geoCache:new Map(),settings:new Map()};
  let client=null,session=null,profile=null,started=false,syncing=false,starting=false,pullTimer=null,flushTimer=null;
  const pending=new Set();
  const $=id=>document.getElementById(id);
  const hash=value=>JSON.stringify(value??null);
  const chunks=(rows,size)=>{const out=[];for(let i=0;i<rows.length;i+=size)out.push(rows.slice(i,i+size));return out;};
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const role=()=>profile?.role||'';
  const isAdmin=()=>role()==='admin';
  const isSA=()=>role()==='sa';
  const isKabeng=()=>role()==='kabeng';

  function readDirty(){try{return new Set(JSON.parse(localStorage.getItem(DIRTY_KEY)||'[]'));}catch(_){return new Set();}}
  function writeDirty(set){try{localStorage.setItem(DIRTY_KEY,JSON.stringify([...set]));}catch(_){}}
  function markDirty(type){const dirty=readDirty();dirty.add(type);writeDirty(dirty);try{localStorage.setItem(DIRTY_TIME_KEY,String(Date.now()));}catch(_){}}
  function clearDirty(types){const dirty=readDirty();types.forEach(type=>dirty.delete(type));writeDirty(dirty);if(!dirty.size)try{localStorage.removeItem(DIRTY_TIME_KEY);}catch(_){}}
  function freshDirty(){
    const dirty=[...readDirty()].filter(type=>TABLES[type]);
    let time=0;try{time=Number(localStorage.getItem(DIRTY_TIME_KEY)||0);}catch(_){}
    if(!dirty.length)return [];
    if(time&&Date.now()-time<=DIRTY_MAX_AGE)return dirty;
    clearDirty(dirty);return [];
  }
  function writableType(type){
    if(isAdmin())return true;
    if(isSA())return type==='followUps';
    return false;
  }
  function setStatus(kind,text){
    const badge=$('cloudStatusBadge');if(badge){badge.className=`cloud-status ${kind||''}`;badge.textContent=text;}
    const loginStatus=$('cloudLoginStatus');if(loginStatus&&kind==='error')loginStatus.textContent=text;
  }
  function showLogin(show,message=''){
    const modal=$('cloudLoginModal');if(modal)modal.classList.toggle('hidden',!show);
    if($('cloudLoginStatus'))$('cloudLoginStatus').textContent=message;
  }
  function displayRole(value){return value==='admin'?'Administrator':value==='sa'?'Service Advisor':value==='kabeng'?'Kepala Bengkel · Lihat Saja':'';}
  function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));}
  function setUser(){
    const label=profile?.full_name||profile?.username||session?.user?.email||'';
    if($('cloudUserEmail'))$('cloudUserEmail').textContent=label+(profile?.role?` · ${displayRole(profile.role)}`:'');
    const nav=document.querySelector('.nav-profile');
    if(nav&&profile){
      const badge=profile.role==='admin'?'AD':profile.role==='kabeng'?'KB':'SA';
      nav.innerHTML=`<span>${badge}</span><div><b>${escapeHtml(profile.full_name||profile.username)}</b><small>${escapeHtml(displayRole(profile.role))}</small></div>`;
    }
  }
  function setMenuVisible(view,visible){
    document.querySelectorAll(`[data-view="${view}"]`).forEach(el=>{el.style.display=visible?'':'none';el.disabled=!visible;});
  }
  function applyRoleUI(){
    if(!profile)return;
    setMenuVisible('dashboard',true);
    setMenuVisible('map',!isKabeng());
    setMenuVisible('followup',!isKabeng());
    setMenuVisible('data',isAdmin());
    setMenuVisible('settings',isAdmin());
    const wa=$('openWaReviewNavBtn');if(wa)wa.style.display=isKabeng()?'none':'';
    const sync=$('cloudSyncBtn');if(sync)sync.style.display=isKabeng()?'none':'';
    const username=$('cloudUsername');if(username){username.value='';username.placeholder='ayu / fik / ajs / wbn / kabeng';}
    const version=$('versionBadge');if(version)version.textContent='Versi 16.3 Multi User';
    if(isSA())lockAdvisorFilters(profile.sa_code||profile.username||'');
    if(isKabeng())setTimeout(()=>document.querySelector('[data-view="dashboard"]')?.click(),0);
  }
  function lockAdvisorFilters(saCode){
    const wanted=String(saCode||'').trim().toUpperCase();
    const tryLock=()=>{
      const selects=[...document.querySelectorAll('select')].filter(sel=>/advisor/i.test(sel.id||'')||[...sel.options].some(o=>/Semua Service Advisor/i.test(o.textContent||'')));
      selects.forEach(sel=>{
        const option=[...sel.options].find(o=>String(o.value||o.textContent).trim().toUpperCase()===wanted);
        if(option){sel.value=option.value;sel.dispatchEvent(new Event('change',{bubbles:true}));sel.disabled=true;sel.title=`Dikunci untuk SA ${wanted}`;}
      });
    };
    tryLock();setTimeout(tryLock,500);setTimeout(tryLock,1800);
  }
  async function loadProfile(){
    const {data,error}=await client.from('user_profiles').select('username,full_name,role,sa_code,is_active').eq('id',session.user.id).maybeSingle();
    if(error)throw new Error('Profil pengguna gagal dibaca: '+error.message);
    if(!data)throw new Error('Profil pengguna belum dibuat. Hubungi Admin.');
    if(!data.is_active)throw new Error('Akun ini sedang dinonaktifkan.');
    if(!['admin','sa','kabeng'].includes(data.role))throw new Error('Hak akses pengguna tidak valid.');
    profile=data;setUser();applyRoleUI();
  }
  async function waitForBridge(){for(let i=0;i<100;i++){if(window.PetaCloudBridge)return window.PetaCloudBridge;await sleep(30);}throw new Error('Aplikasi belum siap untuk sinkronisasi.');}
  async function fetchAll(table){
    const rows=[];for(let from=0;;from+=PAGE_SIZE){
      const {data,error}=await client.from(table).select('record_key,payload,updated_at').order('record_key').range(from,from+PAGE_SIZE-1);
      if(error)throw error;rows.push(...(data||[]));if(!data||data.length<PAGE_SIZE)break;
    }return rows;
  }
  function seedKnown(type,rows){const map=known[type];map.clear();rows.forEach(row=>map.set(row.record_key,hash(row.payload)));}
  function vehicleBelongsToSA(vehicle){
    if(!isSA())return true;
    const code=String(profile?.sa_code||profile?.username||'').trim().toUpperCase();
    const vehicleCode=String(vehicle?.SERVICE_ADVISOR||vehicle?.service_advisor||vehicle?.SA||vehicle?.sa||'').trim().toUpperCase();
    return vehicleCode===code;
  }
  async function loadCloudState(){
    const [vehicleRows,followRows,geoRows,settingRows]=await Promise.all([fetchAll(TABLES.vehicles),fetchAll(TABLES.followUps),fetchAll(TABLES.geoCache),fetchAll(TABLES.settings)]);
    seedKnown('vehicles',vehicleRows);seedKnown('followUps',followRows);seedKnown('geoCache',geoRows);seedKnown('settings',settingRows);
    const allowedVehicles=vehicleRows.map(row=>row.payload).filter(vehicleBelongsToSA);
    return {vehicles:allowedVehicles,followUps:Object.fromEntries(followRows.map(row=>[row.record_key,row.payload])),geoCache:Object.fromEntries(geoRows.map(row=>[row.record_key,row.payload])),settings:settingRows.find(row=>row.record_key==='shared')?.payload||null};
  }
  function currentRows(type){
    const bridge=window.PetaCloudBridge,state=bridge.getState();
    if(type==='vehicles')return state.vehicles.map((payload,index)=>({record_key:bridge.vehicleKey(payload,index),payload}));
    if(type==='followUps')return Object.entries(state.followUps||{}).map(([record_key,payload])=>({record_key,payload}));
    if(type==='geoCache')return Object.entries(state.geoCache||{}).map(([record_key,payload])=>({record_key,payload}));
    return [{record_key:'shared',payload:state.settings||{}}];
  }
  async function syncType(type,force=false){
    if(!writableType(type))return {changed:0,removed:0};
    const table=TABLES[type],rows=currentRows(type),map=known[type],currentKeys=new Set(rows.map(row=>row.record_key));
    const changed=rows.filter(row=>force||map.get(row.record_key)!==hash(row.payload));
    const removed=isAdmin()?[...map.keys()].filter(key=>!currentKeys.has(key)):[];
    const writeChunks=chunks(changed,WRITE_BATCH);
    for(let batchIndex=0;batchIndex<writeChunks.length;batchIndex++){
      const batch=writeChunks[batchIndex];
      if(writeChunks.length>1)setStatus('syncing',`Menyimpan ${Math.min((batchIndex+1)*WRITE_BATCH,changed.length).toLocaleString('id-ID')} / ${changed.length.toLocaleString('id-ID')}...`);
      const now=new Date().toISOString(),payload=batch.map(row=>({...row,updated_at:now}));
      const {error}=await client.from(table).upsert(payload,{onConflict:'record_key'});if(error)throw error;
      batch.forEach(row=>map.set(row.record_key,hash(row.payload)));
    }
    for(const batch of chunks(removed,DELETE_BATCH)){const {error}=await client.from(table).delete().in('record_key',batch);if(error)throw error;batch.forEach(key=>map.delete(key));}
    return {changed:changed.length,removed:removed.length};
  }
  async function flush(forceTypes=null){
    if(!session||isKabeng())return false;
    if(syncing){for(let i=0;i<100&&syncing;i++)await sleep(50);if(syncing)return false;}
    syncing=true;
    let types=forceTypes||[...new Set([...pending,...freshDirty()])];
    types=types.filter(writableType);types.forEach(type=>pending.delete(type));
    if(!types.length){syncing=false;return true;}
    setStatus('syncing','Menyimpan...');
    try{
      let changed=0,removed=0;for(const type of types){const result=await syncType(type);changed+=result.changed;removed+=result.removed;}
      clearDirty(types);setStatus('online','Tersimpan online');
      const mainStatus=$('status'),terminal=/^(Sesi selesai|Proses dihentikan)/.test(mainStatus?.textContent||'');
      if(mainStatus&&(changed||removed)&&!window.PETA_GEOCODING_ACTIVE&&!terminal)mainStatus.textContent=`Versi 16.3.0 · Sinkron online selesai: ${changed} perubahan${removed?`, ${removed} dihapus`:''}.`;
      return true;
    }catch(error){types.forEach(type=>pending.add(type));console.warn('Sinkronisasi Supabase gagal:',error);setStatus('error',navigator.onLine?'Sinkron gagal':'Offline · tersimpan lokal');return false;}
    finally{syncing=false;if(pending.size&&navigator.onLine)setTimeout(()=>flush(),3000);}
  }
  function queue(type){
    if(!TABLES[type]||!writableType(type))return;
    pending.add(type);markDirty(type);clearTimeout(flushTimer);flushTimer=setTimeout(()=>flush(),250);
  }
  async function initialSync(){
    const bridge=await waitForBridge();if(typeof bridge.ready==='function')await bridge.ready();
    setStatus('syncing','Mengambil data...');const cloud=await loadCloudState();
    clearDirty(Object.keys(TABLES));await bridge.applyState(cloud);
    setStatus('online',cloud.vehicles.length?`${cloud.vehicles.length.toLocaleString('id-ID')} data online`:'Database online kosong');
    if(isSA())lockAdvisorFilters(profile.sa_code||profile.username||'');
  }
  async function pull(){
    if(!session)return;if(!isKabeng()&&(pending.size||freshDirty().some(writableType))){const saved=await flush();if(!saved)return;}if(syncing)return;
    syncing=true;setStatus('syncing','Memperbarui...');
    try{const cloud=await loadCloudState();await (await waitForBridge()).applyState(cloud);setStatus('online',`${cloud.vehicles.length.toLocaleString('id-ID')} data online`);if(isSA())lockAdvisorFilters(profile.sa_code||profile.username||'');}
    catch(error){console.warn('Mengambil data Supabase gagal:',error);setStatus('error',navigator.onLine?'Gagal memperbarui':'Offline · data lokal');}
    finally{syncing=false;}
  }
  async function startCloudSession(nextSession){
    session=nextSession;profile=null;
    if(!session){showLogin(true);setStatus('offline','Belum login');if($('cloudUserEmail'))$('cloudUserEmail').textContent='';return;}
    try{await loadProfile();showLogin(false);}catch(error){console.error(error);await client.auth.signOut();showLogin(true,error.message);setStatus('error','Akses ditolak');return;}
    if(started||starting)return;starting=true;started=true;
    try{await initialSync();clearInterval(pullTimer);pullTimer=setInterval(()=>{if(document.visibilityState==='visible')pull();},60000);}
    catch(error){console.error(error);started=false;const missing=/relation|does not exist|schema cache/i.test(error.message||'');setStatus('error',missing?'Tabel Supabase belum dibuat':'Koneksi Supabase gagal');if($('status'))$('status').textContent=missing?'Pastikan tabel Supabase dan user_profiles sudah dibuat.':`Supabase gagal: ${error.message||'Periksa koneksi.'}`;}
    finally{starting=false;}
  }
  async function init(){
    const userInput=$('cloudUsername');if(userInput){userInput.value='';userInput.placeholder='ayu / fik / ajs / wbn / kabeng';}
    const loginHelp=document.querySelector('.cloud-login-card small');if(loginHelp)loginHelp.textContent='Masuk menggunakan inisial yang sudah dibuat Admin.';
    if(!config.url||!config.publishableKey||!window.supabase?.createClient){showLogin(true,'Konfigurasi Supabase atau pustaka koneksi belum tersedia.');return;}
    client=window.supabase.createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data,error}=await client.auth.getSession();if(error)console.warn(error);await startCloudSession(data?.session||null);
    client.auth.onAuthStateChange((_event,nextSession)=>{if(nextSession?.access_token===session?.access_token)return;if(!nextSession)started=false;void startCloudSession(nextSession);});
    $('cloudLoginForm')?.addEventListener('submit',async event=>{
      event.preventDefault();const username=$('cloudUsername').value.trim().toLowerCase(),password=$('cloudPassword').value;if(!username||!password)return;
      if(!/^[a-z0-9._-]+$/.test(username)){$('cloudLoginStatus').textContent='Gunakan inisial tanpa spasi.';return;}
      const alias=(config.loginAliases||{})[username];const email=username.includes('@')?username:(alias||`${username}@atgianyar.local`);
      const button=$('cloudLoginBtn');button.disabled=true;$('cloudLoginStatus').textContent='Memeriksa akun...';
      const {error:loginError}=await client.auth.signInWithPassword({email,password});button.disabled=false;
      if(loginError)$('cloudLoginStatus').textContent='Username atau password salah.';
    });
    $('cloudLogoutBtn')?.addEventListener('click',async()=>{if(!confirm('Keluar dari aplikasi?'))return;clearInterval(pullTimer);started=false;profile=null;await client.auth.signOut();showLogin(true,'Anda sudah keluar.');});
    $('cloudSyncBtn')?.addEventListener('click',async()=>{await flush();await pull();});
    window.addEventListener('online',()=>{setStatus('syncing','Internet kembali · sinkron...');if(!isKabeng())flush();pull();});
    window.addEventListener('offline',()=>setStatus('offline','Offline · data lokal'));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&session&&navigator.onLine)pull();});
  }
  window.CloudSync={queue,flush,pull,getProfile:()=>profile};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
