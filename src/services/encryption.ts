import crypto from 'crypto';
import { promisify } from 'util';

const algorithm = 'aes-256-gcm';
const pbkdf2 = promisify(crypto.pbkdf2);
const randomBytes = promisify(crypto.randomBytes);

class EncryptionService {
  private readonly keyLength = 32; // 256 bits
  private readonly saltLength = 16;
  private readonly ivLength = 12;
  private readonly tagLength = 16;
  private readonly iterations = 100000;

  constructor(private readonly secret: string) {
    if (!secret) {
      throw new Error('Encryption secret is required');
    }
  }

  /**
   * Derives an encryption key from the master secret and a salt
   */
  private async deriveKey(salt: Buffer): Promise<Buffer> {
    return pbkdf2(
      this.secret,
      salt,
      this.iterations,
      this.keyLength,
      'sha256'
    );
  }

  /**
   * Encrypts sensitive data
   */
  async encrypt(data: string): Promise<string> {
    try {
      // Generate salt and IV
      const salt = await randomBytes(this.saltLength);
      const iv = await randomBytes(this.ivLength);

      // Derive key
      const key = await this.deriveKey(salt);

      // Create cipher
      const cipher = crypto.createCipheriv(algorithm, key, iv, {
        authTagLength: this.tagLength,
      });

      // Encrypt data
      const encrypted = Buffer.concat([
        cipher.update(data, 'utf8'),
        cipher.final(),
      ]);

      // Get auth tag
      const tag = cipher.getAuthTag();

      // Combine all components
      const result = Buffer.concat([salt, iv, tag, encrypted]);

      return result.toString('base64');
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypts encrypted data
   */
  async decrypt(encryptedData: string): Promise<string> {
    try {
      // Convert from base64
      const buffer = Buffer.from(encryptedData, 'base64');

      // Extract components
      const salt = buffer.slice(0, this.saltLength);
      const iv = buffer.slice(this.saltLength, this.saltLength + this.ivLength);
      const tag = buffer.slice(
        this.saltLength + this.ivLength,
        this.saltLength + this.ivLength + this.tagLength
      );
      const encrypted = buffer.slice(this.saltLength + this.ivLength + this.tagLength);

      // Derive key
      const key = await this.deriveKey(salt);

      // Create decipher
      const decipher = crypto.createDecipheriv(algorithm, key, iv, {
        authTagLength: this.tagLength,
      });
      decipher.setAuthTag(tag);

      // Decrypt data
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Hashes sensitive data (one-way)
   */
  async hash(data: string): Promise<string> {
    const salt = await randomBytes(this.saltLength);
    const hash = await pbkdf2(
      data,
      salt,
      this.iterations,
      this.keyLength,
      'sha256'
    );
    return Buffer.concat([salt, hash]).toString('base64');
  }

  /**
   * Verifies hashed data
   */
  async verifyHash(data: string, hashedData: string): Promise<boolean> {
    try {
      const buffer = Buffer.from(hashedData, 'base64');
      const salt = buffer.slice(0, this.saltLength);
      const hash = buffer.slice(this.saltLength);

      const compareHash = await pbkdf2(
        data,
        salt,
        this.iterations,
        this.keyLength,
        'sha256'
      );

      return crypto.timingSafeEqual(hash, compareHash);
    } catch (error) {
      console.error('Hash verification failed:', error);
      return false;
    }
  }

  /**
   * Generates a secure random token
   */
  async generateToken(length = 32): Promise<string> {
    const bytes = await randomBytes(length);
    return bytes.toString('base64url');
  }
}

// Create encryption service instance
const encryptionService = new EncryptionService(
  process.env.ENCRYPTION_SECRET || ''
);

export { encryptionService };
