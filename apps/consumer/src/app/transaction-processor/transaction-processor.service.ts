import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Decimal } from 'decimal.js';

import {
  Transaction,
  TransactionStatusTypeORM,
  Account,
} from '@app/persistance';
import { ConfigService } from '@nestjs/config';
import {
  RedisCacheService,
  LoggerService,
  TransactionQueueService,
} from '@app/common';
import { BlockService } from '@app/common';

@Injectable()
export class TransactionProcessorService implements OnModuleInit {
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private lastBlockCreatedAt: number = Date.now();

  private readonly batchSize: number;
  private readonly blockTimeMs: number;
  private readonly minTxsPerBlock: number;
  private readonly checkIntervalMs: number;
  private readonly processingLockKeyPrefix = 'tx:processing_lock:';
  private readonly dlqName: string;
  private readonly mempoolName: string;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly redisCacheService: RedisCacheService,
    private readonly txQueueService: TransactionQueueService,
    private readonly blockService: BlockService,
  ) {
    this.logger.setContext(TransactionProcessorService.name);
    this.batchSize = this.configService.get<number>(
      'TX_PROCESSOR_BATCH_SIZE',
      10,
    );
    this.blockTimeMs = this.configService.get<number>(
      'TX_PROCESSOR_BLOCK_TIME_MS',
      15000,
    );
    this.minTxsPerBlock = this.configService.get<number>(
      'TX_PROCESSOR_MIN_TXS_PER_BLOCK',
      3,
    );
    this.checkIntervalMs = this.configService.get<number>(
      'TX_PROCESSOR_INTERVAL_MS',
      5000,
    );
    this.dlqName = this.configService.get<string>(
      'TX_DLQ_NAME',
      'tx:dead_letter',
    );
    this.mempoolName = this.txQueueService.getMempoolName();
  }

  onModuleInit() {
    if (this.configService.get<boolean>('RUN_TX_PROCESSOR')) {
      this.logger.log(
        'TransactionProcessorService initialized. Starting processing loop.',
      );
      this.startProcessingLoop();
    } else {
      this.logger.log(
        'TransactionProcessorService initialized, but RUN_TX_PROCESSOR is false. Not starting loop.',
      );
    }
  }

  startProcessingLoop(): void {
    if (this.processingInterval) {
      this.logger.warn('Processing loop already running.');
      return;
    }
    this.logger.log(
      `Starting transaction processing loop. Interval: ${this.checkIntervalMs}ms, Batch Size: ${this.batchSize}, Block Time: ${this.blockTimeMs}ms`,
    );
    this.processMempoolAndCreateBlock().catch((e) =>
      this.logger.error('Initial processMempoolAndCreateBlock failed', e.stack),
    );
    this.processingInterval = setInterval(async () => {
      if (this.isProcessing) {
        this.logger.debug(
          'Still processing previous batch, skipping this interval.',
        );
        return;
      }
      this.isProcessing = true;
      try {
        await this.processMempoolAndCreateBlock();
      } catch (error: any) {
        this.logger.error(
          'Error in scheduled processing cycle.',
          error.stack,
          undefined,
          { error },
        );
      } finally {
        this.isProcessing = false;
      }
    }, this.checkIntervalMs);
  }

  stopProcessingLoop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      this.logger.log('Transaction processing loop stopped.');
    }
  }

  private async processMempoolAndCreateBlock(): Promise<void> {
    this.logger.debug('Starting new mempool processing cycle.');
    const successfullyExecutedTxData: Array<
      Pick<Transaction, 'id' | 'systemHash'>
    > = [];

    const txIdsFromMempool = await this.txQueueService.getFromMempool(
      this.batchSize,
    );
    if (txIdsFromMempool.length === 0) {
      this.logger.debug('Mempool is empty.');
    } else {
      this.logger.log(
        `Fetched ${txIdsFromMempool.length} transaction IDs from mempool: [${txIdsFromMempool.join(', ')}]`,
      );
    }

    for (const txId of txIdsFromMempool) {
      const lockKey = `${this.processingLockKeyPrefix}${txId}`;
      const lockAcquired = await this.redisCacheService
        .getUnderlyingClient()
        .set(lockKey, 'processing', 'EX', 60, 'NX');

      if (!lockAcquired) {
        this.logger.warn(
          `Could not acquire lock for TX ${txId}, likely being processed by another instance. Skipping.`,
        );
        // Optionally, we can re-add to the front of the queue if this indicates a persistent issue or for immediate retry by another processor
        // await this.redisCacheService.lpush(this.mempoolName, txId);
        continue;
      }

      try {
        const executedTx = await this.executeSingleTransaction(txId);
        if (executedTx) {
          successfullyExecutedTxData.push({
            id: executedTx.id,
            systemHash: executedTx.systemHash,
          });
        }
      } catch (error: any) {
        this.logger.error(
          `Critical error during executeSingleTransaction for TX ${txId}. Manually moving to DLQ if not already done.`,
          error.stack,
          undefined,
          { txId, error },
        );
        await this.moveToDLQ(txId);
      } finally {
        await this.redisCacheService.del(lockKey);
      }
    }

    const timeSinceLastBlock = Date.now() - this.lastBlockCreatedAt;
    const shouldCreateBlock =
      successfullyExecutedTxData.length > 0 &&
      (successfullyExecutedTxData.length >= this.minTxsPerBlock ||
        timeSinceLastBlock >= this.blockTimeMs);

    if (shouldCreateBlock) {
      this.logger.log(
        `Attempting to create block. Processed TXs for block: ${successfullyExecutedTxData.length}, Time since last block: ${timeSinceLastBlock}ms`,
      );
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        const newBlock = await this.blockService.createBlockWithTypeORM(
          successfullyExecutedTxData,
          queryRunner.manager,
        );

        const confirmedTxIds = successfullyExecutedTxData.map((tx) => tx.id);
        if (confirmedTxIds.length > 0) {
          await queryRunner.manager.update(
            Transaction,
            {
              id: In(confirmedTxIds),
              status: TransactionStatusTypeORM.PROCESSING,
            },
            {
              blockId: newBlock.id,
              blockHeight: newBlock.height,
              status: TransactionStatusTypeORM.CONFIRMED,
            },
          );
          this.logger.log(
            `Block ${newBlock.height} (ID: ${newBlock.id}) created and ${confirmedTxIds.length} transactions confirmed.`,
          );

          for (const txId of confirmedTxIds) {
            const txDetails = await queryRunner.manager.findOne(Transaction, {
              where: { id: txId },
              relations: ['fromAccount', 'toAccount'],
            });
            if (txDetails) {
              if (txDetails.fromAccount)
                await this.redisCacheService.del(
                  `balance:${txDetails.fromAccount.systemAddress}`,
                );
              if (txDetails.toAccount)
                await this.redisCacheService.del(
                  `balance:${txDetails.toAccount.systemAddress}`,
                );
            }
          }
        }
        await queryRunner.commitTransaction();
        this.lastBlockCreatedAt = Date.now();
      } catch (blockError: any) {
        await queryRunner.rollbackTransaction();
        this.logger.error(
          'Failed to create block or confirm transactions. Transaction rolled back. Processed transactions remain in PROCESSING state.',
          blockError.stack,
          undefined,
          { blockError },
        );

        for (const txData of successfullyExecutedTxData) {
          await this.redisCacheService.lpush(this.mempoolName, txData.id);
        }
      } finally {
        await queryRunner.release();
      }
    } else if (successfullyExecutedTxData.length > 0) {
      this.logger.log(
        `${successfullyExecutedTxData.length} transactions processed (status: PROCESSING), but conditions for block creation not met.`,
      );
    }
    this.logger.debug('Mempool processing cycle finished.');
  }

  private async executeSingleTransaction(
    txId: string,
  ): Promise<Transaction | null> {
    this.logger.log(`Attempting to execute transaction ID: ${txId}`);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let transaction = await queryRunner.manager.findOne(Transaction, {
        where: { id: txId },
        relations: ['fromAccount', 'toAccount'],
      });

      if (!transaction) {
        this.logger.warn(
          `Transaction ${txId} not found in DB during execution. Removing from processing consideration.`,
        );
        await queryRunner.commitTransaction();
        return null;
      }

      if (transaction.status !== TransactionStatusTypeORM.PENDING) {
        this.logger.warn(
          `Transaction ${txId} is not PENDING (current status: ${transaction.status}). Skipping execution.`,
        );
        await queryRunner.commitTransaction();
        return transaction.status === TransactionStatusTypeORM.PROCESSING
          ? transaction
          : null;
      }

      transaction.status = TransactionStatusTypeORM.PROCESSING;
      await queryRunner.manager.save(Transaction, transaction);

      const sender = transaction.fromAccount;
      const recipient = transaction.toAccount;
      const amount = new Decimal(transaction.amount);

      if (!sender || !recipient) {
        this.logger.error(
          `Transaction ${txId} FAILED: Sender or recipient account entity missing. SenderID: ${transaction.fromAccountId}, RecipientID: ${transaction.toAccountId}`,
        );
        await this.failTransaction(
          queryRunner,
          transaction,
          'Sender or recipient account data missing.',
        );
        return null;
      }
      //I need to figure out this nonce logic. Hopefully Redis FIFO works for now. lol====> TODO
      // if (BigInt(sender.nonce) !== BigInt(transaction.accountNonce)) {
      //   this.logger.error(
      //     `Transaction ${txId} FAILED: Nonce mismatch. Account Nonce: ${sender.nonce}, Tx Nonce: ${transaction.accountNonce}`,
      //   );
      //   await this.failTransaction(
      //     queryRunner,
      //     transaction,
      //     `Nonce mismatch. Expected: ${sender.nonce}, Got: ${transaction.accountNonce}`,
      //   );
      //   await this.revertLockOnAccount(queryRunner, sender, amount);
      //   return null;
      // }

      const senderBalance = new Decimal(sender.balance);
      const senderLocked = new Decimal(sender.locked);

      if (senderLocked.lt(amount)) {
        this.logger.error(
          `Transaction ${txId} FAILED: Inconsistent locked amount. Sender Locked: ${senderLocked.toFixed(8)}, Tx Amount: ${amount.toFixed(8)}.`,
        );
        await this.failTransaction(
          queryRunner,
          transaction,
          'Inconsistent locked amount for sender.',
        );
        return null;
      }
      if (senderBalance.lt(amount)) {
        this.logger.error(
          `Transaction ${txId} FAILED: Insufficient total balance. Sender Balance: ${senderBalance.toFixed(8)}, Tx Amount: ${amount.toFixed(8)}.`,
        );
        await this.failTransaction(
          queryRunner,
          transaction,
          'Insufficient total balance.',
        );
        await this.revertLockOnAccount(queryRunner, sender, amount);
        return null;
      }

      sender.balance = senderBalance.minus(amount).toNumber();
      sender.locked = senderLocked.minus(amount).toNumber();
      await queryRunner.manager.save(Account, sender);

      recipient.balance = new Decimal(recipient.balance)
        .plus(amount)
        .toNumber();
      await queryRunner.manager.save(Account, recipient);

      await queryRunner.commitTransaction();
      this.logger.log(
        `Transaction ${txId} executed successfully, status now PROCESSING. Balances updated.`,
      );
      return transaction;
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `DB transaction failed during execution of TX ${txId}. Rolled back.`,
        error.stack,
        undefined,
        { txId, error },
      );
      await this.markTransactionFailed(
        txId,
        `Execution Error: ${error.message.substring(0, 100)}`,
      );
      const txDataForUnlock = await this.transactionRepository.findOne({
        where: { id: txId },
        relations: ['fromAccount'],
      });
      if (txDataForUnlock && txDataForUnlock.fromAccount) {
        await this.revertLockOnAccount(
          this.dataSource,
          txDataForUnlock.fromAccount,
          new Decimal(txDataForUnlock.amount),
        );
      }
      await this.moveToDLQ(txId);
      return null;
    } finally {
      await queryRunner.release();
    }
  }

  private async failTransaction(
    queryRunner: import('typeorm').QueryRunner,
    transaction: Transaction,
    reason: string,
  ): Promise<void> {
    transaction.status = TransactionStatusTypeORM.FAILED;
    transaction.description =
      `${transaction.description || ''} | ProcessorFailure: ${reason}`.substring(
        0,
        255,
      );
    await queryRunner.manager.save(Transaction, transaction);
    this.logger.warn(
      `Transaction ${transaction.id} marked as FAILED. Reason: ${reason}`,
    );
  }

  private async markTransactionFailed(
    txId: string,
    reason: string,
  ): Promise<void> {
    try {
      const tx = await this.transactionRepository.findOneBy({ id: txId });
      if (tx) {
        tx.status = TransactionStatusTypeORM.FAILED;
        tx.description =
          `${tx.description || ''} | ProcessorFailure: ${reason}`.substring(
            0,
            255,
          );
        await this.transactionRepository.save(tx);
        this.logger.warn(
          `Transaction ${txId} marked as FAILED outside main execution tx. Reason: ${reason}`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to mark transaction ${txId} as FAILED in fallback.`,
        error.stack,
        undefined,
        { txId, error },
      );
    }
  }

  private async moveToDLQ(txId: string): Promise<void> {
    try {
      await this.redisCacheService.lpush(this.dlqName, txId);
      this.logger.warn(
        `Transaction ${txId} moved to Dead Letter Queue: ${this.dlqName}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to move transaction ${txId} to DLQ.`,
        error.stack,
        undefined,
        { txId, error },
      );
    }
  }

  private async revertLockOnAccount(
    dataSourceOrRunner: DataSource | import('typeorm').QueryRunner,
    account: Pick<Account, 'id' | 'systemAddress' | 'locked'>,
    amountToRevert: Decimal,
  ): Promise<void> {
    const manager =
      dataSourceOrRunner instanceof DataSource
        ? dataSourceOrRunner.manager
        : dataSourceOrRunner.manager;
    try {
      const currentAccountState = await manager.findOne(Account, {
        where: { id: account.id },
      });
      if (!currentAccountState) {
        this.logger.warn(
          `Account ${account.id} not found during lock reversion attempt.`,
        );
        return;
      }
      const currentLocked = new Decimal(currentAccountState.locked);
      const newLocked = currentLocked.minus(amountToRevert);

      currentAccountState.locked = newLocked.isNegative()
        ? 0
        : newLocked.toNumber();

      await manager.update(Account, account.id, {
        locked: currentAccountState.locked,
      });
      this.logger.log(
        `Reverted lock of ${amountToRevert.toFixed(8)} for account ${account.systemAddress} (ID: ${account.id}). New locked: ${currentAccountState.locked}`,
      );
    } catch (revertError: any) {
      this.logger.error(
        `Failed to revert lock for account ${account.systemAddress} (ID: ${account.id}) by ${amountToRevert.toFixed(8)}.`,
        revertError.stack,
        undefined,
        { revertError },
      );
    }
  }
}
