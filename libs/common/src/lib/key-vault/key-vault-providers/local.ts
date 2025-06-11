import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  scryptSync,
  createHash,
} from 'crypto';
import { LoggerService } from '../../logger';

const LOCAL_KEY_ENV_VAR = 'LOCAL_KEY_VAULT_MASTER_KEY';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

export class LocalKeyVaultDriver {
  private encryptionKey: Buffer;

  constructor(
    masterKeyOrPasswordFromEnv: string | undefined,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(LocalKeyVaultDriver.name);
    const keySource = masterKeyOrPasswordFromEnv;

    if (!keySource) {
      this.logger.warn(
        `Master key not provided via env var ${LOCAL_KEY_ENV_VAR}. Using a default, insecure key. FOR DEVELOPMENT/TESTING ONLY.`,
      );
      this.encryptionKey = createHash('sha256')
        .update('default-insecure-local-dev-key-only-change-this!')
        .digest();
    } else {
      const salt = Buffer.alloc(SALT_LENGTH, 'fixed-local-dev-salt-for-scrypt');
      this.encryptionKey = scryptSync(keySource, salt, KEY_LENGTH);
      this.logger.log(
        'Initialized with a derived key from provided master key/password.',
      );
    }
    if (this.encryptionKey.length !== KEY_LENGTH) {
      this.logger.error(
        `Derived encryption key length is incorrect. Expected ${KEY_LENGTH}, got ${this.encryptionKey.length}.`,
      );
      throw new Error(
        'Failed to derive a key of correct length for LocalKeyVaultDriver.',
      );
    }
  }

  async encrypt(_keyId: string, data: string): Promise<Buffer> {
    this.logger.debug(
      `Encrypting data (conceptual keyId: ${_keyId} - ignored)`,
    );
    try {
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv(ALGORITHM, this.encryptionKey, iv);
      const encrypted = Buffer.concat([
        cipher.update(Buffer.from(data, 'utf8')),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();
      const resultBuffer = Buffer.concat([iv, authTag, encrypted]);
      this.logger.debug('Data encrypted successfully.');
      return resultBuffer;
    } catch (error) {
      this.logger.error(
        'Encryption failed.',
        error instanceof Error ? error.stack : undefined,
        undefined,
        { error },
      );
      throw error;
    }
  }

  async decrypt(_keyId: string, data: Buffer): Promise<string> {
    this.logger.debug(
      `Decrypting data (conceptual keyId: ${_keyId} - ignored)`,
    );
    try {
      const iv = data.subarray(0, IV_LENGTH);
      const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
      const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

      const decipher = createDecipheriv(ALGORITHM, this.encryptionKey, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      this.logger.debug('Data decrypted successfully.');
      return decrypted.toString('utf8');
    } catch (error) {
      this.logger.error(
        'Decryption failed.',
        error instanceof Error ? error.stack : undefined,
        undefined,
        { error },
      );
      throw new Error(
        `Local decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
