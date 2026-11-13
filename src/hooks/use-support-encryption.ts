'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useUser } from '@/firebase';
import { unlockSupportKey, type LockedSupportKey } from '@/lib/support-encryption';
import { createSupportDeviceKey, loadSupportDeviceKey } from '@/lib/support-device-key';

type DeviceKeyRecord={publicKey:JsonWebKey;version:2;deviceOnly:true;createdBy?:string};
type KeysResponse={
  teamPublicKey:JsonWebKey|null;
  teamDeviceKey:DeviceKeyRecord|null;
  ownKey:(LockedSupportKey|DeviceKeyRecord)|null;
  teamKey?:LockedSupportKey|null;
};

export function useSupportEncryption(isTeam:boolean){
  const {user}=useUser();
  const [keys,setKeys]=useState<KeysResponse|null>(null);
  const [privateKey,setPrivateKey]=useState<CryptoKey|null>(null);
  const [legacyPrivateKey,setLegacyPrivateKey]=useState<CryptoKey|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const attempted=useRef<string|null>(null);

  const refresh=useCallback(async()=>{
    if(!user){setKeys(null);setPrivateKey(null);return;}
    const res=await fetch('/api/support-chat',{headers:{Authorization:'Bearer '+await user.getIdToken()},cache:'no-store'});
    if(!res.ok)throw new Error('Secure support configuration is unavailable.');
    setKeys(await res.json() as KeysResponse);
  },[user]);

  useEffect(()=>{
    attempted.current=null;
    setPrivateKey(null);
    setLegacyPrivateKey(null);
    setError('');
    void refresh().catch(e=>setError(e instanceof Error?e.message:'Unable to load secure chat.'));
  },[refresh]);

  const record=isTeam?keys?.teamDeviceKey:keys?.ownKey;
  useEffect(()=>{
    if(!user||!keys||privateKey)return;
    const uid=user.uid;
    const scope=isTeam?'team:':'owner:';
    const attemptId=scope+uid+':'+(record?.publicKey.n??'new');
    if(attempted.current===attemptId)return;
    attempted.current=attemptId;
    let active=true;
    const init=async()=>{
      try{
        if(isTeam&&!('teamKey' in keys)){
          throw new Error('Administrator access is required for the support inbox.');
        }
        const local=await loadSupportDeviceKey(isTeam?'team:'+uid:uid);
        if(!active)return;
        if(record){
          if(record.version===2 && local && record.publicKey.n===local.publicKey.n){
            setPrivateKey(local.privateKey);
          }else{
            setError(isTeam
              ?'Secure support was activated on another administrator device. It cannot be unlocked here without an approved device-transfer process.'
              :'This account has a key from a different device or the previous encryption version. Its encrypted history cannot be opened here.');
          }
          return;
        }
        if(!isTeam&&keys.ownKey){
          setError('Existing customer messages require the original encryption setup.');
          return;
        }
        const generated=local??await createSupportDeviceKey(isTeam?'team:'+uid:uid);
        if(!active)return;
        const response=await fetch('/api/support-chat',{
          method:'POST',
          headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},
          body:JSON.stringify(isTeam
            ?{action:'registerTeamDeviceKey',publicKey:generated.publicKey}
            :{action:'registerUserDeviceKey',publicKey:generated.publicKey}),
        });
        if(!response.ok){
          const details=await response.json().catch(()=>({})) as {error?:string};
          throw new Error(details.error||'Could not activate secure messaging on this device.');
        }
        if(!active)return;
        setPrivateKey(generated.privateKey);
        await refresh();
      }catch(e){
        if(active)setError(e instanceof Error?e.message:'Could not configure secure messaging.');
      }
    };
    void init();
    return ()=>{active=false;};
  },[isTeam,user?.uid,keys,privateKey,record?.publicKey.n,refresh]);

  async function unlockLegacy(passphrase:string){
    if(!isTeam||!keys?.teamKey)return;
    setBusy(true);setError('');
    try{
      setLegacyPrivateKey(await unlockSupportKey(keys.teamKey,passphrase));
    }catch(e){
      setError(e instanceof Error?e.message:'Unable to unlock earlier conversations.');
    }finally{setBusy(false);}
  }
  return {keys,privateKey,legacyPrivateKey,busy,error,unlockLegacy,refresh};
}
