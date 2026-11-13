import { z } from 'zod';

// Public registrations must never accept RSA private factors (d, p, q, ...),
// arbitrary metadata, weak moduli or an algorithm different from the client.
export const publicSupportKeySchema = z.object({
  kty: z.literal('RSA'),
  alg: z.literal('RSA-OAEP-256').optional(),
  e: z.literal('AQAB'),
  n: z.string().regex(/^[A-Za-z0-9_-]{512}$/).refine(value => {
    const modulus = Buffer.from(value, 'base64url');
    return modulus.length === 384 && (modulus[0] & 0x80) !== 0 &&
      (modulus[383] & 1) === 1 && modulus.toString('base64url') === value;
  }, 'Expected a canonical 3072-bit RSA modulus.'),
  ext: z.boolean().optional(),
  key_ops: z.tuple([z.literal('encrypt')]).optional(),
}).strict();
