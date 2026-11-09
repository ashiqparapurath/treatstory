'use client';
import { sendEmailVerification, sendPasswordResetEmail, type Auth, type User } from 'firebase/auth';
import { ActionError } from '@/lib/user-notices';

/** Security action emails stay with the authentication provider; no relay sees action codes. */
export async function requestAccountMail(action:'reset-password'|'welcome'|'verify-email',options:{email?:string;user?:User;auth?:Auth}={}) {
  if(action==='reset-password') {
    if(!options.auth)throw new ActionError('Sign-in is temporarily unavailable.',503);
    try{await sendPasswordResetEmail(options.auth,options.email?.trim()||'',{url:`${window.location.origin}/login`});}
    catch(error){if((error as {code?:string})?.code!=='auth/user-not-found')throw error;}
    return {ok:true};
  }
  if(!options.user)throw new ActionError('Sign in to continue.',401);
  if(action==='verify-email') {
    if(options.user.emailVerified)return {ok:true,alreadyVerified:true};
    await sendEmailVerification(options.user,{url:`${window.location.origin}/account`});
    return {ok:true};
  }
  const response=await fetch('/api/email/account',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await options.user.getIdToken()}`},body:JSON.stringify({action:'welcome'})});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new ActionError(body.error||'Welcome email could not be requested.',response.status);
  return body as {ok:boolean;alreadyVerified?:boolean};
}

export async function requestSellerMail(user:User,kind:'application'|'access',id:string) {
  const response=await fetch('/api/email/seller',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await user.getIdToken()}`},body:JSON.stringify({kind,id})});
  if(!response.ok)throw new ActionError('The seller change was saved, but its email update could not be queued.',response.status);
}
