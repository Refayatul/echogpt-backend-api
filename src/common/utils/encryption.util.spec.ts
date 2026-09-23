import { describe, expect, it } from 'vitest';
import { EncryptionUtil } from './encryption.util';

const key = Buffer.alloc(32, 7).toString('base64');

describe('EncryptionUtil', () => {
  it('round-trips a value', () => {
    const util = new EncryptionUtil(key);
    const encrypted = util.encrypt('sk-secret-api-key');
    expect(util.decrypt(encrypted)).toBe('sk-secret-api-key');
  });

  it('produces different ciphertext for the same input (random iv)', () => {
    const util = new EncryptionUtil(key);
    const first = util.encrypt('same-value');
    const second = util.encrypt('same-value');
    expect(first.cipher).not.toBe(second.cipher);
    expect(first.iv).not.toBe(second.iv);
  });

  it('fails when the ciphertext is tampered with', () => {
    const util = new EncryptionUtil(key);
    const encrypted = util.encrypt('sk-secret-api-key');
    const tampered = {
      ...encrypted,
      cipher: Buffer.from('tampered-value').toString('base64'),
    };
    expect(() => util.decrypt(tampered)).toThrow();
  });

  it('fails with the wrong key', () => {
    const util = new EncryptionUtil(key);
    const otherKey = Buffer.alloc(32, 9).toString('base64');
    const other = new EncryptionUtil(otherKey);
    const encrypted = util.encrypt('sk-secret-api-key');
    expect(() => other.decrypt(encrypted)).toThrow();
  });

  it('rejects a key that is not 32 bytes', () => {
    const shortKey = Buffer.alloc(16, 1).toString('base64');
    expect(() => new EncryptionUtil(shortKey)).toThrow(
      'ENCRYPTION_KEY must decode to exactly 32 bytes',
    );
  });
});
