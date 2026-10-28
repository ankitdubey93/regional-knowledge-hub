import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../env';

// AES-256-GCM. Sealed format: [SEAL_VERSION (1 byte)] [iv (12)] [tag (16)] [ciphertext]. Never logs.
export const SEAL_VERSION = 1;
export class CryptoError extends Error {}

const IV_BYTES = 12;
const TAG_BYTES = 16;

/** `${table}:${orgId}:${id}` — binds a ciphertext to its row and firm. */
export function aadFor(table: 'conversation' | 'document.file' | 'document.text', orgId: string, id: string): string {
  return `${table}:${orgId}:${id}`;
}

export function seal(plain: Uint8Array, aad: string, key: Buffer = env.DATA_ENCRYPTION_KEY): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([Buffer.from([SEAL_VERSION]), iv, cipher.getAuthTag(), body]);
}

/** Throws CryptoError('Cannot open sealed data') on a wrong version, short input, wrong key, wrong aad or tampering. */
export function unseal(sealed: Uint8Array, aad: string, key: Buffer = env.DATA_ENCRYPTION_KEY): Buffer {
  const fail = (): never => {
    throw new CryptoError('Cannot open sealed data');
  };
  if (sealed.length < 1 + IV_BYTES + TAG_BYTES || sealed[0] !== SEAL_VERSION) return fail();
  try {
    const buf = Buffer.from(sealed);
    const iv = buf.subarray(1, 1 + IV_BYTES);
    const tag = buf.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
    const body = buf.subarray(1 + IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    return fail();
  }
}
