'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ArrowLeft, LifeBuoy, LockKeyhole, MessageCircle, Plus, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { SupportChatTicket } from '@/lib/support-conversation-types';

type Props={
  tickets:SupportChatTicket[];
  title:string;
  secure?:boolean;
  backHref:string;
  backLabel:string;
  isLoading?:boolean;
  openTicketId?:string|null;
  error?:boolean;
  newConversation?:ReactNode;
  topNotice?:ReactNode;
  renderConversation:(ticket:SupportChatTicket)=>ReactNode;
};
const stamp=(ticket:SupportChatTicket)=>ticket.updatedAt?.toDate?.()?.getTime()||ticket.createdAt?.toDate?.()?.getTime()||0;
export function SupportChatWorkspace({tickets,title,backHref,backLabel,isLoading,error,openTicketId,newConversation,topNotice,renderConversation,secure=true}:Props){
  const [selected,setSelected]=useState<string|null>(null);
  const [compose,setCompose]=useState(false);
  const [filter,setFilter]=useState('');
  const [statusFilter,setStatusFilter]=useState('all');
  const [mounted,setMounted]=useState(false);
  useEffect(()=>{
    setMounted(true);
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const update=()=>document.documentElement.style.setProperty('--support-visible-height', `${window.visualViewport?.height??window.innerHeight}px`);
    update();window.visualViewport?.addEventListener('resize',update);
    return ()=>{document.body.style.overflow=previous;window.visualViewport?.removeEventListener('resize',update);document.documentElement.style.removeProperty('--support-visible-height');};
  },[]);
  const sorted=[...tickets].sort((a,b)=>stamp(b)-stamp(a));
  const visible=sorted.filter(t=>(statusFilter==='all'||(statusFilter==='open'?t.status!=='closed':t.status===statusFilter))&&[t.subject,t.category,t.orderId,t.ownerUid,t.lastPreview].some(value=>value?.toLowerCase().includes(filter.toLowerCase())));
  const ticket=sorted.find(item=>item.id===selected)||null;
  useEffect(()=>{if(openTicketId&&tickets.some(item=>item.id===openTicketId)){setSelected(openTicketId);setCompose(false);}},[openTicketId,tickets]);
  function pick(id:string){setSelected(id);setCompose(false);}
  if(!mounted)return null;
  return createPortal(<div style={{height:'var(--support-visible-height, 100dvh)',paddingLeft:'env(safe-area-inset-left)',paddingRight:'env(safe-area-inset-right)'}} className="fixed inset-0 z-[200] isolate flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#f7f5f1] text-[#332d27]">
    <div style={{paddingTop:'env(safe-area-inset-top)',height:'calc(4rem + env(safe-area-inset-top))'}} className="flex h-16 shrink-0 items-center justify-between border-b border-[#e8e2d8] bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Link href={backHref} aria-label={backLabel} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#eee6dc] hover:bg-[#f6f0e9]"><ArrowLeft className="h-4 w-4"/></Link>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#302a24] text-white"><LifeBuoy className="h-4 w-4"/></div>
        <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a68a64]">TreatStory care</p><h1 className="truncate text-sm font-semibold sm:text-base">{title}</h1></div>
      </div>
      <span className="hidden items-center gap-1.5 text-xs text-[#887a69] sm:flex">{secure?<LockKeyhole className="h-3.5 w-3.5"/>:<MessageCircle className="h-3.5 w-3.5"/>}{secure?"Encrypted conversations":"Support tickets · not end-to-end encrypted"}</span>
    </div>
    <div className="flex min-h-0 flex-1 items-stretch overflow-hidden">
      <aside aria-label="Support conversations" className={`${ticket||compose?'hidden md:flex':'flex'} w-full shrink-0 flex-col border-r border-[#e8e2d8] bg-white md:w-[310px] lg:w-[365px]`}>
        <div className="shrink-0 space-y-3 border-b border-[#ede7df] bg-white p-4">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Conversations</h2>{newConversation&&<button type="button" className="flex items-center gap-1 rounded-full bg-[#302a24] px-3 py-2 text-xs font-semibold text-white hover:bg-[#504238]" onClick={()=>{setCompose(true);setSelected(null);}}><Plus className="h-3.5 w-3.5"/>New chat</button>}</div>
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#9b8e80]"/><Input aria-label="Search conversations" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Search conversations" className="h-10 rounded-xl border-[#e8e0d5] bg-[#faf8f5] pl-9"/></div>
          <div className="flex gap-2" aria-label="Filter conversation status">{['all','open','closed'].map(status=><button key={status} aria-pressed={statusFilter===status} className={`rounded-full px-3 py-1 text-xs capitalize ${statusFilter===status?'bg-[#302a24] text-white':'bg-[#f5f0e9]'}`} onClick={()=>setStatusFilter(status)}>{status}</button>)}</div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading?<p className="p-5 text-sm text-muted-foreground">Loading conversations…</p>:error?<p className="p-5 text-sm text-red-700" role="alert">Unable to load conversations.</p>:
          !visible.length?<p className="p-5 text-sm text-muted-foreground">{filter?'No matching conversations.':'Your support conversations will appear here.'}</p>:
          visible.map(item=><button key={item.id} data-conversation-id={item.id} type="button" onClick={()=>pick(item.id)} aria-current={selected===item.id?'true':undefined} className={`flex w-full items-start gap-3 border-b border-[#f1ece5] px-4 py-4 text-left transition hover:bg-[#faf7f1] ${selected===item.id?'bg-[#f3ede4]':''}`}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#f0e8dc] text-[#8f7557]"><MessageCircle className="h-4 w-4"/></span>
            <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{item.participantLabel||(item.encrypted?'Support conversation':item.subject||'Support request')}</span><span className="shrink-0 text-[10px] text-[#958a7c]">{item.updatedAt?.toDate?.()?.toLocaleDateString()||''}</span></span>
              <span className="mt-1 flex justify-between gap-2"><span className="truncate text-xs capitalize text-[#857768]">{item.category}{item.orderId?' · Order linked':''}</span><span className="text-[10px] capitalize text-[#8a785f]">{item.status}</span></span>
              {item.lastPreview&&<span className="mt-1 block truncate text-xs text-[#857768]">{item.lastPreview}</span>}{!!item.unread&&<span className="mt-1 inline-block rounded-full bg-[#302a24] px-2 py-0.5 text-[10px] text-white" aria-label={`${item.unread} unread messages`}>{item.unread}</span>}
            </span>
          </button>)}
        </div>
      </aside>
      <section aria-label="Selected support chat" className={`${ticket||compose?'flex':'hidden md:flex'} min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#fbf9f5]`}>
        {compose?<><div className="flex h-16 shrink-0 items-center gap-3 border-b bg-white px-4 sm:px-6"><button type="button" aria-label="Back to conversations" className="md:hidden" onClick={()=>setCompose(false)}><ArrowLeft className="h-5 w-5"/></button><h2 className="text-base font-semibold">New conversation</h2><button type="button" aria-label="Close new chat" className="ml-auto hidden md:block" onClick={()=>setCompose(false)}><X className="h-4 w-4"/></button></div><div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-8"><div className="mx-auto max-w-xl">{newConversation}</div></div></>:
        ticket?<><div className="flex h-16 shrink-0 items-center gap-3 border-b border-[#ece6dd] bg-white px-4 sm:px-6">
          <button type="button" aria-label="Back to conversations" className="grid h-9 w-9 place-items-center md:hidden" onClick={()=>setSelected(null)}><ArrowLeft className="h-5 w-5"/></button>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#f1e8dd]"><MessageCircle className="h-4 w-4 text-[#94795d]"/></span>
          <div className="min-w-0"><h2 className="truncate text-sm font-semibold">{ticket.participantLabel||(ticket.encrypted?'TreatStory support':ticket.subject||'Support request')}</h2><p className="truncate text-[11px] capitalize text-[#887968]">{ticket.category} · {ticket.status}{ticket.orderId?' · Order linked':''}</p></div>
          {secure?<LockKeyhole className="ml-auto h-4 w-4 text-[#8d7b66]"/>:<span className="ml-auto hidden text-[10px] text-[#81715e] sm:block">Not end-to-end encrypted</span>}
        </div>
          <div className="min-h-0 flex-1">{renderConversation(ticket)}</div>
        </>:
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center"><span className="grid h-16 w-16 place-items-center rounded-2xl bg-[#efe7dc]"><MessageCircle className="h-7 w-7 text-[#9d805e]"/></span><h2 className="text-lg font-semibold">Your messages, all in one place</h2><p className="max-w-sm text-sm text-[#8a7e6e]">Choose a conversation to read your messages, or start a new support request.</p>{newConversation&&<button type="button" onClick={()=>setCompose(true)} className="mt-2 rounded-full bg-[#302a24] px-5 py-3 text-sm text-white">Start new conversation</button>}</div>}
      </section>
    </div>
    {topNotice&&<div style={{paddingBottom:'max(0.5rem,env(safe-area-inset-bottom))'}} className="shrink-0 border-t border-[#e8e0d6] bg-white px-4 py-2 text-xs text-[#897a69]">{topNotice}</div>}
  </div>,document.body);
}
