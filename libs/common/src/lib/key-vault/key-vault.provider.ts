import { LoggerService } from '../logger';
import { AWSKMSDriver } from './key-vault-providers/aws';
import { LocalKeyVaultDriver } from './key-vault-providers/local';

export interface KeyVaultClientConfig {
  provider: 'aws' | 'local';
  awsRegion?: string;
  awsKeyId?: string;
  vaultAddr?: string;
  vaultToken?: string;
  vaultTransitKeyName?: string;
  localMasterKeyFromEnv?: string;
}
const DEFAULT_LOCAL_KEY_ID = 'local-master-key';
export class KeyVaultClient {
  private driver: AWSKMSDriver | LocalKeyVaultDriver;
  private defaultKeyIdOrName: string;

  constructor(
    private readonly config: KeyVaultClientConfig,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(KeyVaultClient.name);
    this.logger.log(`Initializing with provider: ${config.provider}`);

    switch (config.provider) {
      case 'aws':
        if (!config.awsRegion || !config.awsKeyId) {
          this.logger.error('AWS KMS region and key ID are required.');
          throw new Error('AWS KMS region and key ID are required.');
        }
        this.driver = new AWSKMSDriver(config.awsRegion, this.logger);
        this.defaultKeyIdOrName = config.awsKeyId;
        break;
      case 'local':
        this.driver = new LocalKeyVaultDriver(
          config.localMasterKeyFromEnv,
          this.logger,
        );
        this.defaultKeyIdOrName = DEFAULT_LOCAL_KEY_ID;
        this.logger.log(
          `Initialized with LOCAL provider. Default key ID: ${this.defaultKeyIdOrName}. THIS IS FOR DEVELOPMENT/TESTING ONLY.`,
        );
        break;
      default:
        this.logger.error(
          `Invalid KeyVault provider specified: ${(config as any).provider}`,
        );
        throw new Error('Invalid KeyVault provider specified.');
    }
    this.logger.log(
      `Driver initialized. Default key/name for operations: ${this.defaultKeyIdOrName}`,
    );
  }

  async encryptData(data: string): Promise<string> {
    this.logger.debug(
      `Encrypting data with default key/name: ${this.defaultKeyIdOrName}`,
    );
    const encryptedBuffer = await this.driver.encrypt(
      this.defaultKeyIdOrName,
      data,
    );
    return encryptedBuffer.toString('base64');
  }

  async decryptData(encryptedDataB64: string): Promise<string> {
    this.logger.debug(
      `Decrypting data with default key/name: ${this.defaultKeyIdOrName}`,
    );
    const buffer = Buffer.from(encryptedDataB64, 'base64');
    return this.driver.decrypt(this.defaultKeyIdOrName, buffer);
  }

  async rotateKey() {
    this.logger.warn(
      'Key rotation initiated (placeholder). This requires a complex background job to re-encrypt data.',
    );
    if (this.driver instanceof LocalKeyVaultDriver) {
      this.logger.warn(
        'LocalKeyVaultDriver does not support automated key rotation in this simple implementation. Master key needs to be changed manually and data re-encrypted.',
      );
    }
    // For AWS, actual rotation happens in the KMS/Vault service.
  }
}
