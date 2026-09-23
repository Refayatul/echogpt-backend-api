import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export interface EncryptedValue {
  cipher: string;
  iv: string;
  tag: string;
}

// Provider API keys are stored encrypted with AES-256-GCM. The key comes from
// ENCRYPTION_KEY (32 bytes, base64). A fresh random IV is used for every value.
export class EncryptionUtil {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    this.key = Buffer.from(base64Key, 'base64');
    if (this.key.length !== 32) {
      throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes');
    }
  }

  encrypt(plainText: string): EncryptedValue {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    return {
      cipher: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    };
  }

  decrypt(value: EncryptedValue): string {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(value.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(value.cipher, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }
}