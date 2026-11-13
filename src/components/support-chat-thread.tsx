'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { collection, limit, orderBy, query } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { encryptSupportMessage, decryptSupportMessage, type EncryptedSupportMessage } from '@/lib/support-encryption';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { LockKeyhole, Send } from 'lucide-react';

export type SupportChatTicket = {
  id:string;ownerUid:string;category:string;orderId?:string;subject?:string;
  status:string;encrypted?:boolean;teamKeyVersion?:number;message?:string;response?:string;
  ownerPublicKey:JsonWebKey;teamPublicKey:JsonWebKey;
  createdAt?:{toDate?:()=>Date};updatedAt?:{toDate?:()=>Date};
};
type Message = EncryptedSupportMessage & {id:string;senderUid:string;createdAt?:{toDate?:()=>Date}};
export function SupportChatThread({ticket,privateKey,role}:{ticket:SupportChatTicket;privateKey:CryptoKey;role:'owner'|'team'}){
  const db=useFirestore();const {user}=useUser();
  const [draft,setDraft]=useState('');const [busy,setBusy]=useState(false);
  const [texts,setTexts]=useState<Record<string,string>>({});
  const [failure,setFailure]=useState('');
  const endRef=useRef<HTMLDivElement|null>(null);
  const ref=useMemoFirebase(()=>db?query(collection(db,'support_tickets',ticket.id,'messages'),orderBy('createdAt','asc'),limit(200)):null,[db,ticket.id]);
  const {data,messagesLoading,error}=(()=>{const result=useCollection<Message>(ref);return {data:result.data,messagesLoading:result.isLoading,error:result.error};})();
  useEffect(()=>{
    let active=true;
    setTexts({});
    if(!data?.length)return;
    Promise.all(data.map(async item=>{
      try{return [item.id,await decryptSupportMessage(item,privateKey,role)] as const;}
      catch{return [item.id,'Unable to decrypt this message.'] as const;}
    })).then(entries=>{if(active)setTexts(Object.fromEntries(entries));});
    return ()=>{active=false;};
  },[data,privateKey,role,ticket.id]);
  useEffect(()=>{endRef.current?.scrollIntoView({block:'end',behavior:'smooth'});},[data?.length,texts]);
  async function post(action:'send'|'close',e?:FormEvent){
    e?.preventDefault();if(!user||busy)return;
    setBusy(true);setFailure('');
    try{
      const payload=action==='send'
        ?{action,ticketId:ticket.id,encrypted:await encryptSupportMessage(draft,ticket.ownerPublicKey,ticket.teamPublicKey)}
        :{action,ticketId:ticket.id};
      const res=await fetch('/api/support-chat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},body:JSON.stringify(payload)});
      const body=await res.json().catch(()=>({})) as {error?:string};
      if(!res.ok)throw new Error(body.error||'Could not update conversation.');
      if(action==='send')setDraft('');
    }catch(e){setFailure(e instanceof Error?e.message:'Could not send message.');}
    finally{setBusy(false);}
  }
  return <div className="flex h-full min-h-0 flex-col bg-[#fbf9f5]">
    <div className="flex items-center justify-center gap-2 border-b border-[#ece6dd] bg-[#f8f5ef] px-4 py-2 text-[11px] text-[#827668]">
      <LockKeyhole className="h-3 w-3 shrink-0"/> Message content is encrypted on this device
    </div>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-5 sm:px-8 sm:py-7" aria-live="polite" aria-label="Conversation messages">
      {messagesLoading?<p className="text-center text-sm text-muted-foreground">Loading messages…</p>:error?<p role="alert" className="text-center text-sm text-red-700">Messages unavailable. Check access permissions.</p>:
        data?.map(item=>{
          const outgoing=item.senderUid===user?.uid;
          return <div key={item.id} className={`flex ${outgoing?'justify-end':'justify-start'}`}>
            <div className={`max-w-[86%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[68%] ${outgoing?'rounded-br-md bg-[#e9e1d4] text-[#2f2a24]':'rounded-bl-md border border-[#eae5de] bg-white text-[#312d27]'}`}>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#8a765e]">{item.senderUid===ticket.ownerUid?'Customer':'TreatStory support'}</p>
              <p className="whitespace-pre-wrap break-words text-[14px] leading-6">{texts[item.id]??'Decrypting…'}</p>
              <p className="mt-2 text-right text-[10px] text-[#897f73]">{item.createdAt?.toDate?.()?.toLocaleString()??''}</p>
            </div>
          </div>;
        })}
      {!data?.length&&!messagesLoading&&<p className="text-center text-sm text-muted-foreground">No messages yet.</p>}
      <div ref={endRef}/>
    </div>
    {ticket.status!=='closed'?<form className="shrink-0 border-t border-[#ece6dd] bg-white px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6" onSubmit={e=>void post('send',e)}>
      <div className="mx-auto flex max-w-5xl items-end gap-2 sm:gap-3">
        <label className="sr-only" htmlFor={'reply-'+ticket.id}>Message</label>
        <Textarea id={'reply-'+ticket.id} value={draft} onChange={e=>setDraft(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(draft.trim()&&!busy)void post('send');}}}
          maxLength={2000} rows={2} className="min-h-11 max-h-36 flex-1 resize-none rounded-2xl border-[#e7e0d6] bg-[#faf8f5] px-4 py-3 text-sm"
          placeholder="Write a message…" required/>
        <Button aria-label="Send message" type="submit" size="icon" className="h-11 w-11 shrink-0 rounded-full bg-[#312a23] text-white hover:bg-[#554536]" disabled={busy||!draft.trim()}><Send className="h-4 w-4"/></Button>
      </div>
      {role==='team'&&<div className="mx-auto mt-2 flex max-w-5xl justify-end"><button type="button" className="text-xs text-[#857568] underline underline-offset-2" disabled={busy} onClick={()=>void post('close')}>Close conversation</button></div>}
      {failure&&<p role="alert" className="mx-auto mt-2 max-w-5xl text-xs text-red-700">{failure}</p>}
    </form>:<p className="shrink-0 border-t bg-white p-4 text-center text-sm text-muted-foreground">Conversation closed</p>}
  </div>;
}
