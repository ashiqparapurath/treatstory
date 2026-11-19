export type SellerApprovalPlan = 'three_months' | 'six_months' | 'full';

export const SELLER_APPROVAL_PLANS: { value: SellerApprovalPlan; label: string; description: string }[] = [
  { value: 'three_months', label: '3-month free trial', description: 'Three calendar months from account activation. No automatic charge.' },
  { value: 'six_months', label: '6-month free trial', description: 'Six calendar months from account activation. No automatic charge.' },
  { value: 'full', label: 'Full access', description: 'No trial period; an administrator can suspend or change access.' },
];

export function isSellerApprovalPlan(value: unknown): value is SellerApprovalPlan {
  return value === 'three_months' || value === 'six_months' || value === 'full';
}

/** Add calendar months in UTC, clamped to the last day of the destination month. */
export function sellerTrialEnd(start: Date, months: 3 | 6 = 6): Date {
  const end = new Date(start);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  ).getUTCDate();
  end.setUTCDate(Math.min(day, last));
  return end;
}

/**
 * Existing seller access and Firestore permission checks require a timestamp
 * even for full access. A distant expiry acts as a non-trial sentinel; full
 * access remains revocable by an administrator.
 */
export function sellerApprovalEnd(start: Date, plan: SellerApprovalPlan): Date {
  return plan === 'full'
    ? new Date('2099-12-31T23:59:59.000Z')
    : sellerTrialEnd(start, plan === 'three_months' ? 3 : 6);
}

export const SELLER_TRIAL_MESSAGE =
  'Seller access is subject to review. If approved, an admin chooses a 3-month trial, 6-month trial or full access. Trials start when your verified account is activated, with no automatic charge or renewal.';
