import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { InternalServerErrorException } from '@nestjs/common';

import { BlockService } from './block.service';
import { Block, Transaction } from '@app/persistance';
import { LoggerService } from '@app/common';

describe('BlockService', () => {
  let service: BlockService;
  let blockRepository: Repository<Block>;
  let logger: LoggerService;

  const mockEntityManager = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    getRepository: jest.fn().mockReturnThis(),
  };

  const mockBlock: Block = {
    id: 'block-uuid-1',
    height: '0',
    blockHash: 'block-hash-1',
    previousBlockHash: null,
    timestamp: new Date(),
    merkleRoot: 'merkle-root-1',
    transactions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTransactionData: Pick<Transaction, 'id' | 'systemHash'>[] = [
    { id: 'tx-uuid-1', systemHash: 'tx-hash-1' },
    { id: 'tx-uuid-2', systemHash: 'tx-hash-2' },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlockService,
        {
          provide: getRepositoryToken(Block),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
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
          },
        },
      ],
    }).compile();

    service = module.get<BlockService>(BlockService);
    blockRepository = module.get<Repository<Block>>(getRepositoryToken(Block));
    logger = module.get<LoggerService>(LoggerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getLatestBlock', () => {
    it('should return the latest block from the repository', async () => {
      jest.spyOn(blockRepository, 'findOne').mockResolvedValue(mockBlock);
      const result = await service.getLatestBlock();
      expect(result).toEqual(mockBlock);
      expect(blockRepository.findOne).toHaveBeenCalledWith({ order: { height: 'DESC' } });
    });

    it('should return null if no blocks exist', async () => {
      jest.spyOn(blockRepository, 'findOne').mockResolvedValue(null);
      const result = await service.getLatestBlock();
      expect(result).toBeNull();
    });

    it('should use the entity manager if provided', async () => {
        mockEntityManager.findOne.mockResolvedValue(mockBlock);
        await service.getLatestBlock(mockEntityManager as unknown as EntityManager);
        expect(mockEntityManager.getRepository).toHaveBeenCalledWith(Block);
        expect(mockEntityManager.findOne).toHaveBeenCalledWith({ order: { height: 'DESC' } });
        expect(blockRepository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('createBlockWithTypeORM', () => {
    beforeEach(() => {
        mockEntityManager.create.mockImplementation((_entityType, data) => data as Block);
        mockEntityManager.save.mockImplementation((_entityType, entity) => Promise.resolve(entity as Block));
    });

    it('should create a genesis block (height 0) if no previous block exists', async () => {
      mockEntityManager.findOne.mockResolvedValue(null);

      const newBlock = await service.createBlockWithTypeORM(mockTransactionData, mockEntityManager as unknown as EntityManager);
      
      expect(mockEntityManager.findOne).toHaveBeenCalledWith(Block, { order: { height: 'DESC' } });
      expect(mockEntityManager.create).toHaveBeenCalled();
      expect(mockEntityManager.save).toHaveBeenCalled();
      expect(newBlock.height).toBe('0');
      expect(newBlock.previousBlockHash).toBeNull();
    });

    it('should create a subsequent block with incremented height and previous hash', async () => {
        const latestBlock = { ...mockBlock, height: '41', blockHash: 'previous-block-hash' };
        mockEntityManager.findOne.mockResolvedValue(latestBlock);

        const newBlock = await service.createBlockWithTypeORM(mockTransactionData, mockEntityManager as unknown as EntityManager);

        expect(newBlock.height).toBe('42');
        expect(newBlock.previousBlockHash).toBe('previous-block-hash');
    });

    it('should throw InternalServerErrorException if transaction list is empty', async () => {
        await expect(service.createBlockWithTypeORM([], mockEntityManager as unknown as EntityManager)).rejects.toThrow(InternalServerErrorException);
    });

    it('should correctly calculate merkleRoot and blockHash', async () => {
        mockEntityManager.findOne.mockResolvedValue(null);

        const newBlock = await service.createBlockWithTypeORM(mockTransactionData, mockEntityManager as unknown as EntityManager);

        expect(newBlock.blockHash).toBeDefined();
        expect(newBlock.blockHash.length).toBe(64);
        expect(newBlock.merkleRoot).toBeDefined();
        expect(newBlock.merkleRoot?.length).toBe(64);
    });
  });

  describe('getBlockByHeight', () => {
    it('should find a block by its height', async () => {
        jest.spyOn(blockRepository, 'findOne').mockResolvedValue(mockBlock);
        const result = await service.getBlockByHeight(BigInt(0));
        expect(result).toEqual(mockBlock);
        expect(blockRepository.findOne).toHaveBeenCalledWith({ where: { height: '0' }, relations: ['transactions'] });
    });

    it('should return null if block with height is not found', async () => {
        jest.spyOn(blockRepository, 'findOne').mockResolvedValue(null);
        const result = await service.getBlockByHeight(BigInt(999));
        expect(result).toBeNull();
    });
  });

  describe('getBlockByHash', () => {
    it('should find a block by its hash', async () => {
        jest.spyOn(blockRepository, 'findOne').mockResolvedValue(mockBlock);
        const result = await service.getBlockByHash('block-hash-1');
        expect(result).toEqual(mockBlock);
        expect(blockRepository.findOne).toHaveBeenCalledWith({ where: { blockHash: 'block-hash-1' }, relations: ['transactions'] });
    });
  });

  describe('getTransactionsInBlock', () => {
    it('should return transactions for a given block ID', async () => {
        const blockWithTxs = { ...mockBlock, transactions: mockTransactionData as Transaction[] };
        jest.spyOn(blockRepository, 'findOne').mockResolvedValue(blockWithTxs);
        const result = await service.getTransactionsInBlock('block-uuid-1');
        expect(result).toHaveLength(2);
        expect(result[0].systemHash).toBe('tx-hash-1');
    });

    it('should return an empty array if the block is not found', async () => {
        jest.spyOn(blockRepository, 'findOne').mockResolvedValue(null);
        const result = await service.getTransactionsInBlock('non-existent-id');
        expect(result).toEqual([]);
    });
  });

  describe('private methods', () => {
    it('calculateMerkleRoot should handle an odd number of hashes', () => {
        const oddHashes = ['a', 'b', 'c'];
        const merkleRoot = (service as any).calculateMerkleRoot(oddHashes);
        expect(merkleRoot).toBeDefined();
        expect(merkleRoot.length).toBe(64);
    });

    it('calculateMerkleRoot should handle an empty array of hashes', () => {
        const emptyHashes: string[] = [];
        const merkleRoot = (service as any).calculateMerkleRoot(emptyHashes);
        expect(merkleRoot).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
  });
});
