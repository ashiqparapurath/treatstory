'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useUser } from '@/firebase';
import { generateSupportKey, unlockSupportKey, type LockedSupportKey } from '@/lib/support-encryption';
import { createSupportDeviceKey, loadSupportDeviceKey } from '@/lib/support-device-key';

type KeysResponse={teamPublicKey:JsonWebKey|null;ownKey:(LockedSupportKey|{publicKey:JsonWebKey;version:2;deviceOnly:true})|null;teamKey?:LockedSupportKey|null};
export function useSupportEncryption(isTeam:boolean){
  const {user}=useUser();
  const [keys,setKeys]=useState<KeysResponse|null>(null);
  const [privateKey,setPrivateKey]=useState<CryptoKey|null>(null);
  const [busy,setBusy]=useState(false);
  const initializing=useRef<string|null>(null);
  const [error,setError]=useState('');
  const refresh=useCallback(async()=>{
    if(!user){setKeys(null);setPrivateKey(null);return;}
    const token=await user.getIdToken();
    const res=await fetch('/api/support-chat',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
    if(!res.ok)throw new Error('Encryption keys unavailable.');
    setKeys(await res.json() as KeysResponse);
  },[user]);
  useEffect(()=>{setPrivateKey(null);refresh().catch(e=>setError(String(e)));},[refresh]);
  const record=isTeam?keys?.teamKey:keys?.ownKey;
  useEffect(()=>{
    if(isTeam||!user||!keys||privateKey||initializing.current===user.uid)return;
    const uid=user.uid;
    let active=true;
    initializing.current=uid;
    const init=async()=>{
      try{
        const local=await loadSupportDeviceKey(uid);
        if(!active)return;
        if(keys.ownKey){
          if(keys.ownKey.version===2 && local && keys.ownKey.publicKey.n===local.publicKey.n){
            setPrivateKey(local.privateKey);
          }else{
            setError('Existing encrypted messages require the original device. Automatic cross-device recovery is not yet available.');
          }
          return;
        }
        const created=local??await createSupportDeviceKey(uid);
        if(!active)return;
        const response=await fetch('/api/support-chat',{
          method:'POST',
          headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},
          body:JSON.stringify({action:'registerUserDeviceKey',publicKey:created.publicKey})
        });
        if(!response.ok)throw new Error('Could not activate secure chat on this device.');
        if(!active)return;
        setPrivateKey(created.privateKey);
        await refresh();
      }catch(e){
        if(active)setError(e instanceof Error?e.message:'Secure chat setup failed.');
      }finally{if(initializing.current===uid)initializing.current=null;}
    };
    void init();
    return ()=>{active=false;};
  },[isTeam,user?.uid,keys,privateKey,refresh]);

  async function setup(passphrase:string){
    if(!user)return;
    setBusy(true);setError('');
    try{
      const key=await generateSupportKey(passphrase);
      const response=await fetch('/api/support-chat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},body:JSON.stringify({action:isTeam?'registerTeamKey':'registerUserKey',key})});
      const body=await response.json().catch(()=>({})) as {error?:string};
      if(!response.ok)throw new Error(body.error||'Could not set up encryption.');
      await refresh();
      setPrivateKey(await unlockSupportKey(key,passphrase));
    }catch(e){setError(e instanceof Error?e.message:'Encryption setup failed.');}
    finally{setBusy(false);}
  }
  async function unlock(passphrase:string){
    if(!record||!('lockedPrivateKey' in record))return;
    setBusy(true);setError('');
    try{setPrivateKey(await unlockSupportKey(record,passphrase));}
    catch(e){setError(e instanceof Error?e.message:'Could not unlock.');}
    finally{setBusy(false);}
  }
  return {keys,privateKey,busy,error,setup,unlock,refresh};
}
