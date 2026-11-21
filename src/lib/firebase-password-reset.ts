'use client';
import { sendPasswordResetEmail, type Auth } from 'firebase/auth';

/** Firebase sends password recovery mail directly, without the Apps Script outbox. */
export async function requestFirebasePasswordReset(auth:Auth,email:string,appOrigin:string) {
  const continueUrl=new URL('/login',appOrigin);
  if(continueUrl.protocol!=='https:' && !(continueUrl.protocol==='http:' && continueUrl.hostname==='localhost'))
    throw new Error('Password reset requires a secure website.');
  await sendPasswordResetEmail(auth,email.trim(),{url:continueUrl.toString()});
}
