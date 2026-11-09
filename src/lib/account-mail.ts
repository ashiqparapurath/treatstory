import type { User } from 'firebase/auth';
import { ActionError } from '@/lib/user-notices';
export async function requestAccountMail(action:'reset-password'|'welcome'|'verify-email',options:{email?:string;user?:User}={}) {
  const token=options.user?await options.user.getIdToken():null;
  const response=await fetch('/api/email/account',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({action,...(action==='reset-password'?{email:options.email?.trim()}:{})})});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new ActionError(body.error||'Account email could not be requested.',response.status);
  return body as {ok:boolean;queued?:boolean;alreadyVerified?:boolean};
}

export async function requestSellerMail(user:User,kind:'application'|'access',id:string) {
  const response=await fetch('/api/email/seller',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await user.getIdToken()}`},body:JSON.stringify({kind,id})});
  if(!response.ok)throw new ActionError('The seller change was saved, but its email update could not be queued.',response.status);
}
