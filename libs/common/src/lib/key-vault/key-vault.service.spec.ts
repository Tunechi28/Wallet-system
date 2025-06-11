import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KeyVaultService } from './key-vault.service';
import { KeyVaultClient, KeyVaultClientConfig } from './key-vault.provider';
import { LoggerService as LoggerService } from '../logger';

jest.mock('./key-vault.provider', () => ({
  KeyVaultClient: jest.fn().mockImplementation((config: KeyVaultClientConfig) => {
    if (!config.provider) {
      throw new Error('Invalid KeyVault provider specified.');
    }
    return {
      encryptData: jest.fn(),
      decryptData: jest.fn(),
      rotateKey: jest.fn(),
    };
  }),
}));

const MockedKeyVaultClient = KeyVaultClient as jest.MockedClass<typeof KeyVaultClient>;

describe('KeyVaultService', () => {
  let service: KeyVaultService;
  let configService: ConfigService;
  let logger: LoggerService;

  beforeEach(async () => {
    MockedKeyVaultClient.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KeyVaultService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: LoggerService,
          useValue: {
            setContext: jest.fn(),
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<KeyVaultService>(KeyVaultService);
    configService = module.get<ConfigService>(ConfigService);
    logger = module.get<LoggerService>(LoggerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize correctly with a valid provider', () => {
      const getSpy = jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'KEY_VAULT_PROVIDER') return 'local';
        if (key === 'LOCAL_KEY_VAULT_MASTER_KEY') return 'test-master-key';
        return undefined;
      });

      expect(() => service.onModuleInit()).not.toThrow();

      expect(MockedKeyVaultClient).toHaveBeenCalledWith(
        {
          provider: 'local',
          awsRegion: undefined,
          awsKeyId: undefined,
          localMasterKeyFromEnv: 'test-master-key',
        },
        expect.anything(),
      );
    });

    it('should throw an error if provider is not configured', () => {
      jest.spyOn(configService, 'get').mockReturnValue(undefined);
      expect(() => service.onModuleInit()).toThrow('Invalid KeyVault provider specified.');
    });
  });

  describe('Service Methods', () => {
    let clientInstance: KeyVaultClient;

    beforeEach(() => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
          if (key === 'KEY_VAULT_PROVIDER') return 'local';
          return undefined;
      });
      service.onModuleInit();
      clientInstance = (service as any).client;
    });

    it('encryptData should call the client.encryptData method', async () => {
      const encryptSpy = jest.spyOn(clientInstance, 'encryptData');
      await service.encryptData('test');
      expect(encryptSpy).toHaveBeenCalledWith('test');
    });

    it('decryptData should call the client.decryptData method', async () => {
      const decryptSpy = jest.spyOn(clientInstance, 'decryptData');
      await service.decryptData('test');
      expect(decryptSpy).toHaveBeenCalledWith('test');
    });

    it('should throw an error if a method is called before onModuleInit', async () => {
      const uninitializedService = new KeyVaultService(configService, logger);
      await expect(uninitializedService.encryptData('test')).rejects.toThrow('KeyVaultService not initialized.');
    });
  });
});