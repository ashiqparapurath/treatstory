'use client';
import type { User } from 'firebase/auth';
import { ActionError } from '@/lib/user-notices';

/** Welcome and verification still use the signed Apps Script outbox.
 * Password recovery now uses Firebase Authentication directly.
 */
export async function requestAccountMail(action:'welcome'|'verify-email',options:{user:User}) {
  const token=await options.user.getIdToken();
  const response=await fetch('/api/email/account',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({action})});
  const body=await response.json().catch(()=>null);
  if(!response.ok)throw new ActionError(body?.error||'Account email could not be requested.',response.status);
  if(body?.ok!==true)throw new ActionError('The email service did not confirm your request. Please try again.',503);
  return body as {ok:boolean;alreadyVerified?:boolean};
}

export async function requestSellerMail(user:User,kind:'application'|'access',id:string) {
  const response=await fetch('/api/email/seller',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await user.getIdToken()}`},body:JSON.stringify({kind,id})});
  if(!response.ok)throw new ActionError('The seller change was saved, but its email update could not be queued.',response.status);
}
