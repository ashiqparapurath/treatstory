import { createHash, createHmac, randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { verifyMatrixSignature } from './support-matrix-signatures';
import { ApiError } from './firebase-admin';

export function matrixConfig() {
  if (process.env.NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED !== 'true' || process.env.NEXT_PUBLIC_SUPPORT_MATRIX_ENABLED !== 'true') throw new ApiError(503, 'Encrypted chat is not enabled.');
  if (process.env.SUPPORT_MATRIX_PRIVATE_TRANSPORT_CONFIRMED !== 'true') throw new ApiError(503, 'Messaging requires a private homeserver transport.');
  const base = process.env.SUPPORT_MATRIX_HOMESERVER_URL;
  const domain = process.env.SUPPORT_MATRIX_SERVER_NAME;
  const secret = process.env.SUPPORT_MATRIX_JWT_SECRET;
  const serviceToken = process.env.SUPPORT_MATRIX_SERVICE_TOKEN;
  if (!base || !domain || !secret || secret.length < 32 || !serviceToken) throw new ApiError(503, 'Encrypted chat setup is incomplete.');
  const url = new URL(base);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || !['http:', 'https:'].includes(url.protocol)) throw new ApiError(503, 'Invalid messaging server configuration.');
  // HTTP is allowed only for a private deployment network / local test server.
  if (url.protocol !== 'https:' && !/^(localhost|127\.0\.0\.1|synapse)$/.test(url.hostname)) throw new ApiError(503, 'Messaging requires a secure server connection.');
  const gatewaySecret = process.env.SUPPORT_MATRIX_GATEWAY_SECRET;
  if (url.protocol === 'https:' && (!gatewaySecret || gatewaySecret.length < 32)) throw new ApiError(503, 'A protected messaging gateway is required.');
  return { base: url.origin, domain, secret, serviceToken, gatewaySecret };
}
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const matrixLocalpart = (uid: string) => 'ts_' + digest(uid);
export const matrixUserId = (uid: string, domain: string) => '@' + matrixLocalpart(uid) + ':' + domain;
export function loginJWT(uid: string, secret: string, now = Math.floor(Date.now() / 1000)) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const head = encode({ alg: 'HS256', typ: 'JWT' });
  const body = encode({ sub: matrixLocalpart(uid), iat: now, exp: now + 60, jti: randomUUID(), iss: 'treatstory-support', aud: 'treatstory-support' });
  return head + '.' + body + '.' + createHmac('sha256', secret).update(head + '.' + body).digest('base64url');
}
export async function matrixFetch(path: string, options: RequestInit = {}, token?: string) {
  const config = matrixConfig();
  const response = await fetch(config.base + path, { ...options, redirect: 'error', cache: 'no-store',
    signal: options.signal ?? AbortSignal.timeout(35_000), headers: { 'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(config.gatewaySecret ? { 'X-Treatstory-Matrix-Gateway': config.gatewaySecret } : {}), ...options.headers } });
  return response;
}
export async function matrixService(path: string, method = 'GET', body?: unknown) {
  const response = await matrixFetch(path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }, matrixConfig().serviceToken);
  const result = await response.json();
  if (!response.ok) throw new ApiError(503, 'The messaging server could not complete this operation.');
  return result as Record<string, any>;
}
export async function supportRole(db: Firestore, uid: string) {
  const [role, account] = await Promise.all([db.doc('roles_admin/' + uid).get(), db.doc('support_matrix_accounts/' + uid).get()]);
  if (account.data()?.userId && account.data()?.userId !== matrixUserId(uid, matrixConfig().domain)) throw new ApiError(503, 'Messaging server identity changed. Existing encryption records were preserved; review the deployment configuration.');
  // A removed support role must not log in as a customer to regain its old rooms.
  if (account.data()?.agent && !role.exists) throw new ApiError(403, 'Support access has been revoked.');
  return role.exists;
}
export async function authorizedConversation(db: Firestore, uid: string, roomId: string) {
  const result = await db.collection('support_matrix_conversations').where('roomId', '==', roomId).limit(1).get();
  const doc = result.docs[0];
  if (!doc || !['open', 'closed'].includes(doc.data().status)) throw new ApiError(403, 'Conversation unavailable.');
  const data = doc.data();
  if (data.ownerUid !== uid && !(data.agentUid === uid && await supportRole(db, uid))) throw new ApiError(403, 'Conversation is private.');
  return doc;
}

// Verify Matrix's cross-signature chain against the account's pinned public root.
// This does not treat a Firebase session or a UI boolean as device approval.
export async function requireTrustedDevice(db: Firestore, uid: string, deviceId: string, token: string) {
  const userId = matrixUserId(uid, matrixConfig().domain);
  const response = await matrixFetch('/_matrix/client/v3/keys/query', { method: 'POST', body: JSON.stringify({ device_keys: { [userId]: [deviceId] } }) }, token);
  if (!response.ok) throw new ApiError(503, 'Unable to verify this device.');
  const keys = await response.json();
  const root = (await db.doc('support_matrix_accounts/' + uid).get()).data()?.masterKey;
  const master = keys.master_keys?.[userId];
  const self = keys.self_signing_keys?.[userId];
  const device = keys.device_keys?.[userId]?.[deviceId];
  if (!root || !master || !self || !device ||
      master.usage?.length !== 1 || master.usage[0] !== 'master' || self.usage?.length !== 1 || self.usage[0] !== 'self_signing' ||
      master.user_id !== userId || self.user_id !== userId || device.user_id !== userId || device.device_id !== deviceId ||
      Object.values(master.keys ?? {})[0] !== root ||
      !verifyMatrixSignature(self, userId, master.keys) ||
      !verifyMatrixSignature(device, userId, self.keys)) throw new ApiError(403, 'Approve this device from a trusted device, or use your recovery code.');
}

let agentDirectory: { expires: number; agents: { uid: string; userId: string; label: string }[] } | null = null;
export function invalidateAgentDirectory() { agentDirectory = null; }
export async function availableAgents(db: Firestore) {
  if (agentDirectory && agentDirectory.expires > Date.now()) return agentDirectory.agents;
  const accounts = await db.collection('support_matrix_accounts').where('agent', '==', true).orderBy('lastLoginAt', 'desc').limit(50).get();
  const agents = [];
  for (const account of accounts.docs) if (account.data().masterKey && (await db.doc('roles_admin/' + account.id).get()).exists) agents.push({ uid: account.id, userId: account.data().userId as string, label: account.data().displayName || 'Support ' + account.id.slice(0, 8) });
  agentDirectory = { agents, expires: Date.now() + 30000 };
  return agents;
}
