/** Six calendar months, clamped to the last day of the destination month. */
export function sellerTrialEnd(start: Date): Date {
  const end = new Date(start);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + 6);
  const last = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  ).getUTCDate();
  end.setUTCDate(Math.min(day, last));
  return end;
}
export const SELLER_TRIAL_MESSAGE =
  'Six months free from approval. Continue only if you are satisfied; no automatic charge or renewal.';
