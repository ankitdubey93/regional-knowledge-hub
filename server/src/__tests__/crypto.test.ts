import { describe, expect, it } from 'vitest';
import { CryptoError, aadFor, seal, unseal } from '../privacy/crypto';

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
    expect(() => unseal(seal(plain, aad), aad, Buffer.alloc(32, 7))).toThrow(CryptoError);
  });
  it('CR6 version byte 2 throws CryptoError', () => {
    const s = seal(plain, aad);
    s[0] = 2;
    expect(() => unseal(s, aad)).toThrow(CryptoError);
  });
});
