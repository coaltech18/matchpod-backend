"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptionService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const util_1 = require("util");
const algorithm = 'aes-256-gcm';
const pbkdf2 = (0, util_1.promisify)(crypto_1.default.pbkdf2);
const randomBytes = (0, util_1.promisify)(crypto_1.default.randomBytes);
class EncryptionService {
    constructor(secret) {
        this.secret = secret;
        this.keyLength = 32; // 256 bits
        this.saltLength = 16;
        this.ivLength = 12;
        this.tagLength = 16;
        this.iterations = 100000;
        if (!secret) {
            throw new Error('Encryption secret is required');
        }
    }
    /**
     * Derives an encryption key from the master secret and a salt
     */
    async deriveKey(salt) {
        return pbkdf2(this.secret, salt, this.iterations, this.keyLength, 'sha256');
    }
    /**
     * Encrypts sensitive data
     */
    async encrypt(data) {
        try {
            // Generate salt and IV
            const salt = await randomBytes(this.saltLength);
            const iv = await randomBytes(this.ivLength);
            // Derive key
            const key = await this.deriveKey(salt);
            // Create cipher
            const cipher = crypto_1.default.createCipheriv(algorithm, key, iv, {
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
        }
        catch (error) {
            console.error('Encryption failed:', error);
            throw new Error('Failed to encrypt data');
        }
    }
    /**
     * Decrypts encrypted data
     */
    async decrypt(encryptedData) {
        try {
            // Convert from base64
            const buffer = Buffer.from(encryptedData, 'base64');
            // Extract components
            const salt = buffer.slice(0, this.saltLength);
            const iv = buffer.slice(this.saltLength, this.saltLength + this.ivLength);
            const tag = buffer.slice(this.saltLength + this.ivLength, this.saltLength + this.ivLength + this.tagLength);
            const encrypted = buffer.slice(this.saltLength + this.ivLength + this.tagLength);
            // Derive key
            const key = await this.deriveKey(salt);
            // Create decipher
            const decipher = crypto_1.default.createDecipheriv(algorithm, key, iv, {
                authTagLength: this.tagLength,
            });
            decipher.setAuthTag(tag);
            // Decrypt data
            const decrypted = Buffer.concat([
                decipher.update(encrypted),
                decipher.final(),
            ]);
            return decrypted.toString('utf8');
        }
        catch (error) {
            console.error('Decryption failed:', error);
            throw new Error('Failed to decrypt data');
        }
    }
    /**
     * Hashes sensitive data (one-way)
     */
    async hash(data) {
        const salt = await randomBytes(this.saltLength);
        const hash = await pbkdf2(data, salt, this.iterations, this.keyLength, 'sha256');
        return Buffer.concat([salt, hash]).toString('base64');
    }
    /**
     * Verifies hashed data
     */
    async verifyHash(data, hashedData) {
        try {
            const buffer = Buffer.from(hashedData, 'base64');
            const salt = buffer.slice(0, this.saltLength);
            const hash = buffer.slice(this.saltLength);
            const compareHash = await pbkdf2(data, salt, this.iterations, this.keyLength, 'sha256');
            return crypto_1.default.timingSafeEqual(hash, compareHash);
        }
        catch (error) {
            console.error('Hash verification failed:', error);
            return false;
        }
    }
    /**
     * Generates a secure random token
     */
    async generateToken(length = 32) {
        const bytes = await randomBytes(length);
        return bytes.toString('base64url');
    }
}
// Create encryption service instance
const encryptionService = new EncryptionService(process.env.ENCRYPTION_SECRET || '');
exports.encryptionService = encryptionService;
