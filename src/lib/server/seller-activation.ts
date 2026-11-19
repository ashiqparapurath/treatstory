import { Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { ApiError } from '@/lib/server/firebase-admin';
import { queueNotification } from '@/lib/server/mail';
import { storeSlug } from '@/lib/server/store-slug';
import { isSellerApprovalPlan, sellerApprovalEnd } from '@/lib/seller-policy';

type ApprovedApplication = {
  businessName: string;
  businessCategory: string;
  businessCity?: string;
  businessState?: string;
  contactEmail: string;
  contactPhone: string;
  description: string;
  approvalPlan?: unknown;
};

/**
 * Called only inside a server-side Firestore transaction after checking the
 * approved application, verified Firebase identity and exact email match.
 * Product, account and seller rules continue to use the existing seller schema.
 */
export async function activateApprovedSeller(
  tx: Transaction, db: Firestore, application: ApprovedApplication, ownerUid: string, now: Timestamp,
) {
  const plan = application.approvalPlan;
  if (!isSellerApprovalPlan(plan)) throw new ApiError(409, 'The approval has no valid access plan. Contact support.');
  const sellerRef = db.doc('sellers/' + ownerUid);
  const slug = storeSlug(application.businessName, ownerUid);
  const slugRef = db.doc('store_slugs/' + slug);
  const [seller, reserved, deleting] = await Promise.all([
    tx.get(sellerRef),
    tx.get(slugRef),
    tx.get(db.doc('account_deletions/' + ownerUid)),
  ]);
  if (seller.exists || deleting.exists)
    throw new ApiError(409, 'Account already has seller access or is closing.');
  if (reserved.exists && reserved.data()?.sellerId !== ownerUid)
    throw new ApiError(409, 'Store address unavailable.');

  const accessType = plan === 'full' ? 'full' : 'trial';
  const accessEndsAt = Timestamp.fromDate(sellerApprovalEnd(now.toDate(), plan));
  tx.set(slugRef, { sellerId: ownerUid });
  tx.create(sellerRef, {
    ownerUid,
    slug,
    businessName: application.businessName,
    businessCategory: application.businessCategory,
    businessCity: application.businessCity || '',
    businessState: application.businessState || '',
    contactEmail: application.contactEmail,
    contactPhone: application.contactPhone,
    description: application.description,
    logoUrl: '',
    coverUrl: '',
    isOpen: true,
    status: 'active',
    accessType,
    approvalPlan: plan,
    accessStartsAt: now,
    accessEndsAt,
    createdAt: now,
    updatedAt: now,
  });
  const planLabel = plan === 'full' ? 'Full seller access' : plan === 'three_months' ? 'Three-month free trial' : 'Six-month free trial';
  queueNotification(tx, db, ownerUid, {
    template: 'seller_application_approved',
    title: 'Your TreatStory seller profile is active',
    message: plan === 'full'
      ? 'Your approved seller profile is ready. You can now manage your store and products.'
      : `Your ${planLabel.toLowerCase()} starts today. No automatic renewal or charge.`,
    details: [{ label: 'Business', value: application.businessName.slice(0, 120) }, { label: 'Access', value: planLabel }],
    href: '/seller/dashboard',
    createdAt: now,
    read: false,
  });
  return { plan, accessEndsAt };
}
