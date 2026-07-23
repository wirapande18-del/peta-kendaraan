(function(){
  const config=window.PETA_SUPABASE_CONFIG||{};
  const TABLES={
    vehicles:'vehicle_records',
    followUps:'follow_up_records',
    geoCache:'geo_cache_records',
    settings:'app_settings'
  };
  const PAGE_SIZE=1000;
  const WRITE_BATCH=400;
  const DELETE_BATCH=200;
  const DIRTY_KEY='petaCloudDirtyV14';
  const known={vehicles:new Map(),followUps:new Map(),geoCache:new Map(),settings:new Map()};
  let client=null,session=null,started=false,syncing=false,pullTimer=null,flushTimer=null;
  const pending=new Set();
  const $=id=>document.getElementById(id);
  const hash=value=>JSON.stringify(value??null);
  const chunks=(rows,size)=>{const out=[];for(let i=0;i<rows.length;i+=size)out.push(rows.slice(i,i+size));return out;};
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function readDirty(){try{return new Set(JSON.parse(localStorage.getItem(DIRTY_KEY)||'[]'));}catch(_){return new Set();}}
  function writeDirty(set){try{localStorage.setItem(DIRTY_KEY,JSON.stringify([...set]));}catch(_){}}
  function markDirty(type){const dirty=readDirty();dirty.add(type);writeDirty(dirty);}
  function clearDirty(types){const dirty=readDirty();types.forEach(type=>dirty.delete(type));writeDirty(dirty);}

  function setStatus(kind,text){
    const badge=$('cloudStatusBadge');
    if(badge){badge.className=`cloud-status ${kind||''}`;badge.textContent=text;}
    const loginStatus=$('cloudLoginStatus');
    if(loginStatus&&kind==='error')loginStatus.textContent=text;
  }
  function showLogin(show,message=''){
    const modal=$('cloudLoginModal');
    if(modal)modal.classList.toggle('hidden',!show);
    if($('cloudLoginStatus'))$('cloudLoginStatus').textContent=message;
  }
  function userLabel(email=''){
    const aliases=config.loginAliases||{};
    const key=Object.keys(aliases).find(name=>String(aliases[name]).toLowerCase()===String(email).toLowerCase());
    return (config.loginDisplayNames||{})[key]||key||email;
  }
  function setUser(email=''){
    if($('cloudUserEmail'))$('cloudUserEmail').textContent=userLabel(email);
  }
  async function waitForBridge(){
    for(let i=0;i<100;i++){
      if(window.PetaCloudBridge)return window.PetaCloudBridge;
      await sleep(30);
    }
    throw new Error('Aplikasi belum siap untuk sinkronisasi.');
  }
  async function fetchAll(table){
    const rows=[];
    for(let from=0;;from+=PAGE_SIZE){
      const {data,error}=await client.from(table).select('record_key,payload,updated_at').order('record_key').range(from,from+PAGE_SIZE-1);
      if(error)throw error;
      rows.push(...(data||[]));
      if(!data||data.length<PAGE_SIZE)break;
    }
    return rows;
  }
  function seedKnown(type,rows){
    const map=known[type];map.clear();
    rows.forEach(row=>map.set(row.record_key,hash(row.payload)));
  }
  async function loadCloudState(){
    const [vehicleRows,followRows,geoRows,settingRows]=await Promise.all([
      fetchAll(TABLES.vehicles),
      fetchAll(TABLES.followUps),
      fetchAll(TABLES.geoCache),
      fetchAll(TABLES.settings)
    ]);
    seedKnown('vehicles',vehicleRows);
    seedKnown('followUps',followRows);
    seedKnown('geoCache',geoRows);
    seedKnown('settings',settingRows);
    return {
      vehicles:vehicleRows.map(row=>row.payload),
      followUps:Object.fromEntries(followRows.map(row=>[row.record_key,row.payload])),
      geoCache:Object.fromEntries(geoRows.map(row=>[row.record_key,row.payload])),
      settings:settingRows.find(row=>row.record_key==='shared')?.payload||null
    };
  }
  function currentRows(type){
    const bridge=window.PetaCloudBridge,state=bridge.getState();
    if(type==='vehicles')return state.vehicles.map((payload,index)=>({record_key:bridge.vehicleKey(payload,index),payload}));
    if(type==='followUps')return Object.entries(state.followUps||{}).map(([record_key,payload])=>({record_key,payload}));
    if(type==='geoCache')return Object.entries(state.geoCache||{}).map(([record_key,payload])=>({record_key,payload}));
    return [{record_key:'shared',payload:state.settings||{}}];
  }
  async function syncType(type,force=false){
    const table=TABLES[type],rows=currentRows(type),map=known[type],currentKeys=new Set(rows.map(row=>row.record_key));
    const changed=rows.filter(row=>force||map.get(row.record_key)!==hash(row.payload));
    const removed=[...map.keys()].filter(key=>!currentKeys.has(key));
    for(const batch of chunks(changed,WRITE_BATCH)){
      const now=new Date().toISOString();
      const payload=batch.map(row=>({...row,updated_at:now}));
      const {error}=await client.from(table).upsert(payload,{onConflict:'record_key'});
      if(error)throw error;
      batch.forEach(row=>map.set(row.record_key,hash(row.payload)));
    }
    for(const batch of chunks(removed,DELETE_BATCH)){
      const {error}=await client.from(table).delete().in('record_key',batch);
      if(error)throw error;
      batch.forEach(key=>map.delete(key));
    }
    return {changed:changed.length,removed:removed.length};
  }
  async function flush(forceTypes=null){
    if(!session||syncing)return;
    syncing=true;
    const types=forceTypes||[...pending];
    types.forEach(type=>pending.delete(type));
    if(!types.length){syncing=false;return;}
    setStatus('syncing','Menyimpan...');
    try{
      let changed=0,removed=0;
      for(const type of types){
        const result=await syncType(type);
        changed+=result.changed;removed+=result.removed;
      }
      clearDirty(types);
      setStatus('online','Tersimpan online');
      if($('status')&&(changed||removed))$('status').textContent=`Versi ${window.PETA_APP_VERSION||'14.3.0'} · Sinkron online selesai: ${changed} perubahan${removed?`, ${removed} dihapus`:''}.`;
    }catch(error){
      types.forEach(type=>pending.add(type));
      console.warn('Sinkronisasi Supabase gagal:',error);
      setStatus('error',navigator.onLine?'Sinkron gagal':'Offline · tersimpan lokal');
    }finally{
      syncing=false;
      if(pending.size&&navigator.onLine)setTimeout(()=>flush(),3000);
    }
  }
  function queue(type){
    if(!TABLES[type])return;
    pending.add(type);
    markDirty(type);
    clearTimeout(flushTimer);
    flushTimer=setTimeout(()=>flush(),900);
  }
  async function initialSync(){
    const bridge=await waitForBridge();
    if(typeof bridge.ready==='function')await bridge.ready();
    setStatus('syncing','Mengambil data...');
    let cloud=await loadCloudState();
    const local=bridge.getState();
    if(cloud.vehicles.length){
      const dirty=[...readDirty()].filter(type=>TABLES[type]);
      if(dirty.length){
        setStatus('syncing','Mengirim perubahan offline...');
        for(const type of dirty)await syncType(type);
        clearDirty(dirty);
        cloud=await loadCloudState();
      }
      await bridge.applyState(cloud);
      setStatus('online',`${cloud.vehicles.length.toLocaleString('id-ID')} data online`);
    }else if(local.vehicles.length){
      setStatus('syncing',`Mengunggah ${local.vehicles.length.toLocaleString('id-ID')} data awal...`);
      await syncType('vehicles',true);
      await syncType('followUps',true);
      await syncType('geoCache',true);
      await syncType('settings',true);
      clearDirty(Object.keys(TABLES));
      setStatus('online',`${local.vehicles.length.toLocaleString('id-ID')} data tersimpan`);
    }else{
      setStatus('online','Database online kosong');
    }
  }
  async function pull(){
    if(!session||syncing)return;
    syncing=true;
    setStatus('syncing','Memperbarui...');
    try{
      const cloud=await loadCloudState();
      await (await waitForBridge()).applyState(cloud);
      setStatus('online',`${cloud.vehicles.length.toLocaleString('id-ID')} data online`);
    }catch(error){
      console.warn('Mengambil data Supabase gagal:',error);
      setStatus('error',navigator.onLine?'Gagal memperbarui':'Offline · data lokal');
    }finally{syncing=false;}
  }
  async function startCloudSession(nextSession){
    session=nextSession;
    if(!session){showLogin(true);setStatus('offline','Belum login');setUser('');return;}
    showLogin(false);setUser(session.user?.email||'Pengguna');
    if(started)return;
    started=true;
    try{
      await initialSync();
      clearInterval(pullTimer);
      pullTimer=setInterval(()=>{if(document.visibilityState==='visible')pull();},60000);
    }catch(error){
      console.error(error);
      started=false;
      const missing=/relation|does not exist|schema cache/i.test(error.message||'');
      setStatus('error',missing?'Tabel Supabase belum dibuat':'Koneksi Supabase gagal');
      if($('status'))$('status').textContent=missing?'Jalankan file SETUP-SUPABASE-V14.sql di SQL Editor Supabase terlebih dahulu.':`Supabase gagal: ${error.message||'Periksa koneksi.'}`;
    }
  }
  async function init(){
    if(!config.url||!config.publishableKey||!window.supabase?.createClient){
      showLogin(true,'Konfigurasi Supabase atau pustaka koneksi belum tersedia.');
      return;
    }
    client=window.supabase.createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data,error}=await client.auth.getSession();
    if(error)console.warn(error);
    await startCloudSession(data?.session||null);
    client.auth.onAuthStateChange((_event,nextSession)=>{
      if(nextSession?.access_token===session?.access_token)return;
      if(!nextSession)started=false;
      startCloudSession(nextSession);
    });
    $('cloudLoginForm')?.addEventListener('submit',async event=>{
      event.preventDefault();
      const username=$('cloudUsername').value.trim().toLowerCase(),password=$('cloudPassword').value;
      if(!username||!password)return;
      const email=username.includes('@')?username:(config.loginAliases||{})[username];
      if(!email){$('cloudLoginStatus').textContent='Nama pengguna tidak terdaftar.';return;}
      const button=$('cloudLoginBtn');button.disabled=true;$('cloudLoginStatus').textContent='Memeriksa akun...';
      const {error:loginError}=await client.auth.signInWithPassword({email,password});
      button.disabled=false;
      if(loginError)$('cloudLoginStatus').textContent='Login gagal: '+loginError.message;
    });
    $('cloudLogoutBtn')?.addEventListener('click',async()=>{
      if(!confirm('Keluar dari penyimpanan online?'))return;
      clearInterval(pullTimer);started=false;await client.auth.signOut();showLogin(true,'Anda sudah keluar.');
    });
    $('cloudSyncBtn')?.addEventListener('click',async()=>{await flush();await pull();});
    window.addEventListener('online',()=>{setStatus('syncing','Internet kembali · sinkron...');flush();});
    window.addEventListener('offline',()=>setStatus('offline','Offline · tersimpan lokal'));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&session&&navigator.onLine)pull();});
  }
  window.CloudSync={queue,flush,pull};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
