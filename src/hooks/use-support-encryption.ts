'use client';
import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@/firebase';
import { generateSupportKey, unlockSupportKey, type LockedSupportKey } from '@/lib/support-encryption';

type KeysResponse={teamPublicKey:JsonWebKey|null;ownKey:LockedSupportKey|null;teamKey?:LockedSupportKey|null};
export function useSupportEncryption(isTeam:boolean){
  const {user}=useUser();
  const [keys,setKeys]=useState<KeysResponse|null>(null);
  const [privateKey,setPrivateKey]=useState<CryptoKey|null>(null);
  const [busy,setBusy]=useState(false);
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
    if(!record)return;
    setBusy(true);setError('');
    try{setPrivateKey(await unlockSupportKey(record,passphrase));}
    catch(e){setError(e instanceof Error?e.message:'Could not unlock.');}
    finally{setBusy(false);}
  }
  return {keys,privateKey,busy,error,setup,unlock,refresh};
}
