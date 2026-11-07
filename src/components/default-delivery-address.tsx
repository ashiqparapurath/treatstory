'use client';
import { useEffect, useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useAccountData, useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MapPin, Search } from 'lucide-react';

export type DeliveryAddress = { recipient: string; phone: string; line1: string; locality: string; district: string; state: string; pincode: string };
export const emptyAddress: DeliveryAddress = { recipient:'',phone:'',line1:'',locality:'',district:'',state:'',pincode:'' };
export const addressText = (a:DeliveryAddress) => [a.line1,a.locality,a.district,a.state,a.pincode].filter(Boolean).join(', ');
export function DefaultDeliveryAddress({ onSaved }: { onSaved?: (a: DeliveryAddress) => void }) {
  const { user } = useUser(); const db = useFirestore(); const { toast } = useToast();
  const { address: savedAddress, addressLoading } = useAccountData();
  const [editing, setEditing] = useState(false);
  const [a,setA] = useState<DeliveryAddress>(emptyAddress);
  const [busy,setBusy] = useState(false); const [lookup,setLookup] = useState(false);
  const [areas,setAreas] = useState<string[]>([]);
  useEffect(() => { setA(savedAddress ?? emptyAddress); if (savedAddress) onSaved?.(savedAddress); }, [savedAddress]);
  const change = (key:keyof DeliveryAddress,value:string) => setA(v=>({...v,[key]:value}));
  async function lookupPin() {
    if(!/^\d{6}$/.test(a.pincode)) { toast({variant:'destructive',title:'Enter a valid 6-digit Indian PIN code'});return; }
    setLookup(true);
    try {
      const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),7000);
      let response:Response;
      try { response=await fetch(`https://api.postalpincode.in/pincode/${a.pincode}`,{signal:controller.signal}); } finally { clearTimeout(timer); }
      if(!response.ok) throw new Error('PIN lookup unavailable');
      const data=await response.json();
      const offices=data?.[0]?.PostOffice;
      if(!Array.isArray(offices) || !offices.length) throw new Error('PIN code not found');
      const names=Array.from(new Set(offices.map((v:{Name:string})=>v.Name).filter(Boolean))) as string[];
      setAreas(names);
      setA(v=>({...v,district:offices[0].District||'',state:offices[0].State||'',locality:names.includes(v.locality)?v.locality:names[0]||''}));
      toast({title:'Location found',description:'Please verify your locality and district.'});
    } catch { toast({variant:'destructive',title:'Could not look up PIN code',description:'You can enter district, state and locality manually.'}); }
    finally {setLookup(false);}
  }
  async function save() {
    if(!db || !user || busy) return;
    if(!a.recipient.trim() || a.phone.trim().length<5 || a.line1.trim().length<10 || !a.district.trim() || !a.state.trim() || !/^\d{6}$/.test(a.pincode)) {toast({variant:'destructive',title:'Complete your delivery address'});return;}
    setBusy(true);
    try { await setDoc(doc(db,'customer_addresses',user.uid),{...a,updatedAt:serverTimestamp()});onSaved?.(a);setEditing(false);toast({title:'Default delivery address saved'}); }
    catch(err) { toast({variant:'destructive',title:'Could not save address',description:err instanceof Error?err.message:'Check Firestore permissions.'}); }
    finally {setBusy(false);}
  }
  return <section className="w-full max-w-2xl rounded-2xl border border-[#e8e0d5] bg-white p-4 sm:rounded-3xl sm:p-6"><div className="flex items-center gap-3"><MapPin className="h-5 w-5 text-[#a68a64]"/><div><p className="text-[10px] font-semibold uppercase tracking-widest text-[#a68a64]">Saved address</p><h2 className="mt-1 text-xl font-medium">Default delivery location</h2></div></div><p className="mt-2 text-xs leading-5 text-muted-foreground">Pre-filled at checkout. Tap Edit to update your address.</p>
  {addressLoading ? <p role="status" className="mt-4 text-xs text-muted-foreground">Loading saved address…</p> : !editing ? <div className="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-xl bg-[#f7f5f1] px-4 py-3"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{savedAddress?.recipient || 'No default address saved'}</p>{savedAddress ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{savedAddress.phone} · {addressText(savedAddress)}</p> : <p className="mt-1 text-xs text-muted-foreground">Save your address once for faster checkout.</p>}</div><Button type="button" onClick={() => setEditing(true)} size="sm" variant="outline" className="shrink-0 rounded-full">{savedAddress ? 'Edit address' : 'Add address'}</Button></div> : <>
  <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium">Recipient name<Input className="mt-2" value={a.recipient} maxLength={120} onChange={e=>change('recipient',e.target.value)} /></label><label className="text-xs font-medium">Phone number<Input className="mt-2" value={a.phone} maxLength={40} onChange={e=>change('phone',e.target.value)} /></label>
  <label className="text-xs font-medium sm:col-span-2">House / building, street<Textarea rows={2} className="mt-2 min-h-16 resize-y" value={a.line1} maxLength={600} onChange={e=>change('line1',e.target.value)} /></label>
  <div className="sm:col-span-2"><label className="text-xs font-medium">PIN code</label><div className="mt-2 flex gap-2"><Input inputMode="numeric" maxLength={6} placeholder="6-digit PIN" value={a.pincode} onChange={e=>{change('pincode',e.target.value.replace(/\D/g,''));setAreas([]);}}/><Button type="button" variant="outline" disabled={lookup} onClick={lookupPin} className="shrink-0"><Search className="mr-2 h-4 w-4"/>{lookup?'Finding…':'Find location'}</Button></div></div>
  <label className="text-xs font-medium">Locality / post office{areas.length>0?<select className="mt-2 h-10 w-full rounded-md border bg-white px-3 text-sm" value={a.locality} onChange={e=>change('locality',e.target.value)}>{areas.map(v=><option key={v} value={v}>{v}</option>)}</select>:<Input className="mt-2" value={a.locality} maxLength={120} onChange={e=>change('locality',e.target.value)}/>}</label>
  <label className="text-xs font-medium">District<Input className="mt-2" value={a.district} maxLength={120} onChange={e=>change('district',e.target.value)}/></label>
  <label className="text-xs font-medium">State<Input className="mt-2" value={a.state} maxLength={120} onChange={e=>change('state',e.target.value)}/></label></div>
  <div className="mt-5 flex flex-wrap gap-2"><Button onClick={save} disabled={busy} className="h-11 rounded-full bg-[#29251f] px-6">{busy?'Saving…':'Save default address'}</Button><Button type="button" variant="outline" onClick={() => { setA(savedAddress ?? emptyAddress); setEditing(false); }} className="h-11 rounded-full">Cancel</Button></div></>}</section>;
}
