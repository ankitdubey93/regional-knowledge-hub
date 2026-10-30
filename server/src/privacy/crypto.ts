import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../env';

// AES-256-GCM. Sealed format: [key version (1 byte)] [iv (12)] [tag (16)] [ciphertext]. Never logs.
export class CryptoError extends Error {}

export interface SealKey { version: number; key: Buffer }
/** current seals new data; previous (version current - 1) only opens older seals during a rotation. */
export interface Keyring { current: SealKey; previous: SealKey | null }

export function envKeyring(): Keyring {
  const current = { version: env.DATA_ENCRYPTION_KEY_VERSION, key: env.DATA_ENCRYPTION_KEY };
  const prev = env.DATA_ENCRYPTION_KEY_PREVIOUS;
  return { current, previous: prev ? { version: current.version - 1, key: prev } : null };
}

/** The key version a sealed value was written with (its first byte), or 0 for empty input. */
export function sealVersion(sealed: Uint8Array): number {
  return sealed[0] ?? 0;
}

const IV_BYTES = 12;
const TAG_BYTES = 16;

/** `${table}:${orgId}:${id}` — binds a ciphertext to its row and firm. */
export function aadFor(table: 'conversation' | 'document.file' | 'document.text' | 'request_link.token',
  orgId: string, id: string): string {
  return `${table}:${orgId}:${id}`;
}

export function seal(plain: Uint8Array, aad: string, ring: Keyring = envKeyring()): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', ring.current.key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([Buffer.from([ring.current.version]), iv, cipher.getAuthTag(), body]);
}

/** Throws CryptoError('Cannot open sealed data') on a wrong version, short input, wrong key, wrong aad or tampering. */
export function unseal(sealed: Uint8Array, aad: string, ring: Keyring = envKeyring()): Buffer {
  const fail = (): never => {
    throw new CryptoError('Cannot open sealed data');
  };
  if (sealed.length < 1 + IV_BYTES + TAG_BYTES) return fail();
  const version = sealed[0];
  const key = version === ring.current.version ? ring.current.key
    : ring.previous && version === ring.previous.version ? ring.previous.key
    : null;
  if (!key) return fail();
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
