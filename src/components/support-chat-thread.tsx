'use client';
import { useEffect, useState, type FormEvent } from 'react';
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
  return <div className="mt-4 rounded-2xl border border-[#e5ded3] bg-[#fcfaf6] p-3 sm:p-5">
    <p className="flex items-center gap-2 text-xs text-[#76644e]"><LockKeyhole className="h-4 w-4"/> Message text is encrypted on your device. Existing conversations may be unavailable on a different device.</p>
    <div className="mt-4 max-h-[420px] min-h-32 space-y-3 overflow-y-auto" aria-live="polite">
      {messagesLoading?<p className="text-sm text-muted-foreground">Loading messages…</p>:error?<p role="alert" className="text-sm text-red-700">Messages unavailable. Check access permissions.</p>:
        data?.map(item=><div key={item.id} className={'flex '+((role==='owner'?item.senderUid===user?.uid:item.senderUid!==ticket.ownerUid)?'justify-end':'justify-start')}>
          <div className="max-w-[88%] rounded-2xl bg-white px-4 py-3 shadow-sm sm:max-w-[75%]">
            <p className="mb-1 text-[11px] font-semibold text-[#8c755c]">{item.senderUid===ticket.ownerUid?'Customer':'TreatStory support'}</p>
            <p className="whitespace-pre-wrap break-words text-sm">{texts[item.id]??'Decrypting…'}</p>
            <p className="mt-2 text-[10px] text-muted-foreground">{item.createdAt?.toDate?.()?.toLocaleString()??''}</p>
          </div>
        </div>)}
      {!data?.length&&!messagesLoading&&<p className="text-sm text-muted-foreground">No messages yet.</p>}
    </div>
    {ticket.status!=='closed'?<form className="mt-4 flex flex-col gap-2 border-t pt-4" onSubmit={e=>void post('send',e)}>
      <label className="text-xs font-semibold" htmlFor={'reply-'+ticket.id}>Reply securely</label>
      <Textarea id={'reply-'+ticket.id} value={draft} onChange={e=>setDraft(e.target.value)} maxLength={2000} rows={3} placeholder="Write a message…" required/>
      <div className="flex items-center justify-between gap-2"><span className="text-[11px] text-muted-foreground">{draft.length}/2000</span>
        <div className="flex gap-2">{role==='team'&&<Button type="button" variant="outline" disabled={busy} onClick={()=>void post('close')}>Close chat</Button>}
          <Button type="submit" disabled={busy||!draft.trim()}><Send className="mr-2 h-4 w-4"/>Send</Button></div>
      </div>
    </form>:<p className="mt-4 text-xs text-muted-foreground">Conversation closed.</p>}
    {failure&&<p role="alert" className="mt-3 text-sm text-red-700">{failure}</p>}
  </div>;
}
