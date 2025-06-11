import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisCacheService } from './redis-cache.service';
import { RedisCacheClient } from './redis-cache.client';
import { LoggerService } from '../logger';

jest.mock('./redis-cache.client');
const MockRedisCacheClient = RedisCacheClient as jest.MockedClass<typeof RedisCacheClient>;

describe('RedisCacheService', () => {
  let service: RedisCacheService;
  let configService: ConfigService;
  let logger: LoggerService;

  const mockClientInstance = {
    disconnect: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    lpush: jest.fn(),
    rpop: jest.fn(),
    rateLimit: jest.fn(),
    getClient: jest.fn(),
  };

  beforeEach(async () => {
    (MockRedisCacheClient as jest.Mock).mockClear();
    Object.values(mockClientInstance).forEach(mockFn => mockFn.mockClear());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisCacheService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            setContext: jest.fn(),
            log: jest.fn(),
            error: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RedisCacheService>(RedisCacheService);
    configService = module.get<ConfigService>(ConfigService);
    logger = module.get<LoggerService>(LoggerService);

    (MockRedisCacheClient as jest.Mock).mockImplementation(() => mockClientInstance as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize RedisCacheClient with the correct URL', () => {
      const redisUrl = 'redis://localhost:6379';
      jest.spyOn(configService, 'get').mockReturnValue(redisUrl);

      service.onModuleInit();

      expect(configService.get).toHaveBeenCalledWith('REDIS_URL');
      expect(MockRedisCacheClient).toHaveBeenCalledWith(redisUrl, expect.any(LoggerService));
      expect(logger.log).toHaveBeenCalledWith('RedisCacheService initialized.');
    });

    it('should throw an error if REDIS_URL is not configured', () => {
      jest.spyOn(configService, 'get').mockReturnValue(undefined);

      expect(() => service.onModuleInit()).toThrow('REDIS_URL is not configured.');
      expect(logger.error).toHaveBeenCalledWith('REDIS_URL is not configured. RedisCacheService will not work.');
    });
  });

  describe('onModuleDestroy', () => {
    it('should call the disconnect method on the client', async () => {
      jest.spyOn(configService, 'get').mockReturnValue('redis://localhost:6379');
      service.onModuleInit();
      
      await service.onModuleDestroy();

      expect(mockClientInstance.disconnect).toHaveBeenCalledTimes(1);
    });

    it('should not throw an error if the client was never initialized', async () => {
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });
  });

  describe('Service Method Delegation', () => {
    beforeEach(() => {
      jest.spyOn(configService, 'get').mockReturnValue('redis://localhost:6379');
      service.onModuleInit();
    });

    it('get() should call client.get()', async () => {
      const key = 'my-key';
      await service.get(key);
      expect(mockClientInstance.get).toHaveBeenCalledWith(key);
    });

    it('set() should call client.set()', async () => {
      const key = 'my-key';
      const value = 'my-value';
      const ttl = 60;
      await service.set(key, value, ttl);
      expect(mockClientInstance.set).toHaveBeenCalledWith(key, value, ttl);
    });

    it('del() should call client.del()', async () => {
      const key = 'my-key';
      await service.del(key);
      expect(mockClientInstance.del).toHaveBeenCalledWith(key);
    });

    it('lpush() should call client.lpush()', async () => {
      const queueName = 'my-queue';
      const value = 'item1';
      await service.lpush(queueName, value);
      expect(mockClientInstance.lpush).toHaveBeenCalledWith(queueName, value);
    });

    it('rpop() should call client.rpop()', async () => {
      const queueName = 'my-queue';
      await service.rpop(queueName);
      expect(mockClientInstance.rpop).toHaveBeenCalledWith(queueName);
    });

    it('rateLimit() should call client.rateLimit()', async () => {
        const prefix = 'login';
        const id = '127.0.0.1';
        const limit = 5;
        const windowMs = 60000;
        await service.rateLimit(prefix, id, limit, windowMs);
        expect(mockClientInstance.rateLimit).toHaveBeenCalledWith(prefix, id, limit, windowMs);
    });
    
    it('getUnderlyingClient() should call client.getClient()', () => {
        service.getUnderlyingClient();
        expect(mockClientInstance.getClient).toHaveBeenCalled();
    });

    it('should throw an error if a method is called before initialization', async () => {
      const uninitializedService = new RedisCacheService(configService, logger);
      await expect(uninitializedService.get('any-key')).rejects.toThrow('RedisCacheService not initialized properly.');
    });
  });
});
