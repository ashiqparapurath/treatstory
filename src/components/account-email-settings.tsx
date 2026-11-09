'use client';
import { useState } from 'react';
import type { User } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { requestAccountMail } from '@/lib/account-mail';
import { errorToast } from '@/lib/user-notices';
import { useToast } from '@/hooks/use-toast';
export function AccountEmailSettings({user}:{user:User}) {
  const [busy,setBusy]=useState(false);const [verified,setVerified]=useState(user.emailVerified);const {toast}=useToast();
  async function verify() {
    if(busy)return;setBusy(true);
    try {await user.reload();if(user.emailVerified){setVerified(true);toast({title:'Email address verified'});return;}
      const result=await requestAccountMail('verify-email',{user});setVerified(!!result.alreadyVerified);
      toast({title:result.alreadyVerified?'Email address verified':'Verification email requested',description:result.alreadyVerified?undefined:'Check your inbox and spam folder. Allow a few minutes for the email to arrive.'});
    }catch(error){toast(errorToast(error,'account-email'));}finally{setBusy(false);}
  }
  return <div className="mt-3"><p className="text-xs text-muted-foreground">{verified?'Your email address is verified.':'Confirm your email to keep your account details up to date.'}</p>{!verified&&<Button type="button" variant="outline" size="sm" disabled={busy} onClick={verify} className="mt-3 rounded-full">{busy?'Checking…':'Verify email address'}</Button>}</div>;
}
