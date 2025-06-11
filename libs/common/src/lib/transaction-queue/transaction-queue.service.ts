import { Injectable } from '@nestjs/common';
import { RedisCacheService } from '../cache/redis-cache.service';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../logger';

@Injectable()
export class TransactionQueueService {
  private readonly mempoolName: string;

  constructor(
    private readonly redisCacheService: RedisCacheService,
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
  ) {
    this.logger.setContext(TransactionQueueService.name);
    this.mempoolName = this.configService.get<string>(
      'TX_MEMPOOL_NAME',
      'tx:mempool',
    );
    this.logger.log(`Mempool queue name configured to: ${this.mempoolName}`);
  }

  /**
   * Adds a transaction ID to the mempool (pending queue).
   * This is called by WalletService after a transaction is created in PENDING state.
   * @param transactionId The ID of the transaction to add to the queue.
   */
  async addToMempool(transactionId: string): Promise<void> {
    try {
      const queueLength = await this.redisCacheService.lpush(
        this.mempoolName,
        transactionId,
      );
      this.logger.log(
        `Transaction ${transactionId} added to mempool (queue: ${this.mempoolName}). New length: ${queueLength}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to add transaction ${transactionId} to mempool ${this.mempoolName}.`,
        error.stack,
        undefined,
        { error },
      );
      throw new Error(
        `Failed to submit transaction ${transactionId} to processing queue.`,
      );
    }
  }

  /**
   * Retrieves a specified number of transaction IDs from the mempool.
   * Uses RPOP for FIFO behavior (right-pop from a left-pushed list).
   * @param count The number of transaction IDs to retrieve. Defaults to 1.
   * @returns A promise that resolves to an array of transaction IDs.
   */
  async getFromMempool(count: number = 1): Promise<string[]> {
    const items: string[] = [];
    if (count <= 0) return items;

    try {
      for (let i = 0; i < count; i++) {
        const item = await this.redisCacheService.rpop(this.mempoolName);
        if (item) {
          items.push(item);
        } else {
          break;
        }
      }
      if (items.length > 0) {
        this.logger.debug(
          `Retrieved ${items.length} transaction(s) from mempool ${this.mempoolName}: ${items.join(', ')}`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to retrieve transactions from mempool ${this.mempoolName}.`,
        error.stack,
        undefined,
        { error },
      );
    }
    return items;
  }

  getMempoolName(): string {
    return this.mempoolName;
  }
}
