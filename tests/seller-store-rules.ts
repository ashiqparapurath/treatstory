/** Reproduce the seller-store settings transaction against the real Firestore rules emulator. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp as initializeAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  connectFirestoreEmulator, doc, getDoc, getFirestore, runTransaction,
  serverTimestamp, terminate, updateDoc,
} from 'firebase/firestore';

async function run() {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) {
    throw Error('Refusing to run seller settings tests outside the loopback Firestore emulator.');
  }
  const projectId = process.env.GCLOUD_PROJECT || 'demo-treatstory';
  const uid = 'test-store-seller-' + randomUUID();
  const intruderUid = 'test-store-intruder-' + randomUUID();
  const admin = getAdminFirestore(initializeAdmin({ projectId }, 'seller-settings-admin'));
  const sellerRef = admin.doc('sellers/' + uid);
  await sellerRef.set({
    ownerUid: uid, businessName: 'Test Seller', status: 'active',
    accessEndsAt: Timestamp.fromMillis(Date.now() + 86400000),
    logoUrl: '', description: 'Test business', contactPhone: '9999999999',
    whatsappNumber: '', isOpen: true, deliveryMethods: ['delivery'],
    deliveryPincodes: [], deliveryFee: 0, pickupAddress: '',
    deliverySlots: [], dailyOrderCapacity: 0, acceptanceHours: 24,
    updatedAt: Timestamp.now(),
  });

  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(':');
  function clientFor(sub: string, name: string) {
    const app = initializeApp({ projectId, apiKey: 'emulator-only-key' }, name);
    const client = getFirestore(app);
    connectFirestoreEmulator(client, host, Number(port), { mockUserToken: { sub } });
    return { app, client };
  }
  const owner = clientFor(uid, 'seller-settings-owner');
  const intruder = clientFor(intruderUid, 'seller-settings-intruder');
  const document = doc(owner.client, 'sellers', uid);
  const denied = (error: unknown) => (error as { code?: string }).code === 'permission-denied';
  const validLogo = 'https://res.cloudinary.com/sample-cloud/image/upload/v1234/treatstory/logos/test.png';

  // Same full update and server timestamp transform as the settings form.
  // This must pass when rules and the web app are deployed together.
  await runTransaction(owner.client, async tx => {
    const current = await tx.get(document);
    assert.equal(current.data()?.ownerUid, uid);
    tx.update(document, {
      logoUrl: validLogo, description: 'Digital Seller', contactPhone: '9999999999',
      whatsappNumber: '919999999999', isOpen: true,
      deliveryMethods: ['delivery'], deliveryPincodes: [], deliveryFee: 0,
      pickupAddress: '', deliverySlots: [], dailyOrderCapacity: 0,
      acceptanceHours: 24, updatedAt: serverTimestamp(),
    });
  });
  const saved = (await getDoc(document)).data();
  assert.equal(saved?.logoUrl, validLogo);
  assert.equal(saved?.description, 'Digital Seller');
  console.log('PASS seller may save logo plus all storefront settings transactionally');

  await assert.rejects(
    () => updateDoc(document, { logoUrl: 'https://example.com/unsafe.png', updatedAt: serverTimestamp() }),
    denied, 'non-Cloudinary logo URL must be rejected',
  );
  await assert.rejects(
    () => updateDoc(document, { ownerUid: intruderUid, updatedAt: serverTimestamp() }),
    denied, 'seller cannot transfer ownership',
  );
  await assert.rejects(
    () => updateDoc(doc(intruder.client, 'sellers', uid), { description: 'Hijacked', updatedAt: serverTimestamp() }),
    denied, 'another seller cannot update this store',
  );
  await sellerRef.update({ accessEndsAt: Timestamp.fromMillis(Date.now() - 60000) });
  await assert.rejects(
    () => updateDoc(document, { description: 'After expiry', updatedAt: serverTimestamp() }),
    denied, 'expired seller access cannot update store settings',
  );
  await sellerRef.update({ accessEndsAt: Timestamp.fromMillis(Date.now() + 86400000), status: 'suspended' });
  await assert.rejects(
    () => updateDoc(document, { description: 'Suspended', updatedAt: serverTimestamp() }),
    denied, 'suspended sellers cannot update store settings',
  );
  console.log('PASS malformed logos, ownership changes, other sellers and expired/suspended access are denied');
  await terminate(owner.client);
  await terminate(intruder.client);
  await deleteApp(owner.app);
  await deleteApp(intruder.app);
  await admin.terminate();
}
run().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
