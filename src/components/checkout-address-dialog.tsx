'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export type CheckoutAddress = { name: string; phone: string; address: string; pincode: string };
export function CheckoutAddressDialog({ open, onOpenChange, value, onSave }: {
  open: boolean; onOpenChange: (open: boolean) => void; value: CheckoutAddress; onSave: (value: CheckoutAddress) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (open) setDraft(value); }, [open, value.name, value.phone, value.address, value.pincode]);
  const change = (key: keyof CheckoutAddress, text: string) => setDraft(v => ({...v, [key]: text}));
  function changeOpen(next: boolean) { if (!next) setDraft(value); onOpenChange(next); }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); event.stopPropagation();
    onSave({name: draft.name.trim(), phone: draft.phone.trim(), address: draft.address.trim(), pincode: draft.pincode});
    onOpenChange(false);
  }
  return <Dialog open={open} onOpenChange={changeOpen}><DialogContent className="w-[calc(100%_-_2rem)] max-w-lg rounded-2xl"><DialogHeader><DialogTitle>Delivery address</DialogTitle><DialogDescription>Changes apply to this order. Your saved default stays the same.</DialogDescription></DialogHeader>
    <form onSubmit={save} className="space-y-4">
      <label className="block space-y-1 text-xs font-medium">Full name<Input required minLength={2} maxLength={120} autoComplete="name" value={draft.name} onChange={e => change('name', e.target.value)} /></label>
      <label className="block space-y-1 text-xs font-medium">Mobile number<Input required minLength={5} maxLength={40} autoComplete="tel" value={draft.phone} onChange={e => change('phone', e.target.value)} /></label>
      <label className="block space-y-1 text-xs font-medium">Delivery address<Textarea required minLength={10} maxLength={1000} autoComplete="street-address" rows={3} value={draft.address} onChange={e => change('address', e.target.value)} /></label>
      <label className="block space-y-1 text-xs font-medium">Delivery PIN code<Input required pattern="[0-9]{6}" inputMode="numeric" maxLength={6} autoComplete="postal-code" value={draft.pincode} onChange={e => change('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => changeOpen(false)}>Cancel</Button><Button type="submit">Use this address</Button></div>
    </form>
  </DialogContent></Dialog>;
}
