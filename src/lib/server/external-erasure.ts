import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ApiError } from './firebase-admin';
import { cloudinaryConfig, destroyMedia } from './media';
/** Retriable external cleanup. Never delete the identity until providers confirm. */
export async function eraseExternalData(db: Firestore, uid: string) {
  const accountRef = db.doc('support_matrix_accounts/' + uid);
  const account = await accountRef.get();
  if (account.exists && !account.data()?.erasedAt) {
    const base = process.env.SUPPORT_MATRIX_ERASURE_URL;
    const token = process.env.SUPPORT_MATRIX_ADMIN_TOKEN;
    const gateway = process.env.SUPPORT_MATRIX_GATEWAY_SECRET;
    if (!base || !token)
      throw new ApiError(
        503,
        'Messaging account removal requires support. Your deletion request is preserved.',
      );
    const url = new URL(base);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new ApiError(503, 'Messaging removal is unavailable.');
    const response = await fetch(
      url.origin +
        '/_synapse/admin/v1/deactivate/' +
        encodeURIComponent(account.data()!.userId),
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
          ...(gateway ? { 'X-Treatstory-Matrix-Gateway': gateway } : {}),
        },
        body: JSON.stringify({ erase: true }),
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok)
      throw new ApiError(503, 'Messaging removal is pending. Please retry.');
    await accountRef.update({ erasedAt: Timestamp.now() });
  }
  const conversations = await db
    .collection('support_matrix_conversations')
    .where('ownerUid', '==', uid)
    .get();
  for (const conversation of conversations.docs) {
    const room = conversation.data();
    if (!room.roomId || room.erasedAt) continue;
    const base = process.env.SUPPORT_MATRIX_ERASURE_URL,
      token = process.env.SUPPORT_MATRIX_ADMIN_TOKEN;
    if (!base || !token)
      throw new ApiError(503, 'Messaging history cleanup requires support.');
    const url = new URL(base);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new ApiError(503, 'Messaging cleanup unavailable.');
    const response = await fetch(
      url.origin +
        '/_synapse/admin/v1/rooms/' +
        encodeURIComponent(room.roomId),
      {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
          ...(process.env.SUPPORT_MATRIX_GATEWAY_SECRET
            ? {
                'X-Treatstory-Matrix-Gateway':
                  process.env.SUPPORT_MATRIX_GATEWAY_SECRET,
              }
            : {}),
        },
        body: JSON.stringify({ block: true, purge: true, force_purge: true }),
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok)
      throw new ApiError(
        503,
        'Messaging history cleanup is pending. Retry to finish.',
      );
    await conversation.ref.update({ erasedAt: Timestamp.now() });
  }
  // Persisted ownership includes uploads not attached to a submitted form.
  const assets = await db
    .collection('media_assets')
    .where('ownerUid', '==', uid)
    .limit(20)
    .get();
  for (const asset of assets.docs) {
    if (
      asset.data().status === 'uploading' &&
      Date.now() - (asset.data().createdAt?.toMillis?.() || 0) < 120000
    )
      throw new ApiError(
        503,
        'A photo is still uploading. Retry deletion in two minutes.',
      );
    await destroyMedia(asset.data().publicId, asset.data().type);
    await asset.ref.delete();
  }
  if (assets.size === 20)
    throw new ApiError(
      503,
      'Photo cleanup is progressing. Retry to finish removing your remaining photos.',
    );
  // Older uploads predate the ownership ledger. List only this UID's exact prefixes.
  const { cloud, key, secret } = cloudinaryConfig();
  for (const kind of ['references', 'logos', 'products', 'banners']) {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/resources/image/upload?` +
        new URLSearchParams({
          prefix: `treatstory/${kind}/${uid}/`,
          max_results: '20',
        }),
      {
        headers: {
          Authorization:
            'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64'),
        },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok)
      throw new ApiError(503, 'Legacy photo cleanup is pending. Please retry.');
    const result = await response.json();
    for (const asset of result.resources || [])
      await destroyMedia(asset.public_id);
    if (result.next_cursor)
      throw new ApiError(
        503,
        'Legacy photo cleanup is progressing. Retry to continue.',
      );
  }
  const groups = await Promise.all([
    db.collection('support_matrix_sessions').where('uid', '==', uid).get(),
    db
      .collection('support_matrix_conversations')
      .where('ownerUid', '==', uid)
      .get(),
    db.collection('support_matrix_audit').where('actorUid', '==', uid).get(),
    db
      .collection('custom_quote_upload_limits')
      .where('buyerUid', '==', uid)
      .get(),
    db.collection('image_upload_limits').where('buyerUid', '==', uid).get(),
    db.collection('seller_applications').where('ownerUid', '==', uid).get(),
  ]);
  for (const group of groups)
    for (const record of group.docs) await db.recursiveDelete(record.ref);
  await db.recursiveDelete(db.doc('seller_compliance/' + uid));
  await db.recursiveDelete(accountRef);
}
