import type { Firestore, Timestamp, Transaction } from 'firebase-admin/firestore';
import { mailId, queueMail } from '@/lib/server/mail';
import type { SellerApprovalPlan } from '@/lib/seller-policy';

/** Business events are written to the private outbox in the same transaction as the application. */
type SellerMailApplication = {
  id: string;
  businessName: string;
  businessCategory: string;
  businessCity?: string;
  businessState?: string;
  contactEmail: string;
  submittedAt: Timestamp;
};

/** A dedicated admin inbox is preferred; existing MAIL_SUPPORT_EMAIL deployments still work. */
export function sellerAdminMailRecipient(): string | null {
  const address=(process.env.MAIL_ADMIN_EMAIL?.trim() || process.env.MAIL_SUPPORT_EMAIL?.trim() || '').toLowerCase();
  if(!address) {
    console.error('Seller application admin email is not configured: set MAIL_ADMIN_EMAIL (or MAIL_SUPPORT_EMAIL).');
    return null;
  }
  if(address.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    console.error('Seller application admin email has an invalid format.');
    return null;
  }
  return address;
}

/** Queue for guest, password and Google applicants alike, without relying on a browser call. */
export function queueNewSellerApplicationMails(
  tx: Transaction,db: Firestore,application: SellerMailApplication,adminEmail: string | null,
) {
  const id=mailId(`application/${application.id}/pending/${application.submittedAt.toMillis()}`);
  queueMail(tx,db,'',{
    template:'seller_application_received',
    title:'Seller application received',
    message:`${application.businessName}: we received your application. Our team will review it and contact you with an update.`,
    href:'/become-a-seller',
    details:[{label:'Business',value:application.businessName.slice(0,120)}],
  },id,false,application.contactEmail);
  if(adminEmail) {
    const locality=[application.businessCity,application.businessState].filter(Boolean).join(', ');
    queueMail(tx,db,'',{
      template:'seller_application_new',
      title:'New seller application',
      message:`${application.businessName} submitted a seller application. Review it in your admin workspace.`,
      href:'/admin',
      details:[
        {label:'Business',value:application.businessName.slice(0,120)},
        {label:'Category',value:application.businessCategory},
        ...(locality?[{label:'Location',value:locality.slice(0,160)}]:[]),
      ],
    },id+'-team',false,adminEmail);
  }
}

/** Declines must also reach guest applicants with no Firebase account. */
export function queueRejectedSellerApplicationMail(
  tx:Transaction,db:Firestore,application:SellerMailApplication,reviewedAt:Timestamp,
) {
  const id=mailId(`application/${application.id}/rejected/${reviewedAt.toMillis()}`);
  queueMail(tx,db,'',{
    template:'seller_application_declined',
    title:'Seller application update',
    message:`${application.businessName}: your seller application was not approved. Contact TreatStory support if you need help.`,
    href:'/become-a-seller',
    details:[{label:'Business',value:application.businessName.slice(0,120)}],
  },id,false,application.contactEmail);
}

/** Send a single approval invitation to the applicant email, including guests with no Firebase UID. */
export function queueApprovedSellerApplicationMail(
  tx:Transaction, db:Firestore, application:SellerMailApplication, reviewedAt:Timestamp, plan:SellerApprovalPlan,
) {
  const label = plan === 'full' ? 'full seller access' : plan === 'three_months' ? 'a 3-month free trial' : 'a 6-month free trial';
  const id = mailId(`application/${application.id}/approved/${reviewedAt.toMillis()}`);
  queueMail(tx,db,'',{
    template:'seller_application_approved',
    title:'Your TreatStory seller application is approved',
    message:`Congratulations! Your application for ${application.businessName} has been approved for ${label}. Create a TreatStory account with this email address, or sign in if you already have one. Verify the email address, then activate your seller profile from the Become a Seller page. ${plan === 'full' ? 'Your access starts when you activate your profile.' : 'Your trial begins only when you activate your profile; there is no automatic renewal or charge.'}`,
    href:'/register?next=%2Fbecome-a-seller%3Factivate%3D1',
    label:'Create an account to activate',
    details:[{label:'Business',value:application.businessName.slice(0,120)},{label:'Approved access',value:label}],
  },id,false,application.contactEmail);
}
