import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { createHash } from 'crypto';
import { Transaction } from '../../../../persistance/src/lib/entities/transaction.entity';
import { LoggerService } from '@app/common';
import { Block } from '../../../../persistance/src/lib/entities/block.entity';

@Injectable()
export class BlockService {
  constructor(
    @InjectRepository(Block)
    private readonly blockRepository: Repository<Block>,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(BlockService.name);
  }

  private calculateBlockHash(
    height: string,
    timestamp: Date,
    previousBlockHash: string | null,
    transactionSystemHashes: string[],
  ): string {
    const data =
      height +
      timestamp.toISOString() +
      (previousBlockHash || 'GENESIS_BLOCK_PREV_HASH_0000000000000') +
      transactionSystemHashes.sort().join('');
    return createHash('sha256').update(data).digest('hex');
  }

  private calculateMerkleRoot(transactionSystemHashes: string[]): string {
    if (transactionSystemHashes.length === 0) {
      return createHash('sha256').update('').digest('hex');
    }
    if (transactionSystemHashes.length === 1) {
      return createHash('sha256')
        .update(transactionSystemHashes[0])
        .digest('hex');
    }
    let currentLevel = [...transactionSystemHashes.sort()];
    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
        const combinedData = left + right;
        const combinedHash = createHash('sha256')
          .update(combinedData)
          .digest('hex');
        nextLevel.push(combinedHash);
      }
      currentLevel = nextLevel;
    }
    return currentLevel[0];
  }

  async getLatestBlock(manager?: EntityManager): Promise<Block | null> {
    this.logger.debug('Fetching the latest block.');
    const repository = manager
      ? manager.getRepository(Block)
      : this.blockRepository;
    const blocks = await repository.find({
  order: { height: 'DESC' },
  take: 1,
});
return blocks.length > 0 ? blocks[0] : null;
  }

  async createBlockWithTypeORM(
    processedTransactions: Pick<Transaction, 'id' | 'systemHash'>[],
    manager: EntityManager,
  ): Promise<Block> {
    if (processedTransactions.length === 0) {
      this.logger.warn('Attempted to create an empty block.');
      throw new InternalServerErrorException('Cannot create an empty block.');
    }
    this.logger.log(
      `Creating a new block with ${processedTransactions.length} transactions using provided EntityManager.`,
    );

    const latestBlock = await this.getLatestBlock(manager);

    const previousBlockHash = latestBlock ? latestBlock.blockHash : null;
    const newHeightBigInt = latestBlock
      ? BigInt(latestBlock.height) + BigInt(1)
      : BigInt(0);
    const newHeightStr = newHeightBigInt.toString();
    const timestamp = new Date();

    const transactionSystemHashes = processedTransactions.map(
      (tx) => tx.systemHash,
    );
    const blockHash = this.calculateBlockHash(
      newHeightStr,
      timestamp,
      previousBlockHash,
      transactionSystemHashes,
    );
    const merkleRoot = this.calculateMerkleRoot(transactionSystemHashes);

    this.logger.debug(
      `New block details - Height: ${newHeightStr}, PrevHash: ${previousBlockHash || 'GENESIS'}, Hash: ${blockHash}`,
    );

    const newBlockEntity = manager.create(Block, {
      height: newHeightStr,
      blockHash,
      previousBlockHash,
      timestamp,
      merkleRoot,
    });
    const savedBlock = await manager.save(Block, newBlockEntity);
    this.logger.log(
      `Block ${savedBlock.id} (Height: ${savedBlock.height}) created successfully with hash ${savedBlock.blockHash}.`,
    );
    return savedBlock;
  }

  async getBlockByHeight(
    height: bigint,
    manager?: EntityManager,
  ): Promise<Block | null> {
    const heightStr = height.toString();
    this.logger.debug(`Fetching block by height: ${heightStr}`);
    const repository = manager
      ? manager.getRepository(Block)
      : this.blockRepository;
    return repository.findOne({
      where: { height: heightStr },
      relations: ['transactions'],
    });
  }

  async getBlockByHash(
    blockHash: string,
    manager?: EntityManager,
  ): Promise<Block | null> {
    this.logger.debug(`Fetching block by hash: ${blockHash}`);
    const repository = manager
      ? manager.getRepository(Block)
      : this.blockRepository;
    return repository.findOne({
      where: { blockHash },
      relations: ['transactions'],
    });
  }
  async getTransactionsInBlock(
    blockIdOrHash: string,
    manager?: EntityManager,
  ): Promise<Transaction[]> {
    this.logger.debug(
      `Fetching transactions for block (ID/Hash): ${blockIdOrHash}`,
    );
    const repository = manager
      ? manager.getRepository(Block)
      : this.blockRepository;
    const block = await repository.findOne({
      where: [{ id: blockIdOrHash }, { blockHash: blockIdOrHash }],
      relations: [
        'transactions',
        'transactions.fromAccount',
        'transactions.toAccount',
      ],
      order: { transactions: { createdAt: 'ASC' } },
    });
    if (!block) {
      this.logger.warn(
        `Block not found when fetching transactions: ${blockIdOrHash}`,
      );
      return [];
    }
    return block.transactions;
  }
}
