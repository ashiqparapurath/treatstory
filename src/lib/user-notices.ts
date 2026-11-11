/** Plain-language feedback shared by user actions. Never display raw SDK errors. */
const operations = {
  'sign-in': ['Could not sign in', 'Check your details and try again.'],
  register: ['Could not create your account', 'Please try again. If you have already registered, sign in instead.'],
  'account-email': ['Could not request the account email', 'Please try again later. Your account remains available.'],
  'reset-password': ['Could not send the reset link', 'Check your email address and try again.'],
  'save-profile': ['Your profile was not saved', 'Keep your changes and try saving again.'],
  'save-address': ['Your address was not saved', 'Your entered details are still here. Please try again.'],
  'save-product': ['Could not confirm the product save', 'Your changes are still in the editor. Check your product list before trying again.'],
  'delete-product': ['Could not confirm product deletion', 'Refresh your product list to check its current state before trying again.'],
  'save-store': ['Store settings were not saved', 'Your changes are still here. Please try again.'],
  'upload-photo': ['Your photo was not uploaded', 'Choose the photo again and retry.'],
  checkout: ['Your order could not be confirmed', 'Keep this checkout open and retry. Check your orders before starting a new purchase.'],
  quote: ['Could not confirm the quote update', 'Your details are still here. Check Your requests before sending again.'],
  'update-order': ['The order was not updated', 'Refresh the order to see its latest status, then try again.'],
  'sign-out': ['You are still signed in', 'Please try signing out again.'],
  review: ['Your review was not saved', 'Keep your review text and try again.'],
  support: ['Could not confirm the support update', 'Keep your message and check your requests before sending again.'],
  'seller-application': ['Your seller application was not sent', 'Your details are still here. Please try again.'],
  'seller-access': ['Could not confirm the access change', 'Check the seller’s current access before confirming again.'],
  save: ['Your changes were not saved', 'Keep your changes and try again.'],
  delete: ['The item was not deleted', 'Refresh the list and try again.'],
  load: ['Could not load this section', 'Please try loading it again.'],
  copy: ['Could not copy the text', 'Select the text and copy it manually.'],
} as const;
export type NoticeContext = keyof typeof operations;
export type UserNotice = { title: string; description: string; field?: 'email' | 'password' | 'name' | 'credentials' };

