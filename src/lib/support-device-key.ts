'use client';

/**
 * Device-only, non-extractable keys for new customer support conversations.
 * IndexedDB can persist CryptoKey objects via structured cloning without exporting
 * private JWKs, but this does NOT provide automatic multi-device recovery.
 */
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
async function useStore<T>(operation:(store:IDBObjectStore,resolve:(value:T)=>void,reject:(reason:Error)=>void)=>void,mode:IDBTransactionMode='readonly'):Promise<T>{
  const db=await openDatabase();
  try{
    return await new Promise<T>((resolve,reject)=>{
      const tx=db.transaction(STORE,mode);
      tx.onerror=()=>reject(new Error('Secure local key storage failed.'));
      operation(tx.objectStore(STORE),resolve,reject);
    });
  }finally{db.close();}
}
export async function loadSupportDeviceKey(uid:string):Promise<LocalSupportKey|null>{
  return useStore((store,resolve,reject)=>{
    const req=store.get('owner:'+uid);
    req.onsuccess=()=>resolve((req.result as LocalSupportKey|undefined)??null);
    req.onerror=()=>reject(new Error('Could not read the encryption key on this device.'));
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
  return useStore((store,resolve,reject)=>{
    const req=store.put(result,'owner:'+uid);
    req.onsuccess=()=>resolve(result);
    req.onerror=()=>reject(new Error('Could not save encryption keys on this device.'));
  },'readwrite');
}
