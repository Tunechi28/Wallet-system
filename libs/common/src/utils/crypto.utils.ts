import * as bcrypt from 'bcrypt';
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
} from 'crypto';

const BCRYPT_SALT_ROUNDS = 12;
const APP_LEVEL_ALGORITHM = 'aes-256-gcm';
const APP_LEVEL_IV_LENGTH = 16;
const APP_LEVEL_AUTH_TAG_LENGTH = 16;
const APP_LEVEL_KEY_LENGTH = 32;

let APP_ENCRYPTION_KEY_BUFFER: Buffer;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

export async function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function initializeAppLevelEncryptionKey() {
  const keyString = process.env['APP_ENCRYPTION_KEY'];
  if (keyString) {
    const keyBuffer = Buffer.from(keyString, 'utf8');
    if (keyBuffer.length === APP_LEVEL_KEY_LENGTH) {
      APP_ENCRYPTION_KEY_BUFFER = keyBuffer;
    } else if (keyBuffer.length > APP_LEVEL_KEY_LENGTH) {
      console.warn(
        'WARNING: APP_ENCRYPTION_KEY is longer than 32 bytes. It will be truncated. This is not ideal.',
      );
      APP_ENCRYPTION_KEY_BUFFER = keyBuffer.subarray(0, APP_LEVEL_KEY_LENGTH);
    } else {
      console.warn(
        'WARNING: APP_ENCRYPTION_KEY is shorter than 32 bytes. It will be padded with zeros. This is not ideal.',
      );
      APP_ENCRYPTION_KEY_BUFFER = Buffer.alloc(APP_LEVEL_KEY_LENGTH);
      keyBuffer.copy(APP_ENCRYPTION_KEY_BUFFER);
    }
  } else {
    console.warn(
      'SECURITY WARNING: APP_ENCRYPTION_KEY environment variable is not set. Using a default, insecure key for app-level encryption. THIS IS FOR DEVELOPMENT/TESTING ONLY AND IS NOT SECURE.',
    );
    APP_ENCRYPTION_KEY_BUFFER = createHash('sha256')
      .update('extremely-insecure-default-app-key-replace-this-now!')
      .digest();
  }
}
initializeAppLevelEncryptionKey();

/**
 * Encrypts text using AES-256-GCM. FOR APP-LEVEL DATA ONLY, PREFER KeyVaultService.
 * @param text The plain text to encrypt.
 * @param key The encryption key (defaults to an app-level key derived from APP_ENCRYPTION_KEY env var).
 * @returns The encrypted text (hex string: iv + authTag + ciphertext) or null on failure.
 */
export function encryptAppLevel(
  text: string,
  key: Buffer = APP_ENCRYPTION_KEY_BUFFER,
): string | null {
  try {
    const iv = randomBytes(APP_LEVEL_IV_LENGTH);
    const cipher = createCipheriv(APP_LEVEL_ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return (
      iv.toString('hex') + authTag.toString('hex') + encrypted.toString('hex')
    );
  } catch (error) {
    console.error(
      'App-level encryption failed:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Decrypts text encrypted with AES-256-GCM. FOR APP-LEVEL DATA ONLY, PREFER KeyVaultService.
 * @param encryptedHexWithIvAndAuthTag The hex string containing IV, AuthTag, and ciphertext.
 * @param key The decryption key (defaults to an app-level key).
 * @returns The decrypted plain text or null on failure.
 */
export function decryptAppLevel(
  encryptedHexWithIvAndAuthTag: string,
  key: Buffer = APP_ENCRYPTION_KEY_BUFFER,
): string | null {
  try {
    const ivHex = encryptedHexWithIvAndAuthTag.slice(
      0,
      APP_LEVEL_IV_LENGTH * 2,
    );
    const authTagHex = encryptedHexWithIvAndAuthTag.slice(
      APP_LEVEL_IV_LENGTH * 2,
      (APP_LEVEL_IV_LENGTH + APP_LEVEL_AUTH_TAG_LENGTH) * 2,
    );
    const encryptedHex = encryptedHexWithIvAndAuthTag.slice(
      (APP_LEVEL_IV_LENGTH + APP_LEVEL_AUTH_TAG_LENGTH) * 2,
    );

    if (
      ivHex.length !== APP_LEVEL_IV_LENGTH * 2 ||
      authTagHex.length !== APP_LEVEL_AUTH_TAG_LENGTH * 2 ||
      encryptedHex.length === 0
    ) {
      console.error(
        'App-level decryption failed: Invalid encrypted string format (lengths).',
      );
      return null;
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(encryptedHex, 'hex');

    const decipher = createDecipheriv(APP_LEVEL_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch (error) {
    console.error(
      'App-level decryption failed:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
