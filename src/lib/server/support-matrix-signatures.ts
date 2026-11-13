import { createPublicKey, verify } from 'node:crypto';
import { stringify } from 'another-json';

/** Matrix canonical JSON signatures, per the Matrix signing specification. */
export function verifyMatrixSignature(object: Record<string, any>, userId: string, publicKeys: Record<string, string> = {}) {
  try {
    const { signatures, unsigned: _unsigned, ...signed } = object;
    const entries = Object.entries(publicKeys);
    if (entries.length !== 1 || !entries[0][0].startsWith('ed25519:')) return false;
    const [keyId, encoded] = entries[0];
    const raw = Buffer.from(encoded, 'base64');
    const signature = Buffer.from(signatures?.[userId]?.[keyId] ?? '', 'base64');
    if (raw.length !== 32 || signature.length !== 64) return false;
    const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]), format: 'der', type: 'spki' });
    return verify(null, Buffer.from(stringify(signed)), key, signature);
  } catch { return false; }
}
