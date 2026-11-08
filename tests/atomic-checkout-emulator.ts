/**
 * Exercise real Firestore transactions against the Firebase emulator.
 * Run with:
 * npx firebase-tools@14 emulators:exec --only firestore --project demo-treatstory --config firebase.json "npx --no-install tsx tests/atomic-checkout-emulator.ts"
 * No Firebase production project or credentials are used.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { placeAtomicCheckout } from '@/lib/server/atomic-checkout';
import { applyOrderAction } from '@/lib/server/order-actions';
import type { CheckoutPayload } from '@/lib/checkout-schema';

async function run() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Refusing to run transactional tests outside Firestore emulator.');
  const app = getApps().find(a=>a.name==='treatstory-checkout-test') ||
    initializeApp({ projectId: 'demo-treatstory' }, 'treatstory-checkout-test');
  const db = getFirestore(app);
  const sellerId = 'test-seller-'+randomUUID();
  const productId = 'test-product-'+randomUUID();
  const date = new Date(Date.now() + 330*60000 + 3*86400000).toISOString().slice(0,10);
  const sellerRef=db.collection('sellers').doc(sellerId);
  const productRef=db.collection('marketplace_products').doc(productId);
  await sellerRef.set({
    ownerUid:sellerId, businessName:'TreatStory Test Bakery', status:'active', isOpen:true,
    accessEndsAt:Timestamp.fromMillis(Date.now()+25*86400000),
    deliveryMethods:['delivery','pickup'],deliveryPincodes:['673001'],deliveryFee:50,dailyOrderCapacity:1,
    deliverySlots:['10-12'],acceptanceHours:24,
  });
  await productRef.set({
    sellerId,name:'Only One Cake',status:'published',availability:'available',
    price:200,showPrice:true,stockQuantity:1,minimumOrderQuantity:1,preparationDays:0,weightOptions:[],
  });
  const request=(buyer:string,checkoutId=randomUUID(),expectedPrice=200):CheckoutPayload=>({
    checkoutId,lines:[{productId,quantity:1,expectedPrice,customizationNote:'Happy birthday',weight:null}],
    customerName:'TreatStory Test Buyer', customerPhone:'9876543210',deliveryAddress:'A valid address with PIN 673001',
    customerNote:'',deliveryMode:'delivery',pincode:'673001',requestedDate:date,requestedSlot:'10-12',
    giftRecipient:'',giftMessage:'',
  });
  const a=request('buyer-a'),b=request('buyer-b');
  const competing=await Promise.allSettled([
    placeAtomicCheckout(db,'buyer-a',a),placeAtomicCheckout(db,'buyer-b',b),
  ]);
  assert.equal(competing.filter(x=>x.status==='fulfilled').length,1,'exactly one order must reserve last item');
  const winner=competing[0].status==='fulfilled' ? {buyer:'buyer-a',payload:a,result:competing[0].value}
    : {buyer:'buyer-b',payload:b,result:(competing[1] as PromiseFulfilledResult<Awaited<ReturnType<typeof placeAtomicCheckout>>>).value};
  assert.equal((await productRef.get()).data()?.stockQuantity,0,'stock should reach zero');
  assert.equal((await db.collection('seller_bookings').doc(sellerId+'_'+date).get()).data()?.count,1,'date capacity reserved');
  assert.equal(winner.result.total,250,'delivery fee included once');
  const replay=await placeAtomicCheckout(db,winner.buyer,winner.payload);
  assert.equal(replay.repeated,true,'retry should reuse same receipt');
  assert.deepEqual(replay.orderIds,winner.result.orderIds);
  assert.equal((await productRef.get()).data()?.stockQuantity,0,'retry must not decrement stock');

  const orderId=winner.result.orderIds[0];
  await applyOrderAction(db,winner.buyer,orderId,'request-cancellation','Plans have changed');
  await applyOrderAction(db,sellerId,orderId,'cancelled','Buyer requested cancellation');
  assert.equal((await productRef.get()).data()?.stockQuantity,1,'cancellation should restore stock');
  assert.equal((await db.collection('seller_bookings').doc(sellerId+'_'+date).get()).data()?.count,0,'booking restored');
  await assert.rejects(()=>applyOrderAction(db,sellerId,orderId,'cancelled','Double cancellation'),/status change|available/i);
  assert.equal((await productRef.get()).data()?.stockQuantity,1,'cannot restore stock twice');

  const mismatch=await placeAtomicCheckout(db,'buyer-c',request('buyer-c',randomUUID(),100)).catch(e=>e);
  assert.equal(mismatch.status,409,'changed prices must require explicit buyer acceptance');
  assert.equal((await productRef.get()).data()?.stockQuantity,1,'rejected price change must not reserve stock');

  const variantId='test-variant-'+randomUUID();
  await db.collection('marketplace_products').doc(variantId).set({
    sellerId,name:'Made to order cupcakes',status:'published',availability:'available',
    price:100,showPrice:true,stockQuantity:9,minimumOrderQuantity:1,preparationDays:0,
    weightOptions:[{value:6,unit:'pieces',price:180,stockQuantity:1}],
  });
  const variantPayload=request('buyer-d');
  variantPayload.lines=[{productId:variantId,quantity:1,expectedPrice:180,customizationNote:'6 cupcakes',weight:{value:6,unit:'pieces'}}];
  const variant=await placeAtomicCheckout(db,'buyer-d',variantPayload);
  assert.equal(variant.total,230,'per-size price and shipping must be enforced');
  const vData=(await db.collection('marketplace_products').doc(variantId).get()).data()!;
  assert.equal(vData.weightOptions[0].stockQuantity,0);
  assert.equal(vData.stockQuantity,9,'variant reservation must not reduce unrelated base stock');
  await applyOrderAction(db,sellerId,variant.orderIds[0],'rejected','Unable to prepare');
  const vRestored=(await db.collection('marketplace_products').doc(variantId).get()).data()!;
  assert.equal(vRestored.weightOptions[0].stockQuantity,1);
  // One listing, multiple weight/unit choices with truly independent
  // prices and inventory. A single grouped checkout can include both sizes.
  await sellerRef.update({ dailyOrderCapacity: 3 });
  const cakeId = 'test-multi-price-cake-' + randomUUID();
  const cakeRef = db.collection('marketplace_products').doc(cakeId);
  await cakeRef.set({
    sellerId, name: 'Cake with two sizes', status: 'published', availability: 'available',
    price: 450, showPrice: true, stockQuantity: 0, minimumOrderQuantity: 1, preparationDays: 0,
    weightOptions: [
      { value: 500, unit: 'g', price: 450, stockQuantity: 1 },
      { value: 1, unit: 'kg', price: 800, stockQuantity: 1 },
    ],
  });
  const twoSizes = request('buyer-e');
  twoSizes.lines = [
    { productId: cakeId, quantity: 1, expectedPrice: 450, customizationNote: 'Small', weight: { value: 500, unit: 'g' } },
    { productId: cakeId, quantity: 1, expectedPrice: 800, customizationNote: 'Large', weight: { value: 1, unit: 'kg' } },
  ];
  const grouped = await placeAtomicCheckout(db, 'buyer-e', twoSizes);
  assert.equal(grouped.orderIds.length, 2, 'each size receives its own seller order');
  assert.equal(grouped.total, 1300, '500 g + 1 kg have separate prices and one delivery fee');
  const afterGrouped = (await cakeRef.get()).data()!;
  assert.deepEqual(afterGrouped.weightOptions.map((v: {stockQuantity: number}) => v.stockQuantity), [0, 0],
    'both size stocks are reserved independently');
  assert.equal(afterGrouped.stockQuantity, 0, 'shared stock is not deducted when size stock is configured');
  const groupedRepeat = await placeAtomicCheckout(db, 'buyer-e', twoSizes);
  assert.equal(groupedRepeat.repeated, true);
  await applyOrderAction(db, sellerId, grouped.orderIds[0], 'rejected', 'Not ready');
  await applyOrderAction(db, sellerId, grouped.orderIds[1], 'rejected', 'Not ready');
  const restocked = (await cakeRef.get()).data()!;
  assert.deepEqual(restocked.weightOptions.map((v: {stockQuantity: number}) => v.stockQuantity), [1, 1],
    'rejected orders restore only their respective size stocks');

  console.log('PASS Firestore transactions: stock race, retry, capacity, price acceptance, cancellation restoration and simultaneous different-size pricing');
}
run().catch(e=>{ console.error(e);process.exitCode=1;});