/** Only explicitly public application/API messages may be shown verbatim. */
export class ActionError extends Error {
  constructor(message: string, public status?: number, public code?: string) { super(message); this.name = 'ActionError'; }
}
const technical = /firebase|firestore|cloudinary|vercel|genkit|stack trace|\bat\s+\S+\.(?:js|tsx?):\d+|api[_ -]?key|private[_ -]?key|service[_ -]?account|PERMISSION_DENIED|https?:\/\/|<html|collection.*index/i;
function publicMessage(error: unknown): string | null {
  if (!(error instanceof ActionError)) return null;
  const message = error.message.trim();
  return message && message.length <= 600 && !technical.test(message) ? message : null;
}
export function getErrorNotice(error: unknown, context: NoticeContext = 'save'): UserNotice {
  const e = error as { code?: unknown; status?: unknown; name?: unknown } | null;
  const code = typeof e?.code === 'string' ? e.code : '';
  const status = typeof e?.status === 'number' ? e.status : 0;
  const [title, fallback] = operations[context];
  if (code === 'auth/invalid-email') return {title:'Check your email address', description:'Enter a complete email address, such as name@example.com.', field:'email'};
  if (['auth/invalid-credential','auth/invalid-login-credentials','auth/wrong-password','auth/user-not-found'].includes(code) && context === 'sign-in')
    return {title:'Email or password does not match', description:'Check both details and try again, or use Forgot password to reset your password.', field:'credentials'};
  if (['auth/email-already-in-use','auth/credential-already-in-use'].includes(code))
    return {title:'Try signing in instead',description:'This email cannot be used to create another account. Sign in or use Forgot password to recover access.',field:'email'};
  if (code === 'auth/weak-password') return {title:'Choose a stronger password',description:'Use at least six characters. A longer password with letters, numbers and symbols is better.',field:'password'};
  if (code === 'auth/password-does-not-meet-requirements') return {title:'This password needs to be stronger',description:'Try a longer password with uppercase and lowercase letters, a number and a symbol.',field:'password'};
  if (code === 'auth/missing-password') return {title:'Enter your password',description:'Use the password for your TreatStory account.',field:'password'};
  if (code === 'auth/user-disabled') return {title:'This account cannot sign in',description:'Contact TreatStory support for help with your account.'};
  if (['auth/requires-recent-login','auth/user-token-expired','auth/id-token-expired','auth/invalid-user-token','unauthenticated'].includes(code) || status === 401)
    return {title:'Please sign in again',description:'Your session could not be verified. Sign in again, then retry this action.'};
  if (['auth/too-many-requests','resource-exhausted','storage/quota-exceeded'].includes(code) || status === 429)
    return {title:'Please pause and try again later',description:publicMessage(error) || 'Too many attempts have been made. Wait before retrying this action.'};
  if ((code === 'permission-denied' || status === 403) && context === 'save-store')
    return {title:'Store settings were not saved',description:'Your changes are still here. Check that your seller access is active. If it is, contact TreatStory support to review store permissions.'};
  if (code === 'permission-denied' || code === 'storage/unauthorized' || status === 403)
    return {title:context === 'seller-access' ? 'Administrator access is required' : 'This account cannot make that change',description:publicMessage(error) || 'Check that you are signed in to the correct account. If access should be available, contact TreatStory support.'};
  if (['auth/network-request-failed','unavailable','deadline-exceeded','storage/retry-limit-exceeded'].includes(code) || e?.name === 'AbortError' ||
      (e?.name === 'TypeError' && /fetch|network|connection/i.test((error as Error).message || '')) || (typeof navigator !== 'undefined' && navigator.onLine === false))
    return {title:'Connection interrupted',description:context === 'checkout' ? 'We could not confirm the order response. Keep this checkout open and retry, or check your orders before starting again.' : context === 'upload-photo' ? 'Check your internet connection, then choose the photo again and retry.' : `Check your internet connection. ${fallback}`};
  if (['SERVICE_NOT_CONFIGURED','UPLOAD_NOT_CONFIGURED'].includes(code) || code === 'app/service-unavailable' || code === 'auth/operation-not-allowed')
    return {title:'This service is not ready yet',description:'This action is currently unavailable. Please contact TreatStory support.'};
  if (status === 503 || status === 502 || status === 504 || status >= 500)
    return {title:'Temporarily unavailable',description:context === 'checkout' ? 'Your order response could not be confirmed. Keep this checkout open and retry, or check your orders before starting again.' : `This action is temporarily unavailable. ${fallback}`};
  if (status === 415 || code === 'app/photo-type') return {title:'This file type is not supported',description:publicMessage(error)||'Choose a JPG, PNG or WebP photo.'};
  if (code === 'app/empty-photo') return {title:'Choose a different photo',description:'The selected file is empty and cannot be uploaded.'};
  if (status === 413) return {title:context === 'upload-photo' ? 'This photo is too large' : 'This request is too large',description:publicMessage(error) || 'Reduce the file or message size, then try again.'};
  if (status === 409 || ['already-exists','aborted'].includes(code)) return {title:context === 'checkout' ? 'Review your order before continuing' : 'This request has changed',description:publicMessage(error) || 'Refresh to see the latest details, then try again.'};
  if (status === 404 || code === 'not-found') return {title:'This item is no longer available',description:publicMessage(error) || 'It may have been removed or changed. Refresh the page to continue.'};
  if (status === 400 || code === 'invalid-argument') return {title:context==='upload-photo'?'This photo could not be read':'Check the entered details',description:publicMessage(error) || 'One or more fields could not be accepted. Review the form and try again.'};
  if (code === 'failed-precondition') return {title:'This action is not available yet',description:'The latest information is not ready. Refresh or contact TreatStory support if this continues.'};
  return {title,description:publicMessage(error) || fallback};
}
export const errorToast = (error: unknown, context: NoticeContext = 'save') => {
  const {title,description} = getErrorNotice(error,context);
  return {variant:'destructive' as const,title,description};
};
export function validateEmail(email: string): UserNotice | null {
  if (!email.trim()) return {title:'Enter your email address',description:'Use the email address for your TreatStory account.',field:'email'};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return getErrorNotice({code:'auth/invalid-email'},'sign-in');
  return null;
}
