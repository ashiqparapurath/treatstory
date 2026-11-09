'use client';

import type { ReactNode } from 'react';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';

/** Non-blocking confirmation: show the pending operation and keep failures reviewable. */
export function ConfirmActionDialog({open,onOpenChange,title,description,children,confirmLabel='Confirm change',busy=false,error,destructive=false,pendingLabel='Saving…',onConfirm}:{
  open:boolean;onOpenChange:(open:boolean)=>void;title:string;description:string;children?:ReactNode;
  confirmLabel?:string;pendingLabel?:string;busy?:boolean;error?:string;destructive?:boolean;onConfirm:()=>void|Promise<void>;
}) {
  return <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent className="w-[calc(100%_-_2rem)] max-h-[90dvh] overflow-y-auto rounded-3xl border-[#e1d7c8] bg-[#fcfaf6] p-5 sm:rounded-3xl sm:p-7">
      <AlertDialogHeader><AlertDialogTitle className="pr-2 text-xl text-[#29251f]">{title}</AlertDialogTitle><AlertDialogDescription className="text-sm leading-6 text-[#756b60]">{description}</AlertDialogDescription></AlertDialogHeader>
      {children}
      {error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {busy&&<p role="status" className="text-xs text-muted-foreground">Applying your change. You can close this dialog while it finishes.</p>}
      <AlertDialogFooter className="gap-2"><AlertDialogCancel className="rounded-full border-[#ded3c4] bg-white">{busy?'Close':'Cancel'}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event=>{event.preventDefault();void onConfirm();}} className={`rounded-full ${destructive?'bg-red-700 hover:bg-red-800':'bg-[#29251f] hover:bg-[#51463a]'}`}>{busy?<><Loader2 className="mr-2 h-4 w-4 animate-spin"/>{pendingLabel}</>:confirmLabel}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
