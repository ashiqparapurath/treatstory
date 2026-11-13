'use client';
import { useState } from 'react';
import { collection, limit, orderBy, query } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { useSupportEncryption } from '@/hooks/use-support-encryption';
import { SupportChatThread, type SupportChatTicket } from '@/components/support-chat-thread';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Eye, EyeOff, LockKeyhole, LifeBuoy, RefreshCw } from 'lucide-react';

export function SupportInbox(){
  const db=useFirestore();
  const crypto=useSupportEncryption(true);
  const [passphrase,setPassphrase]=useState('');
  const [revealPassphrase,setRevealPassphrase]=useState(false);
  const [savedPassphrase,setSavedPassphrase]=useState(false);
  const [copyStatus,setCopyStatus]=useState('');
  const [pending,setPending]=useState(false);
  function generatePassphrase(){
    // 64 equally likely symbols, 32 characters: 192 bits of entropy.
    // Generate exclusively on the administrator's device; never send to the server.
    const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const random=new Uint8Array(32);
    globalThis.crypto.getRandomValues(random);
    setPassphrase(Array.from(random,byte=>alphabet[byte & 63]).join(''));
    setRevealPassphrase(true);
    setSavedPassphrase(false);
    setCopyStatus('');
  }
  async function copyPassphrase(){
    try{
      await navigator.clipboard.writeText(passphrase);
      setCopyStatus('Copied. Save it in your password manager and clear clipboard history.');
    }catch{
      setCopyStatus('Copy unavailable. Select and save the displayed passphrase manually.');
    }
  }
  async function submitPassphrase(){
    if(!passphrase)return;
    if(!crypto.keys?.teamKey&&!savedPassphrase)return;
    setPending(true);
    try {
      if(crypto.keys?.teamKey) await crypto.unlock(passphrase);
      else await crypto.setup(passphrase);
      // Clearing input after an unlock request avoids retaining secrets in the field.
      setPassphrase('');
      setSavedPassphrase(false);
      setRevealPassphrase(false);
      setCopyStatus('');
    } finally {
      setPending(false);
    }
  }
  const ref=useMemoFirebase(()=>db?query(collection(db,'support_tickets'),orderBy('createdAt','desc'),limit(100)):null,[db]);
  const {data,error,isLoading,retry}=useCollection<SupportChatTicket>(ref);
  return <section className="space-y-5">
    <div><p className="eyebrow text-[#a68a64]">Customer care</p><h2 className="mt-2 text-2xl font-semibold">Support conversations</h2><p className="mt-2 text-sm text-muted-foreground">Real-time, end-to-end encrypted chat with buyers and sellers. The server cannot decrypt new chat messages.</p></div>
    <div className="rounded-2xl border bg-white p-5">
      <p className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole className="h-4 w-4"/> Support team encryption key</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">The team key is encrypted with a shared passphrase. Give it only to authorized support staff through a separate secure channel. The passphrase is not recoverable, and loss makes old encrypted chats unreadable. Each agent who knows this passphrase can read all team chats.</p>
      {!crypto.keys?<p className="mt-3 text-sm">Loading encryption settings…</p>:
      !crypto.privateKey?<form className="mt-4 flex max-w-lg flex-col gap-3" onSubmit={e=>{e.preventDefault();void submitPassphrase();}}>
        <label htmlFor="support-team-passphrase" className="text-xs font-semibold">{crypto.keys.teamKey?'Unlock existing team key':'Create team encryption passphrase (12+ characters)'}</label>
        {!crypto.keys.teamKey&&<div className="rounded-xl border border-[#e6dfd5] bg-[#fcfaf6] p-3">
          <p className="mb-3 text-xs leading-5 text-[#645747]">Use a randomly generated 32-character passphrase. It is created on your device, never stored in Vercel environment variables, and cannot be recovered if lost.</p>
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={generatePassphrase} disabled={pending||crypto.busy}><RefreshCw className="mr-2 h-4 w-4"/>Generate strong passphrase</Button>
        </div>}
        <div className="flex items-center gap-2">
          <Input id="support-team-passphrase" className="min-w-0 flex-1 font-mono" type={revealPassphrase?'text':'password'} autoComplete="off" spellCheck={false} required minLength={crypto.keys.teamKey?1:12} value={passphrase} onChange={e=>{setPassphrase(e.target.value);setSavedPassphrase(false);setCopyStatus('');}}/>
          <Button type="button" variant="outline" size="icon" aria-label={revealPassphrase?'Hide passphrase':'Show passphrase'} onClick={()=>setRevealPassphrase(v=>!v)}>{revealPassphrase?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}</Button>
          {!crypto.keys.teamKey&&<Button type="button" variant="outline" size="icon" aria-label="Copy passphrase" disabled={!passphrase} onClick={()=>void copyPassphrase()}><Copy className="h-4 w-4"/></Button>}
        </div>
        {copyStatus&&<p role="status" className="text-xs text-[#645747]">{copyStatus}</p>}
        {!crypto.keys.teamKey&&<label className="flex items-start gap-3 text-xs leading-5 text-[#645747]"><input type="checkbox" checked={savedPassphrase} onChange={e=>setSavedPassphrase(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#796449]"/><span>I saved this passphrase in a secure password manager. I understand that losing it permanently blocks access to previous chats.</span></label>}
        <Button type="submit" disabled={crypto.busy||pending||!passphrase||(!crypto.keys.teamKey&&!savedPassphrase)} className="self-start">{crypto.keys.teamKey?'Unlock inbox':'Enable encrypted support chat'}</Button>
      </form>:<p className="mt-3 text-sm text-emerald-700">Support conversations unlocked for this session.</p>}
      {crypto.error&&<p role="alert" className="mt-3 text-xs text-red-700">{crypto.error}</p>}
    </div>
    {isLoading?<div className="h-36 animate-pulse rounded-2xl bg-[#eee8df]"/>:
    error?<div className="rounded-xl border bg-white p-5"><p role="alert" className="text-sm">Support inbox is unavailable. Check administrator permissions.</p><Button className="mt-4" variant="outline" onClick={retry}>Retry</Button></div>:
    !data?.length?<div className="rounded-2xl border bg-white p-10 text-center"><LifeBuoy className="mx-auto h-8 w-8 text-[#a68a64]"/><p className="mt-4 text-sm">No support conversations yet.</p></div>:
    <div className="space-y-4">{data.map(ticket=><article key={ticket.id} className="rounded-2xl border bg-white p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{ticket.encrypted?'Encrypted customer conversation':ticket.subject}</h3><p className="mt-1 text-xs capitalize text-muted-foreground">{ticket.category} · {ticket.createdAt?.toDate?.()?.toLocaleString('en-IN')||'Recently'}</p></div><span className="rounded-full bg-[#f4efe7] px-3 py-1 text-xs capitalize">{ticket.status}</span></div>
      <p className="mt-3 break-all text-xs text-muted-foreground">Customer UID: {ticket.ownerUid}{ticket.orderId?' · Order: '+ticket.orderId:''}</p>
      {ticket.encrypted?(crypto.privateKey?<SupportChatThread ticket={ticket} privateKey={crypto.privateKey} role="team"/>:<p className="mt-4 text-sm text-muted-foreground">Unlock the support team key to read and reply.</p>):
      <div className="mt-4 rounded-xl bg-[#f8f6f2] p-4 text-sm"><p className="mb-2 text-xs font-semibold text-amber-800">Legacy unencrypted ticket · view only</p><p className="whitespace-pre-wrap">{ticket.message}</p>{ticket.response&&<p className="mt-3 border-t pt-3"><strong>Previous response:</strong> {ticket.response}</p>}<p className="mt-3 text-xs text-muted-foreground">Ask the customer to start a new secure chat for further messages.</p></div>}
    </article>)}</div>}
  </section>;
}
