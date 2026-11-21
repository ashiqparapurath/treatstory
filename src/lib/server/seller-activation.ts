import { Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';
import { ApiError } from '@/lib/server/firebase-admin';
import { queueNotification } from '@/lib/server/mail';
import { reserveFriendlyStoreSlug } from '@/lib/server/store-slug';
import { sellerApprovalEnd } from '@/lib/seller-policy';

const approvedApplicationSchema = z.object({
  businessName: z.string().min(2).max(120),
  businessCategory: z.enum(['home-bakery', 'art', 'handmade', 'other']),
  businessCity: z.string().max(80).optional(),
  businessState: z.string().max(80).optional(),
  contactEmail: z.email().max(254),
  contactPhone: z.string().min(5).max(40),
  description: z.string().min(1).max(2000),
  instagramUrl: z.string().optional(),
  fssaiNumber: z.string().optional(),
  approvalPlan: z.enum(['three_months', 'six_months', 'full']),
}).passthrough();

/**
 * Called only inside a server-side Firestore transaction after checking the
 * approved application, verified Firebase identity and exact email match.
 * Product, account and seller rules continue to use the existing seller schema.
 */
export async function activateApprovedSeller(
  tx: Transaction, db: Firestore, application: Record<string, unknown>, ownerUid: string, now: Timestamp,
) {
  const parsed = approvedApplicationSchema.safeParse(application);
  if (!parsed.success) throw new ApiError(409, 'This approval has incomplete details or an invalid access plan. Contact support.');
  const details = parsed.data;
  const plan = details.approvalPlan;
  const sellerRef = db.doc('sellers/' + ownerUid);
  const [seller, deleting] = await Promise.all([
    tx.get(sellerRef),
    tx.get(db.doc('account_deletions/' + ownerUid)),
  ]);
  if (seller.exists || deleting.exists)
    throw new ApiError(409, 'Account already has seller access or is closing.');
  // Reserve the plain business-name URL, using a short suffix only on collision.
  let slug: string;
  try {
    slug = await reserveFriendlyStoreSlug(tx, db, details.businessName, ownerUid);
  } catch (error) {
    if (error instanceof Error && /No unique public store address|already assigned/.test(error.message))
      throw new ApiError(409, 'Store address unavailable.');
    throw error;
  }

  const accessType = plan === 'full' ? 'full' : 'trial';
  const accessEndsAt = Timestamp.fromDate(sellerApprovalEnd(now.toDate(), plan));
  tx.create(sellerRef, {
    ownerUid,
    slug,
    businessName: details.businessName,
    businessCategory: details.businessCategory,
    businessCity: details.businessCity || '',
    businessState: details.businessState || '',
    contactEmail: details.contactEmail,
    contactPhone: details.contactPhone,
    description: details.description,
    instagramUrl: details.instagramUrl || '',
    fssaiNumber: details.fssaiNumber || '',
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
    details: [{ label: 'Business', value: details.businessName.slice(0, 120) }, { label: 'Access', value: planLabel }],
    href: '/seller/dashboard',
    createdAt: now,
    read: false,
  });
  return { plan, accessEndsAt };
}
