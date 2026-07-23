// Penyimpanan data besar berbasis IndexedDB untuk ribuan kendaraan.
(function(){
  const DB_NAME='PetaKendaraanServiceLargeV13';
  const STORE='state';
  let dbPromise;
  function open(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      if(!('indexedDB' in window))return reject(new Error('IndexedDB tidak tersedia'));
      const req=indexedDB.open(DB_NAME,1);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);};
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('Penyimpanan data besar gagal dibuka'));
    });
    return dbPromise;
  }
  async function transact(mode,action){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE),req=action(store);
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('Operasi penyimpanan gagal'));
      tx.onabort=()=>reject(tx.error||new Error('Penyimpanan dibatalkan'));
    });
  }
  const BigStore={
    get:key=>transact('readonly',s=>s.get(key)),
    set:(key,value)=>transact('readwrite',s=>s.put(value,key)),
    remove:key=>transact('readwrite',s=>s.delete(key)),
    async estimate(){return navigator.storage?.estimate?await navigator.storage.estimate():{};}
  };
  window.BigStore=BigStore;
})();
