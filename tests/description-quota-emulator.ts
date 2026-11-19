import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { descriptionQuota } from '../src/lib/server/description-quota';

async function main() {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(localhost|127\.0\.0\.1):\d+$/);
  const app = initializeApp({ projectId: 'demo-treatstory' }, 'description-quota-test');
  const db = getFirestore(app);
  const uid = randomUUID();
  const global = db.doc('ai_description_usage/platform');
  try {
    await global.delete();
    const access = (seller: string, reserve = true) => descriptionQuota(db, seller, reserve);
    await assert.rejects(access(uid), { status: 403 });
    const activeSeller = { status: 'active', accessEndsAt: Timestamp.fromMillis(Date.now() + 86400000) };
    await db.doc('sellers/' + uid).set(activeSeller);
    process.env.GEMINI_SELLER_DAILY_LIMIT = '2';
    process.env.GEMINI_PLATFORM_MINUTE_LIMIT = '5';
    process.env.GEMINI_PLATFORM_DAILY_LIMIT = '3';
    assert.equal(await access(uid, false), 2);
    const attempts = await Promise.allSettled(Array.from({ length: 4 }, () => access(uid)));
    assert.equal(attempts.filter(a => a.status === 'fulfilled').length, 2);
    assert.equal(await access(uid, false), 0);
    await assert.rejects(access(uid), { status: 429 });
    const second = randomUUID();
    await db.doc('sellers/' + second).set(activeSeller);
    process.env.GEMINI_PLATFORM_MINUTE_LIMIT = '2';
    await assert.rejects(access(second), /minute/);
    process.env.GEMINI_PLATFORM_MINUTE_LIMIT = '5';
    assert.equal(await access(second), 1);
    await assert.rejects(access(second), /budget/);
    assert.equal(await access(second, false), 1);
    await db.doc('sellers/' + second).update({ accessEndsAt: Timestamp.fromMillis(0) });
    await assert.rejects(access(second, false), { status: 403 });
    console.log('Passed seller authorization and concurrent quota reservations');
  } finally { await deleteApp(app); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
