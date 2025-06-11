import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Decimal } from 'decimal.js';
import { Wallet } from '../../../../persistance/src/lib/entities/wallet.entity';
import { Account } from '../../../../persistance/src/lib/entities/account.entity';
import { Transaction, TransactionStatusTypeORM, TransactionTypeTypeORM } from '../../../../persistance/src/lib/entities/transaction.entity';
import { User } from '../../../../persistance/src/lib/entities/user.entity';

import {
  KeyVaultService,
  RedisCacheService,
  TransactionQueueService,
  comparePassword,
  LoggerService,
} from '@app/common';

import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import * as bip39 from 'bip39';

const generateSystemMnemonic = (): string => {
  return bip39.generateMnemonic();
};

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly dataSource: DataSource,
    private readonly logger: LoggerService,
    private readonly keyVaultService: KeyVaultService,
    private readonly redisCacheService: RedisCacheService,
    private readonly txQueueService: TransactionQueueService,
    private readonly configService: ConfigService,
  ) {
    this.logger.setContext(WalletService.name);
  }

  async createWalletForUser(
    userId: string,
    initialCurrencies: string[] = ['NGN'],
  ): Promise<{
    walletId: string;
    systemMnemonic: string;
    accounts: Array<Pick<Account, 'systemAddress' | 'currency' | 'balance'>>;
  }> {
    this.logger.log(`Attempting to create wallet for user ID: ${userId}`);

    const existingWallet = await this.walletRepository.findOne({
      where: { userId },
    });
    if (existingWallet) {
      this.logger.warn(
        `User ${userId} already has a wallet (ID: ${existingWallet.id}).`,
      );
      throw new ConflictException('User already has a wallet.');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      this.logger.error(
        `User with ID ${userId} not found during wallet creation.`,
      );
      throw new NotFoundException(`User with ID ${userId} not found.`);
    }

    const systemMnemonic = generateSystemMnemonic();
    let encryptedMnemonic: string;
    try {
      encryptedMnemonic =
        await this.keyVaultService.encryptData(systemMnemonic);
      this.logger.debug(
        `System mnemonic encrypted successfully for user ${userId}.`,
      );
    } catch (encError: any) {
      this.logger.customError(
        `Failed to encrypt system mnemonic for user ${userId}.`,
        encError,
        { userId },
      );
      throw new InternalServerErrorException(
        'Failed to secure wallet credentials.',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const newWallet = queryRunner.manager.create(Wallet, {
        userId,
        user,
        encryptedSystemMnemonic: encryptedMnemonic,
        keyVaultKeyId:
          this.configService.get<string>('KEY_VAULT_AWS_KMS_WALLET_KEY_ID') ||
          this.configService.get<string>('KEY_VAULT_TRANSIT_WALLET_KEY_NAME') ||
          'local-key',
        salt: randomBytes(16).toString('hex'),
        version: 1,
      });
      const savedWallet = await queryRunner.manager.save(Wallet, newWallet);
      this.logger.log(
        `Wallet entity ${savedWallet.id} created for user ${userId}.`,
      );

      const createdAccounts: Account[] = [];
      for (const currency of initialCurrencies) {
        const normalizedCurrency = currency.toUpperCase();
        const newAccount = queryRunner.manager.create(Account, {
          walletId: savedWallet.id,
          wallet: savedWallet,
          currency: normalizedCurrency,
          systemAddress: `acc_${randomBytes(12).toString('hex')}`,
          balance: 1000,
          locked: 0,
          nonce: '0',
        });
        const savedAccount = await queryRunner.manager.save(
          Account,
          newAccount,
        );
        createdAccounts.push(savedAccount);
        this.logger.log(
          `Initial account ${savedAccount.systemAddress} (${normalizedCurrency}) created for wallet ${savedWallet.id}.`,
        );
      }

      await queryRunner.commitTransaction();
      this.logger.log(
        `Wallet ${savedWallet.id} and initial accounts committed for user ${userId}.`,
      );

      return {
        walletId: savedWallet.id,
        systemMnemonic,
        accounts: createdAccounts.map((acc) => ({
          systemAddress: acc.systemAddress,
          currency: acc.currency,
          balance: acc.balance,
        })),
      };
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      this.logger.customError(
        `Error during wallet/account creation transaction for user ${userId}. Transaction rolled back.`,
        error,
        { userId },
      );
      throw new InternalServerErrorException(
        'Wallet creation failed due to a database error.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async getAccountBalance(
    userId: string,
    systemAddress: string,
  ): Promise<{
    available: string;
    locked: string;
    total: string;
    currency: string;
    nonce: string;
  } | null> {
    this.logger.debug(
      `Fetching balance for account ${systemAddress}, requested by user ${userId}`,
    );

    const account = await this.accountRepository.findOne({
      where: { systemAddress, wallet: { userId } },
    });

    if (!account) {
      this.logger.warn(
        `Account ${systemAddress} not found or not owned by user ${userId}.`,
      );
      throw new NotFoundException('Account not found or access denied.');
    }

    const cacheKey = `balance:${systemAddress}`;
    const cachedBalance = await this.redisCacheService.get(cacheKey);
    if (cachedBalance) {
      try {
        this.logger.debug(`Balance cache HIT for ${systemAddress}`);
        return JSON.parse(cachedBalance);
      } catch (e: any) {
        this.logger.warn(
          `Failed to parse cached balance for ${systemAddress}. Fetching from DB.`,
          undefined,
          { error: e.message, key: cacheKey },
        );
      }
    }
    this.logger.debug(
      `Balance cache MISS for ${systemAddress}. Fetching from DB.`,
    );

    const totalBalance = new Decimal(account.balance);
    const lockedAmount = new Decimal(account.locked);
    const availableBalance = totalBalance.minus(lockedAmount);

    const result = {
      available: availableBalance.toFixed(8),
      locked: lockedAmount.toFixed(8),
      total: totalBalance.toFixed(8),
      currency: account.currency,
      nonce: account.nonce.toString(),
    };

    await this.redisCacheService.set(
      cacheKey,
      JSON.stringify(result),
      this.configService.get<number>('CACHE_BALANCE_TTL_SECONDS'),
    );
    this.logger.log(
      `Balance for ${systemAddress}: Available ${result.available}, Total ${result.total} ${result.currency}`,
    );
    return result;
  }

  async submitTransfer(
    userId: string,
    fromSystemAddress: string,
    toSystemAddress: string,
    amountStr: string,
    currency: string,
    description?: string,
  ): Promise<Pick<Transaction, 'id' | 'systemHash' | 'status'>> {
    this.logger.log(
      `Transfer submission from ${fromSystemAddress} to ${toSystemAddress} for ${amountStr} ${currency} by user ${userId}`,
    );
    const amount = new Decimal(amountStr);

    if (amount.lte(0)) {
      this.logger.warn(
        'Transfer attempt with non-positive amount.',
        undefined,
        { amount: amountStr, fromSystemAddress, toSystemAddress },
      );
      throw new BadRequestException('Transfer amount must be positive.');
    }
    if (fromSystemAddress === toSystemAddress) {
      this.logger.warn('Transfer attempt to the same account.', undefined, {
        account: fromSystemAddress,
      });
      throw new BadRequestException('Cannot transfer to the same account.');
    }

    const normalizedCurrency = currency.toUpperCase();
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let createdTransaction: Transaction;

    try {
      const sender = await queryRunner.manager.findOne(Account, {
        where: { systemAddress: fromSystemAddress, wallet: { userId } },
        relations: ['wallet'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!sender) {
        this.logger.error(
          `Sender account ${fromSystemAddress} not found or not owned by user ${userId}.`,
        );
        throw new ForbiddenException(
          'Sender account not found or access denied.',
        );
      }
      if (sender.currency !== normalizedCurrency) {
        this.logger.error(
          `Sender account ${fromSystemAddress} currency mismatch. Expected ${normalizedCurrency}, got ${sender.currency}.`,
        );
        throw new BadRequestException(
          `Sender account currency is ${sender.currency}, but transfer is for ${normalizedCurrency}.`,
        );
      }

      const senderBalance = new Decimal(sender.balance);
      const senderLocked = new Decimal(sender.locked);
      const senderAvailableBalance = senderBalance.minus(senderLocked);

      if (senderAvailableBalance.lt(amount)) {
        this.logger.warn(
          `Insufficient available funds for ${fromSystemAddress}.`,
          undefined,
          {
            available: senderAvailableBalance.toFixed(8),
            tryingToSend: amount.toFixed(8),
            currency: normalizedCurrency,
            locked: senderLocked.toFixed(8),
            total: senderBalance.toFixed(8),
          },
        );
        throw new BadRequestException('Insufficient available funds.');
      }

      const recipient = await queryRunner.manager.findOne(Account, {
        where: { systemAddress: toSystemAddress },
      });
      if (!recipient) {
        this.logger.error(`Recipient account ${toSystemAddress} not found.`);
        throw new NotFoundException(
          `Recipient account ${toSystemAddress} not found.`,
        );
      }
      if (recipient.currency !== normalizedCurrency) {
        this.logger.error(
          `Recipient account ${toSystemAddress} currency mismatch. Expected ${normalizedCurrency}, got ${recipient.currency}.`,
        );
        throw new BadRequestException(
          `Recipient account currency is ${recipient.currency}, but transfer is for ${normalizedCurrency}.`,
        );
      }

      const currentNonceForTx = sender.nonce;
      sender.locked = senderLocked.plus(amount).toNumber();
      sender.nonce = (BigInt(sender.nonce) + BigInt(1)).toString();

      await queryRunner.manager.save(Account, sender);

      const transactionEntity = queryRunner.manager.create(Transaction, {
        fromAccountId: sender.id,
        toAccountId: recipient.id,
        amount: amount.toNumber(),
        currency: normalizedCurrency,
        accountNonce: currentNonceForTx,
        status: TransactionStatusTypeORM.PENDING,
        systemHash: `txn_${randomBytes(16).toString('hex')}`,
        type: TransactionTypeTypeORM.TRANSFER,
        description: description || `Transfer to ${toSystemAddress}`,
        fromAccount: sender,
        toAccount: recipient,
      });
      createdTransaction = await queryRunner.manager.save(
        Transaction,
        transactionEntity,
      );

      await queryRunner.commitTransaction();
      this.logger.log(
        `PENDING transaction ${createdTransaction.id} (Nonce: ${currentNonceForTx}) created. From: ${fromSystemAddress}, To: ${toSystemAddress}. Funds locked.`,
      );
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      this.logger.customError(
        `Error during transfer submission for user ${userId}. Rolled back.`,
        error,
        { userId, fromSystemAddress, toSystemAddress, amount: amountStr },
      );
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Transfer submission failed.');
    } finally {
      await queryRunner.release();
    }

    await this.txQueueService.addToMempool(createdTransaction.id);
    this.logger.log(
      `Transaction ${createdTransaction.id} submitted to mempool by user ${userId}.`,
    );

    await this.redisCacheService.del(`balance:${fromSystemAddress}`);

    return {
      id: createdTransaction.id,
      systemHash: createdTransaction.systemHash,
      status: createdTransaction.status,
    };
  }

  async getDecryptedSystemMnemonic(
    userId: string,
    currentPasswordForVerification: string,
  ): Promise<string | null> {
    this.logger.warn(
      `SENSITIVE ACTION: User ${userId} attempting to retrieve decrypted system mnemonic.`,
    );

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      this.logger.error(`User ${userId} not found for mnemonic retrieval.`);
      throw new NotFoundException('User not found.');
    }

    const passwordMatch = await comparePassword(
      currentPasswordForVerification,
      user.passwordHash,
    );
    if (!passwordMatch) {
      this.logger.warn(
        `Mnemonic retrieval for user ${userId} failed: Password re-verification failed.`,
      );
      throw new ForbiddenException(
        'Invalid credentials for mnemonic retrieval.',
      );
    }
    this.logger.log(
      `Password re-verified for user ${userId} during mnemonic retrieval.`,
    );

    const wallet = await this.walletRepository.findOne({ where: { userId } });
    if (!wallet) {
      this.logger.warn(
        `Wallet not found for user ${userId} during mnemonic retrieval.`,
      );
      throw new NotFoundException('Wallet not found for this user.');
    }

    try {
      const decryptedMnemonic = await this.keyVaultService.decryptData(
        wallet.encryptedSystemMnemonic,
      );
      this.logger.warn(
        `SENSITIVE ACTION COMPLETED: Decrypted system mnemonic accessed for user ${userId}.`,
      );
      return decryptedMnemonic;
    } catch (error: any) {
      this.logger.customError(
        `Failed to decrypt system mnemonic for user ${userId}. KeyVault Key ID: ${wallet.keyVaultKeyId}`,
        error,
        { userId, keyVaultKeyId: wallet.keyVaultKeyId },
      );
      throw new InternalServerErrorException(
        'Failed to retrieve system mnemonic. Contact support.',
      );
    }
  }

  async createAccountInWallet(
    userId: string,
    currency: string,
  ): Promise<Account> {
    const normalizedCurrency = currency.toUpperCase();
    this.logger.log(
      `User ${userId} attempting to create account with currency ${normalizedCurrency}`,
    );

    const wallet = await this.walletRepository.findOne({ where: { userId } });
    if (!wallet) {
      this.logger.error(
        `Wallet not found for user ${userId} when trying to create account.`,
      );
      throw new NotFoundException('User wallet not found.');
    }

    const existingAccount = await this.accountRepository.findOne({
      where: { walletId: wallet.id, currency: normalizedCurrency },
    });
    if (existingAccount) {
      this.logger.warn(
        `Account with currency ${normalizedCurrency} already exists in wallet ${wallet.id}.`,
      );
      throw new ConflictException(
        `Account with currency ${normalizedCurrency} already exists.`,
      );
    }

    const newAccountEntity = this.accountRepository.create({
      walletId: wallet.id,
      wallet,
      currency: normalizedCurrency,
      systemAddress: `acc_${randomBytes(12).toString('hex')}`,
      balance: 0,
      locked: 0,
      nonce: '0',
    });
    const savedAccount = await this.accountRepository.save(newAccountEntity);
    this.logger.log(
      `Created new account ${savedAccount.systemAddress} (${normalizedCurrency}) in wallet ${wallet.id}.`,
    );
    return savedAccount;
  }

  async listAccountsForUser(
    userId: string,
  ): Promise<
    Array<
      Pick<
        Account,
        'systemAddress' | 'currency' | 'balance' | 'locked' | 'nonce'
      >
    >
  > {
    this.logger.debug(`Listing accounts for user ${userId}`);
    const accounts = await this.accountRepository.find({
      where: { wallet: { userId } },
      order: { currency: 'ASC' },
    });
    if (!accounts || accounts.length === 0) {
      const walletExists = await this.walletRepository.findOne({
        where: { userId },
      });
      if (!walletExists)
        throw new NotFoundException('Wallet not found for user.');
    }
    return accounts.map((acc) => ({
      systemAddress: acc.systemAddress,
      currency: acc.currency,
      balance: acc.balance,
      locked: acc.locked,
      nonce: acc.nonce.toString(),
    }));
  }

  async getTransactionBySystemHash(
    userId: string,
    systemHash: string,
  ): Promise<Transaction | null> {
    this.logger.debug(
      `User ${userId} fetching transaction by system hash: ${systemHash}`,
    );
    const transaction = await this.transactionRepository.findOne({
      where: { systemHash },
      relations: [
        'fromAccount',
        'toAccount',
        'fromAccount.wallet',
        'toAccount.wallet',
        'block',
      ],
    });

    if (
      transaction &&
      (transaction.fromAccount?.wallet?.userId === userId ||
        transaction.toAccount?.wallet?.userId === userId)
    ) {
      return transaction;
    }
    if (transaction) {
      this.logger.warn(
        `User ${userId} attempted to access transaction ${systemHash} they are not party to.`,
      );
      throw new ForbiddenException('Access denied to this transaction.');
    }
    this.logger.warn(`Transaction ${systemHash} not found for user ${userId}.`);
    return null;
  }

  async listTransactionsForAccount(
    userId: string,
    systemAddress: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    transactions: Transaction[];
    total: number;
    currentPage: number;
    totalPages: number;
  }> {
    this.logger.debug(
      `User ${userId} listing transactions for account ${systemAddress}, page: ${page}, limit: ${limit}`,
    );

    const account = await this.accountRepository.findOne({
      where: { systemAddress, wallet: { userId } },
    });
    if (!account) {
      this.logger.warn(
        `Account ${systemAddress} not found or not owned by user ${userId} for listing transactions.`,
      );
      throw new NotFoundException('Account not found or access denied.');
    }

    const skip = (page - 1) * limit;
    const [transactions, total] = await this.transactionRepository.findAndCount(
      {
        where: [{ fromAccountId: account.id }, { toAccountId: account.id }],
        relations: ['fromAccount', 'toAccount', 'block'],
        order: { createdAt: 'DESC' },
        skip,
        take: limit,
      },
    );
    const totalPages = Math.ceil(total / limit);
    return { transactions, total, currentPage: page, totalPages };
  }
}
