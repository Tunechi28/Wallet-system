import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';

import { WalletService } from './wallet.service';
import { Wallet, Account, User, Transaction } from '@app/persistance';
import { KeyVaultService, RedisCacheService, TransactionQueueService, LoggerService as AppLogger, comparePassword } from '@app/common';

jest.mock('@app/common', () => ({
  ...jest.requireActual('@app/common'),
  comparePassword: jest.fn(),
}));

describe('WalletService', () => {
  let service: WalletService;
  let walletRepository: Repository<Wallet>;
  let accountRepository: Repository<Account>;
  let userRepository: Repository<User>;
  let transactionRepository: Repository<Transaction>;
  let dataSource: DataSource;
  let logger: AppLogger;
  let keyVaultService: KeyVaultService;
  let redisCacheService: RedisCacheService;
  let txQueueService: TransactionQueueService;
  let configService: ConfigService;

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        {
          provide: getRepositoryToken(Wallet),
          useValue: { findOne: jest.fn(), create: jest.fn(), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(Account),
          useValue: { findOne: jest.fn(), find: jest.fn(), create: jest.fn(), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: { findOne: jest.fn(), findAndCount: jest.fn() },
        },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
          },
        },
        {
          provide: AppLogger,
          useValue: {
            setContext: jest.fn(),
            log: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            customError: jest.fn(),
          },
        },
        {
          provide: KeyVaultService,
          useValue: { encryptData: jest.fn(), decryptData: jest.fn() },
        },
        {
          provide: RedisCacheService,
          useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
        },
        {
          provide: TransactionQueueService,
          useValue: { addToMempool: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
    walletRepository = module.get<Repository<Wallet>>(getRepositoryToken(Wallet));
    accountRepository = module.get<Repository<Account>>(getRepositoryToken(Account));
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    transactionRepository = module.get<Repository<Transaction>>(getRepositoryToken(Transaction));
    dataSource = module.get<DataSource>(DataSource);
    logger = module.get<AppLogger>(AppLogger);
    keyVaultService = module.get<KeyVaultService>(KeyVaultService);
    redisCacheService = module.get<RedisCacheService>(RedisCacheService);
    txQueueService = module.get<TransactionQueueService>(TransactionQueueService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createWalletForUser', () => {
    const userId = 'user-uuid';
    const mockUser = { id: userId, email: 'test@test.com' } as User;
    const mockWallet = { id: 'wallet-uuid', userId } as Wallet;
    const mockAccount = { id: 'account-uuid', systemAddress: 'acc_123', currency: 'NGN', balance: 0 } as Account;

    it('should create a wallet and initial account for a new user', async () => {
      jest.spyOn(walletRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(keyVaultService, 'encryptData').mockResolvedValue('encrypted-mnemonic');
      mockQueryRunner.manager.create.mockImplementation((entityType, entity) => entity as any);
      mockQueryRunner.manager.save.mockImplementation((entityType, entity) => {
        if (entityType === Wallet) return Promise.resolve({ ...entity, id: mockWallet.id } as Wallet);
        if (entityType === Account) return Promise.resolve({ ...entity, id: mockAccount.id } as Account);
        return Promise.resolve(entity);
      });

      const result = await service.createWalletForUser(userId, ['NGN']);

      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(keyVaultService.encryptData).toHaveBeenCalled();
      expect(mockQueryRunner.manager.save).toHaveBeenCalledTimes(2);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
      expect(result.walletId).toBe(mockWallet.id);
      expect(result.systemMnemonic).toBeDefined();
      expect(result.accounts).toHaveLength(1);
    });

    it('should throw ConflictException if wallet already exists', async () => {
      jest.spyOn(walletRepository, 'findOne').mockResolvedValue(mockWallet);
      await expect(service.createWalletForUser(userId)).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if user does not exist', async () => {
      jest.spyOn(walletRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      await expect(service.createWalletForUser(userId)).rejects.toThrow(NotFoundException);
    });

    it('should throw InternalServerErrorException if encryption fails', async () => {
      jest.spyOn(walletRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(keyVaultService, 'encryptData').mockRejectedValue(new Error('KMS error'));
      await expect(service.createWalletForUser(userId)).rejects.toThrow(InternalServerErrorException);
    });

    it('should rollback transaction if saving to DB fails', async () => {
      jest.spyOn(walletRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(keyVaultService, 'encryptData').mockResolvedValue('encrypted-mnemonic');
      mockQueryRunner.manager.save.mockRejectedValue(new Error('DB save error'));

      await expect(service.createWalletForUser(userId)).rejects.toThrow(InternalServerErrorException);
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  describe('submitTransfer', () => {
    const userId = 'user-uuid';
    const fromSystemAddress = 'acc_sender';
    const toSystemAddress = 'acc_recipient';
    const mockSenderAccount = { id: 'sender-uuid', systemAddress: fromSystemAddress, currency: 'NGN', balance: 1000, locked: 50, nonce: '1' } as Account;
    const mockRecipientAccount = { id: 'recipient-uuid', systemAddress: toSystemAddress, currency: 'NGN', balance: 500 } as Account;
    const mockTransaction = { id: 'tx-uuid', systemHash: 'txn_hash' } as Transaction;

    it('should submit a valid transfer to the mempool', async () => {
      mockQueryRunner.manager.findOne.mockImplementation((entityType, options: any) => {
        if (options.where.systemAddress === fromSystemAddress) return Promise.resolve(mockSenderAccount);
        if (options.where.systemAddress === toSystemAddress) return Promise.resolve(mockRecipientAccount);
        return Promise.resolve(null);
      });
      mockQueryRunner.manager.save
        .mockResolvedValueOnce(mockSenderAccount)
        .mockResolvedValueOnce(mockTransaction);

      await service.submitTransfer(userId, fromSystemAddress, toSystemAddress, '100.00', 'NGN');

      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.manager.save).toHaveBeenCalledTimes(2);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(txQueueService.addToMempool).toHaveBeenCalledWith(mockTransaction.id);
      expect(redisCacheService.del).toHaveBeenCalledWith(`balance:${fromSystemAddress}`);
    });

    it('should throw BadRequestException for non-positive amount', async () => {
      await expect(service.submitTransfer(userId, fromSystemAddress, toSystemAddress, '0', 'NGN')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for transfer to self', async () => {
        await expect(service.submitTransfer(userId, fromSystemAddress, fromSystemAddress, '100', 'NGN')).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if user does not own sender account', async () => {
        mockQueryRunner.manager.findOne.mockResolvedValue(null);
        await expect(service.submitTransfer(userId, fromSystemAddress, toSystemAddress, '100', 'NGN')).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for insufficient funds', async () => {
        mockQueryRunner.manager.findOne.mockResolvedValue(mockSenderAccount);
        await expect(service.submitTransfer(userId, fromSystemAddress, toSystemAddress, '951', 'NGN')).rejects.toThrow(BadRequestException);
    });
    
    it('should throw NotFoundException if recipient does not exist', async () => {
        mockQueryRunner.manager.findOne
            .mockResolvedValueOnce(mockSenderAccount)
            .mockResolvedValueOnce(null);
        await expect(service.submitTransfer(userId, fromSystemAddress, toSystemAddress, '100', 'NGN')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for currency mismatch', async () => {
        const wrongCurrencyRecipient = { ...mockRecipientAccount, currency: 'USD' } as Account;
        mockQueryRunner.manager.findOne
            .mockResolvedValueOnce(mockSenderAccount)
            .mockResolvedValueOnce(wrongCurrencyRecipient);
        await expect(service.submitTransfer(userId, fromSystemAddress, toSystemAddress, '100', 'NGN')).rejects.toThrow(BadRequestException);
    });

    it('should rollback transaction if any DB operation fails', async () => {
        mockQueryRunner.manager.findOne.mockResolvedValue(mockSenderAccount);
        mockQueryRunner.manager.save.mockRejectedValue(new Error('DB save failed'));
        await expect(service.submitTransfer(userId, fromSystemAddress, toSystemAddress, '100', 'NGN')).rejects.toThrow(InternalServerErrorException);
        expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });
});
