import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KeyVaultClient, KeyVaultClientConfig } from './key-vault.provider';
import { LoggerService } from '../logger';

@Injectable()
export class KeyVaultService implements OnModuleInit {
  private client!: KeyVaultClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly LoggerService: LoggerService,
  ) {
    this.LoggerService.setContext(KeyVaultService.name);
  }

  onModuleInit() {
    const provider = this.configService.get<string>('KEY_VAULT_PROVIDER') as
      | 'aws'
      | 'local';
    
    const keyVaultClientConfig: KeyVaultClientConfig = {
      provider,
      awsRegion: this.configService.get<string>('AWS_REGION'),
      awsKeyId: this.configService.get<string>('AWS_KMS_WALLET_KEY_ID'),
      localMasterKeyFromEnv: this.configService.get<string>(
        'LOCAL_KEY_VAULT_MASTER_KEY',
      ),
    };

    this.client = new KeyVaultClient(keyVaultClientConfig, this.LoggerService);
    this.LoggerService.log(
      `KeyVaultService initialized and KeyVaultClient instantiated with provider: ${provider}`,
    );
  }

  private ensureClientInitialized(): void {
    if (!this.client) {
      throw new Error('KeyVaultService not initialized.');
    }
  }

  async encryptData(data: string): Promise<string> {
    this.LoggerService.debug('KeyVaultService: encryptData called');
    this.ensureClientInitialized();
    return this.client.encryptData(data);
  }

  async decryptData(encryptedDataB64: string): Promise<string> {
    this.LoggerService.debug('KeyVaultService: decryptData called');
    this.ensureClientInitialized();
    return this.client.decryptData(encryptedDataB64);
  }

  async rotateKey() {
    this.LoggerService.warn(
      'KeyVaultService: rotateKey called (placeholder operation).',
    );
    this.ensureClientInitialized();
    return this.client.rotateKey();
  }
}