import { createHash } from 'node:crypto';
import type { Firestore, Transaction, DocumentReference } from 'firebase-admin/firestore';

function readableBase(name: string) {
  return name.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '') || 'creator';
}

/** Historical 12-character suffix; retained for old published storefront URLs. */
export function storeSlug(name: string, uid: string) {
  return readableBase(name) + '-' + createHash('sha256').update(uid).digest('hex').slice(0, 12);
}

/** Prefer just the business name. A deterministic short suffix handles name collisions. */
export function storeSlugCandidates(name: string, uid: string) {
  const base = readableBase(name);
  const shortened = base.slice(0, 48).replace(/-+$/g, '');
  const hash = createHash('sha256').update(uid).digest('hex');
  // Keep the original business-name URL when available; never expose Firebase UIDs.
  return [base, shortened + '-' + hash.slice(0, 6), shortened + '-' + hash.slice(0, 10), shortened + '-' + hash.slice(0, 16)];
}

export function isLegacyStoreSlug(slug: string) {
  return /-[a-f0-9]{12}$/.test(slug);
}

/** Reserve a unique canonical slug and preserve its previous URL as an alias.
 * The caller must execute this inside a Firestore transaction and only AFTER
 * reading any other documents it needs (all reads here precede writes).
 */
export async function reserveFriendlyStoreSlug(
  tx: Transaction, db: Firestore, name: string, uid: string, previousSlug = '',
) {
  const candidates = storeSlugCandidates(name, uid);
  const records = await Promise.all(candidates.map(async slug => ({
    slug,
    ref: db.doc('store_slugs/' + slug),
    map: await tx.get(db.doc('store_slugs/' + slug)),
    seller: await tx.get(db.doc('sellers/' + slug)),
  })));

  const formerRef = previousSlug && previousSlug !== uid
    ? db.doc('store_slugs/' + previousSlug)
    : null;
  const former = formerRef ? await tx.get(formerRef) : null;

  if (former?.exists && former.data()?.sellerId !== uid)
    throw new Error('Store link is already assigned to another seller.');

  const chosen = records.find(entry =>
    entry.slug !== uid &&
    (!entry.map.exists || entry.map.data()?.sellerId === uid) &&
    (!entry.seller.exists || entry.slug === uid)
  );
  if (!chosen) throw new Error('No unique public store address is available.');

  if (!chosen.map.exists) tx.create(chosen.ref, { sellerId: uid });
  if (formerRef && !former?.exists && previousSlug !== chosen.slug)
    tx.create(formerRef, { sellerId: uid });
  return chosen.slug;
}

/** Upgrade old hashed/UID slugs without changing a previously chosen friendly URL. */
export async function ensureFriendlyStoreSlug(
  tx: Transaction, db: Firestore, sellerRef: DocumentReference, seller: Record<string, unknown>,
) {
  const uid = sellerRef.id;
  const current = typeof seller.slug === 'string' ? seller.slug.trim() : '';
  const name = typeof seller.businessName === 'string' ? seller.businessName : '';

  if (!name.trim()) throw new Error('Store name is required to create a public link.');
  if (current && current !== uid && !isLegacyStoreSlug(current)) {
    const ref = db.doc('store_slugs/' + current);
    const mapping = await tx.get(ref);
    if (mapping.exists && mapping.data()?.sellerId !== uid)
      throw new Error('Store link is already assigned to another seller.');
    if (!mapping.exists) tx.create(ref, { sellerId: uid });
    return current;
  }

  const friendly = await reserveFriendlyStoreSlug(tx, db, name, uid, current);
  if (current !== friendly) tx.update(sellerRef, { slug: friendly });
  return friendly;
}
