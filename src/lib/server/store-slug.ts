import { createHash } from 'node:crypto';
export function storeSlug(name: string, uid: string) {
  const base =
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'creator';
  return (
    base + '-' + createHash('sha256').update(uid).digest('hex').slice(0, 12)
  );
}
