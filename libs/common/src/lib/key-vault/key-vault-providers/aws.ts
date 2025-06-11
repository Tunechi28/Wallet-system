import {
  KMSClient,
  EncryptCommand,
  DecryptCommand,
  EncryptCommandOutput,
  DecryptCommandOutput,
} from '@aws-sdk/client-kms';
import { LoggerService } from '../../logger';

export class AWSKMSDriver {
  private kms: KMSClient;

  constructor(
    region: string,
    private readonly logger: LoggerService,
  ) {
    this.kms = new KMSClient({ region });
    this.logger.setContext(AWSKMSDriver.name);
    this.logger.log(`Initialized for region: ${region}`);
  }

  async encrypt(keyId: string, data: string): Promise<Buffer> {
    this.logger.debug(`Encrypting data with KeyId: ${keyId}`);
    const command = new EncryptCommand({
      KeyId: keyId,
      Plaintext: Buffer.from(data, 'utf8'),
    });
    const result: EncryptCommandOutput = await this.kms.send(command);
    if (!result.CiphertextBlob) {
      this.logger.error('Encryption failed, CiphertextBlob is undefined.');
      throw new Error('AWS KMS encryption failed: CiphertextBlob is undefined');
    }
    this.logger.debug(`Data encrypted successfully.`);
    return Buffer.from(result.CiphertextBlob);
  }

  async decrypt(keyId: string, data: Buffer): Promise<string> {
    this.logger.debug(`Decrypting data (KeyId hint: ${keyId})`);
    const command = new DecryptCommand({
      CiphertextBlob: data,
    });
    const result: DecryptCommandOutput = await this.kms.send(command);
    if (!result.Plaintext) {
      this.logger.error('Decryption failed, Plaintext is undefined');
      throw new Error('AWS KMS decryption failed: Plaintext is undefined');
    }
    this.logger.debug(`Data decrypted successfully.`);
    return Buffer.from(result.Plaintext).toString('utf8');
  }
}
