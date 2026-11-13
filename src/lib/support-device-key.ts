'use client';

/** Legacy device-local keys. Never replace a persisted identity, including when
 * multiple tabs initialize concurrently. This is not multi-device enrollment. */
type LocalSupportKey = { publicKey: JsonWebKey; privateKey: CryptoKey };
const DB_NAME='treatstory-private-support-v1';
const STORE='device-keys';
const openDatabase=()=>new Promise<IDBDatabase>((resolve,reject)=>{
  if(typeof indexedDB==='undefined'){reject(new Error('Private browsing or this browser prevents secure device key storage.'));return;}
  const request=indexedDB.open(DB_NAME,1);
  request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(new Error('Unable to open secure key storage on this device.'));
});
async function useStore<T>(operation:(store:IDBObjectStore,setResult:(value:T)=>void)=>void,mode:IDBTransactionMode='readonly'):Promise<T>{
  const db=await openDatabase();
  try{
    return await new Promise<T>((resolve,reject)=>{
      const tx=db.transaction(STORE,mode);
      let result:T;
      // Request success is not durability: a later transaction abort must reject.
      tx.oncomplete=()=>resolve(result);
      tx.onabort=()=>reject(new Error('Secure local key storage failed. Existing keys were not replaced.'));
      tx.onerror=()=>reject(new Error('Secure local key storage failed.'));
      operation(tx.objectStore(STORE),value=>{result=value;});
    });
  }finally{db.close();}
}
export async function loadSupportDeviceKey(uid:string):Promise<LocalSupportKey|null>{
  return useStore((store,setResult)=>{
    const req=store.get('owner:'+uid);
    req.onsuccess=()=>setResult((req.result as LocalSupportKey|undefined)??null);
  });
}
export async function createSupportDeviceKey(uid:string):Promise<LocalSupportKey>{
  const existing=await loadSupportDeviceKey(uid);
  if(existing)return existing;
  const pair=await crypto.subtle.generateKey({
    name:'RSA-OAEP',modulusLength:3072,
    publicExponent:new Uint8Array([1,0,1]) as BufferSource,hash:'SHA-256',
  } as RsaHashedKeyGenParams,false,['encrypt','decrypt']);
  const result={publicKey:await crypto.subtle.exportKey('jwk',pair.publicKey),privateKey:pair.privateKey};
  return useStore((store,setResult)=>{
    // Read and add share one serialized read/write transaction. Another tab's
    // committed key wins; put() would silently destroy its private identity.
    const req=store.get('owner:'+uid);
    req.onsuccess=()=>{
      if(req.result!==undefined){setResult(req.result as LocalSupportKey);return;}
      store.add(result,'owner:'+uid);
      setResult(result);
    };
  },'readwrite');
}
