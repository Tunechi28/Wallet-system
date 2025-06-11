import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  Check,
} from 'typeorm';
import { Account } from './account.entity';
import { Block } from './block.entity';
import { BaseEntity } from '@app/common';

export enum TransactionStatusTypeORM {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum TransactionTypeTypeORM {
  TRANSFER = 'TRANSFER',
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  FEE = 'FEE',
  ADJUSTMENT = 'ADJUSTMENT',
  GENESIS = 'GENESIS',
}

@Entity({ name: 'transactions' })
@Check(`"amount" > 0`)
export class Transaction extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({
    type: 'varchar',
    name: 'system_hash',
    unique: true,
    nullable: false,
  })
  systemHash!: string;

  @Column({ type: 'uuid', name: 'from_account_id' })
  fromAccountId!: string;

  @ManyToOne(() => Account, (account) => account.transactionsFrom, {
    onDelete: 'RESTRICT',
    nullable: false,
  })
  @JoinColumn({ name: 'from_account_id' })
  fromAccount!: Account;

  @Column({ type: 'uuid', name: 'to_account_id' })
  toAccountId!: string;

  @ManyToOne(() => Account, (account) => account.transactionsTo, {
    onDelete: 'RESTRICT',
    nullable: false,
  })
  @JoinColumn({ name: 'to_account_id' })
  toAccount!: Account;

  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: false })
  amount!: number;

  @Column({ type: 'decimal', precision: 18, scale: 8, default: 0.0 })
  fee!: number;

  @Column({ type: 'varchar', length: 10, nullable: false })
  currency!: string;

  @Column({
    type: 'enum',
    enum: TransactionStatusTypeORM,
    default: TransactionStatusTypeORM.PENDING,
    name: 'status',
  })
  status!: TransactionStatusTypeORM;

  @Column({
    type: 'bigint',
    name: 'account_nonce',
    comment: "Nonce of the 'fromAccount' for this transaction",
  })
  accountNonce!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @Column({
    type: 'enum',
    enum: TransactionTypeTypeORM,
    default: TransactionTypeTypeORM.TRANSFER,
    name: 'type',
  })
  type!: TransactionTypeTypeORM;

  @Index()
  @Column({ type: 'uuid', name: 'block_id', nullable: true })
  blockId!: string | null;

  @ManyToOne(() => Block, (block) => block.transactions, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'block_id' })
  block!: Block | null;

  @Index()
  @Column({ type: 'bigint', name: 'block_height', nullable: true })
  blockHeight!: string | null;
}
