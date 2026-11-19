import type { Firestore } from 'firebase-admin/firestore';
import { ApiError } from './firebase-admin';

function limit(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed))
    throw new ApiError(503, 'AI suggestions are temporarily unavailable.');
  return parsed;
}

export async function descriptionQuota(db: Firestore, uid: string, reserve: boolean) {
  const personal = limit(process.env.GEMINI_SELLER_DAILY_LIMIT, 5);
  const platform = limit(process.env.GEMINI_PLATFORM_DAILY_LIMIT, 100);
  const perMinute = limit(process.env.GEMINI_PLATFORM_MINUTE_LIMIT, 5);
  const sellerCounter = db.collection('ai_description_sellers').doc(uid);
  const platformCounter = db.doc('ai_description_usage/platform');
  return db.runTransaction(async tx => {
    const seller = (await tx.get(db.collection('sellers').doc(uid))).data();
    const now = Date.now();
    if (seller?.status !== 'active' || !(seller.accessEndsAt?.toMillis?.() > now))
      throw new ApiError(403, 'Active seller access is required.');
    const day = Math.floor(now / 86400000);
    const minute = Math.floor(now / 60000);
    const usage = (await tx.get(sellerCounter)).data();
    const used = usage?.day === day ? usage.count : 0;
    const remaining = Math.max(0, personal - used);
    if (!reserve) return remaining;
    if (!remaining) throw new ApiError(429, 'Your daily AI limit is reached. Try again after midnight UTC.', { remaining });
    const total = (await tx.get(platformCounter)).data();
    const dailyCount = total?.day === day ? total.dailyCount : 0;
    const minuteCount = total?.minute === minute ? total.minuteCount : 0;
    if (dailyCount >= platform) throw new ApiError(429, 'Today’s marketplace AI budget is used. Try again after midnight UTC.', { remaining });
    if (minuteCount >= perMinute) throw new ApiError(429, 'Suggestions are busy. Try again in a minute.', { remaining });
    tx.set(sellerCounter, { day, count: used + 1 });
    tx.set(platformCounter, { day, minute, dailyCount: dailyCount + 1, minuteCount: minuteCount + 1 });
    return remaining - 1;
  });
}
