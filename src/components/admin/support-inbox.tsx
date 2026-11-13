'use client';
import { useState } from 'react';
import { collection, limit, orderBy, query } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { useSupportEncryption } from '@/hooks/use-support-encryption';
import { SupportChatThread, type SupportChatTicket } from '@/components/support-chat-thread';
import { SupportChatWorkspace } from '@/components/support-chat-workspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function SupportInbox(){
  const db=useFirestore();
  const crypto=useSupportEncryption(true);
  const [showLegacy,setShowLegacy]=useState(false);
  const [legacyPassphrase,setLegacyPassphrase]=useState('');
  const ref=useMemoFirebase(()=>db?query(collection(db,'support_tickets'),orderBy('createdAt','desc'),limit(100)):null,[db]);
  const {data,error,isLoading}=useCollection<SupportChatTicket>(ref);
  const legacyConversations=(data??[]).filter(item=>item.encrypted&&item.teamKeyVersion!==2);
  const notice=<div className="flex flex-wrap items-center justify-between gap-2">
    <p role={crypto.error?'alert':undefined} className={crypto.error?'text-red-700':''}>
      {crypto.error||(!crypto.keys?'Preparing secure messaging…':crypto.privateKey?'Secure messaging ready on this browser.':'Secure messaging is not available on this device.')}
    </p>
    {legacyConversations.length>0&&crypto.keys?.teamKey&&<div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" className="h-8" onClick={()=>setShowLegacy(v=>!v)}>{showLegacy?'Hide legacy unlock':'Older encrypted chats'}</Button>
      {showLegacy&&(crypto.legacyPrivateKey?<span className="text-xs text-emerald-700">Older chats unlocked</span>:
      <form className="flex items-center gap-2" onSubmit={e=>{e.preventDefault();void crypto.unlockLegacy(legacyPassphrase);setLegacyPassphrase('');}}>
        <label htmlFor="legacy-support-passphrase" className="sr-only">Previous team passphrase</label>
        <Input id="legacy-support-passphrase" type="password" autoComplete="off" value={legacyPassphrase} onChange={e=>setLegacyPassphrase(e.target.value)} placeholder="Previous team passphrase" className="h-9 w-48" required/>
        <Button size="sm" type="submit" disabled={crypto.busy||!legacyPassphrase}>Unlock</Button>
      </form>)}
    </div>}
  </div>;
  return <SupportChatWorkspace title="Customer care inbox" backHref="/admin?tab=overview" backLabel="Back to admin dashboard"
    tickets={data??[]} isLoading={isLoading} error={!!error} topNotice={notice}
    renderConversation={ticket=>{
      if(!ticket.encrypted)return <div className="h-full overflow-y-auto p-5 sm:p-10"><div className="mx-auto max-w-3xl rounded-2xl border bg-white p-6">
        <p className="mb-3 text-xs font-semibold text-amber-800">Legacy unencrypted ticket · view only</p>
        <p className="mb-3 text-xs text-muted-foreground">Customer: {ticket.ownerUid}</p>
        <p className="whitespace-pre-wrap text-sm leading-6">{ticket.message}</p>
        {ticket.response&&<p className="mt-5 border-t pt-5 text-sm"><strong>Previous response:</strong> {ticket.response}</p>}
      </div></div>;
      const old=ticket.teamKeyVersion!==2;
      const key=old?crypto.legacyPrivateKey:crypto.privateKey;
      return key?<SupportChatThread ticket={ticket} privateKey={key} role="team"/>:
        <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
          {old?'This older conversation requires the previous team passphrase. Choose “Older encrypted chats” below.':'This conversation requires the authorized administrator device. Automatic multi-device enrollment is not yet available.'}
        </div>;
    }}/>;
}
