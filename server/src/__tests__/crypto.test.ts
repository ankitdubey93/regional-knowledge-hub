import { describe, expect, it } from 'vitest';
import { CryptoError, aadFor, seal, sealVersion, unseal } from '../privacy/crypto';

describe('crypto', () => {
  const aad = aadFor('conversation', 'org1', 'c1');
  const plain = Buffer.from('hello sealed world', 'utf8');

  it('CR1 round trip returns the same bytes', () => {
    expect(unseal(seal(plain, aad), aad).equals(plain)).toBe(true);
  });
  it('CR2 two seals of the same text differ', () => {
    expect(seal(plain, aad).equals(seal(plain, aad))).toBe(false);
  });
  it('CR3 a flipped ciphertext byte throws CryptoError', () => {
    const s = seal(plain, aad);
    s.writeUInt8(s.readUInt8(s.length - 1) ^ 1, s.length - 1);
    expect(() => unseal(s, aad)).toThrow(CryptoError);
  });
  it('CR4 a different aad throws CryptoError', () => {
    expect(() => unseal(seal(plain, aad), aadFor('conversation', 'org2', 'c1'))).toThrow(CryptoError);
  });
  it('CR5 a different key throws CryptoError', () => {
    expect(() => unseal(seal(plain, aad), aad, { current: { version: 1, key: Buffer.alloc(32, 7) }, previous: null })).toThrow(CryptoError);
  });
  it('CR6 version byte 2 throws CryptoError', () => {
    const s = seal(plain, aad);
    s[0] = 2;
    expect(() => unseal(s, aad)).toThrow(CryptoError);
  });

  const k1 = Buffer.alloc(32, 1);
  const k2 = Buffer.alloc(32, 2);

  it('CR7 a seal carries the current key version', () => {
    const ring = { current: { version: 3, key: k1 }, previous: null };
    const s = seal(plain, aad, ring);
    expect(sealVersion(s)).toBe(3);
    expect(unseal(s, aad, ring).equals(plain)).toBe(true);
  });
  it('CR8 a previous-key seal opens during a rotation', () => {
    const s = seal(plain, aad, { current: { version: 1, key: k1 }, previous: null });
    const ring = { current: { version: 2, key: k2 }, previous: { version: 1, key: k1 } };
    expect(unseal(s, aad, ring).equals(plain)).toBe(true);
  });
  it('CR9 after the rotation the old seal no longer opens', () => {
    const s = seal(plain, aad, { current: { version: 1, key: k1 }, previous: null });
    expect(() => unseal(s, aad, { current: { version: 2, key: k2 }, previous: null })).toThrow(CryptoError);
  });
  it('CR10 a version that matches neither key throws', () => {
    const s = seal(plain, aad, { current: { version: 5, key: k1 }, previous: null });
    const ring = { current: { version: 2, key: k2 }, previous: { version: 1, key: k1 } };
    expect(() => unseal(s, aad, ring)).toThrow(CryptoError);
  });
});
