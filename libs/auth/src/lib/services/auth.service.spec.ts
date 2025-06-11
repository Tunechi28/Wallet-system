import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository, DeleteResult } from 'typeorm';
import { BadRequestException, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { AuthService } from './auth.service';
import { WalletService } from '../../../../wallet/src/lib/services/wallet.service';
import { KafkaService } from '../../../../common/src/lib/kafka/kafka.service';
import { LoggerService } from '../../../../common/src/lib/logger/logger.service';
import { hashPassword, comparePassword } from '../../../../common/src/utils/crypto.utils';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { Wallet } from '../../../../persistance/src/lib/entities/wallet.entity';
import { User } from '../../../../persistance/src/lib/entities/user.entity';

jest.mock('../../../../common/src/utils/crypto.utils', () => ({
  ...jest.requireActual('../../../../common/src/utils/crypto.utils'),
  hashPassword: jest.fn(),
  comparePassword: jest.fn(),
}));

describe('AuthService', () => {
  let authService: AuthService;
  let userRepository: Repository<User>;
  let jwtService: JwtService;
  let kafkaService: KafkaService;
  let walletService: WalletService;
  let loggerService: LoggerService;

  const mockUser: User = {
    id: 'user-uuid-123',
    email: 'test@example.com',
    passwordHash: 'hashedPassword',
    wallet: undefined as unknown as Wallet,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockWalletCreationResult = {
    walletId: 'wallet-uuid-456',
    systemMnemonic: 'test-system-mnemonic',
    accounts: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
          },
        },
        {
          provide: KafkaService,
          useValue: {
            sendMessages: jest.fn(),
          },
        },
        {
          provide: WalletService,
          useValue: {
            createWalletForUser: jest.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            setContext: jest.fn(),
            log: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            customError: jest.fn(),
          },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    jwtService = module.get<JwtService>(JwtService);
    kafkaService = module.get<KafkaService>(KafkaService);
    walletService = module.get<WalletService>(WalletService);
    loggerService = module.get<LoggerService>(LoggerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(authService).toBeDefined();
  });

  describe('register', () => {
    const registerDto: RegisterDto = { email: 'test@example.com', password: 'password123' };

    it('should successfully register a user, create a wallet, and return a token and mnemonic', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      (hashPassword as jest.Mock).mockResolvedValue('hashedPassword');
      jest.spyOn(userRepository, 'create').mockReturnValue(mockUser);
      jest.spyOn(userRepository, 'save').mockResolvedValue(mockUser);
      jest.spyOn(walletService, 'createWalletForUser').mockResolvedValue(mockWalletCreationResult as any);
      jest.spyOn(kafkaService, 'sendMessages').mockResolvedValue({} as any);
      jest.spyOn(jwtService, 'sign').mockReturnValue('test-token');

      const result = await authService.register(registerDto);

      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { email: registerDto.email } });
      expect(hashPassword).toHaveBeenCalledWith(registerDto.password);
      expect(userRepository.save).toHaveBeenCalledWith(mockUser);
      expect(walletService.createWalletForUser).toHaveBeenCalledWith(mockUser.id, ['NGN_LEDGER']);
      expect(kafkaService.sendMessages).toHaveBeenCalled();
      expect(jwtService.sign).toHaveBeenCalledWith({ userId: mockUser.id, email: mockUser.email });
      expect(result).toEqual({
        user: { id: mockUser.id, email: mockUser.email },
        token: 'test-token',
        walletId: mockWalletCreationResult.walletId,
        systemMnemonic: mockWalletCreationResult.systemMnemonic,
      });
    });

    it('should throw BadRequestException if email already exists', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      await expect(authService.register(registerDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for a short password', async () => {
      const shortPasswordDto: RegisterDto = { ...registerDto, password: '123' };
      await expect(authService.register(shortPasswordDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw InternalServerErrorException if saving the user fails', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      (hashPassword as jest.Mock).mockResolvedValue('hashedPassword');
      jest.spyOn(userRepository, 'create').mockReturnValue(mockUser);
      jest.spyOn(userRepository, 'save').mockRejectedValue(new Error('DB error'));

      await expect(authService.register(registerDto)).rejects.toThrow(InternalServerErrorException);
    });

    it('should rollback user creation and throw InternalServerErrorException if wallet creation fails', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      (hashPassword as jest.Mock).mockResolvedValue('hashedPassword');
      jest.spyOn(userRepository, 'create').mockReturnValue(mockUser);
      jest.spyOn(userRepository, 'save').mockResolvedValue(mockUser);
      jest.spyOn(walletService, 'createWalletForUser').mockRejectedValue(new Error('Wallet service error'));
      jest.spyOn(userRepository, 'delete').mockResolvedValue({ affected: 1, raw: [] } as DeleteResult);

      await expect(authService.register(registerDto)).rejects.toThrow(InternalServerErrorException);
      expect(userRepository.delete).toHaveBeenCalledWith(mockUser.id);
    });
    
    it('should log an error if user deletion fails during rollback', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      (hashPassword as jest.Mock).mockResolvedValue('hashedPassword');
      jest.spyOn(userRepository, 'create').mockReturnValue(mockUser);
      jest.spyOn(userRepository, 'save').mockResolvedValue(mockUser);
      jest.spyOn(walletService, 'createWalletForUser').mockRejectedValue(new Error('Wallet service error'));
      jest.spyOn(userRepository, 'delete').mockRejectedValue(new Error('Delete user failed'));

      await expect(authService.register(registerDto)).rejects.toThrow(InternalServerErrorException);
      expect(loggerService.error).toHaveBeenCalledWith(expect.stringContaining('Failed to delete user'), expect.any(String));
    });

    it('should register successfully even if kafka notification fails', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      (hashPassword as jest.Mock).mockResolvedValue('hashedPassword');
      jest.spyOn(userRepository, 'create').mockReturnValue(mockUser);
      jest.spyOn(userRepository, 'save').mockResolvedValue(mockUser);
      jest.spyOn(walletService, 'createWalletForUser').mockResolvedValue(mockWalletCreationResult as any);
      jest.spyOn(kafkaService, 'sendMessages').mockRejectedValue(new Error('Kafka down'));
      jest.spyOn(jwtService, 'sign').mockReturnValue('test-token');

      const result = await authService.register(registerDto);

      expect(loggerService.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to send Kafka notification'), expect.any(String));
      expect(result.token).toEqual('test-token');
    });
  });

  describe('login', () => {
    const loginDto: LoginDto = { email: 'test@example.com', password: 'password123' };

    it('should successfully log in a user and return a token', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      (comparePassword as jest.Mock).mockResolvedValue(true);
      jest.spyOn(jwtService, 'sign').mockReturnValue('test-token');

      const result = await authService.login(loginDto);

      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { email: loginDto.email } });
      expect(comparePassword).toHaveBeenCalledWith(loginDto.password, mockUser.passwordHash);
      expect(jwtService.sign).toHaveBeenCalledWith({ userId: mockUser.id, email: mockUser.email });
      expect(result).toEqual({
        user: { id: mockUser.id, email: mockUser.email },
        token: 'test-token',
      });
    });

    it('should throw NotFoundException if user does not exist', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      await expect(authService.login(loginDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw UnauthorizedException if password does not match', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      (comparePassword as jest.Mock).mockResolvedValue(false);

      await expect(authService.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });
  });
});
