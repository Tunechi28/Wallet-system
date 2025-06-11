import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
  Check,
} from 'typeorm';
import { Wallet } from './wallet.entity';
import { Transaction } from './transaction.entity';
import { BaseEntity } from '@app/common';

@Entity({ name: 'accounts' })
@Index(['walletId', 'currency'], { unique: true })
@Check(`"balance" >= 0`)
@Check(`"locked" >= 0`)
@Check(`"balance" >= "locked"`)
export class Account extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({
    type: 'varchar',
    name: 'system_address',
    unique: true,
    nullable: false,
    comment: 'System-generated unique account ID',
  })
  systemAddress!: string;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 8,
    default: 0.0,
    name: 'balance',
  })
  balance!: number;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 8,
    default: 0.0,
    name: 'locked',
  })
  locked!: number;

  @Column({
    type: 'bigint',
    default: 0,
    name: 'nonce',
    comment: 'Sequential nonce for transactions from this account',
  })
  nonce!: string;

  @Column({ type: 'varchar', length: 10, nullable: false })
  currency!: string;

  @Column({ type: 'uuid', name: 'wallet_id' })
  walletId!: string;

  @ManyToOne(() => Wallet, (wallet) => wallet.accounts, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'wallet_id' })
  wallet!: Wallet;

  @OneToMany(() => Transaction, (transaction) => transaction.fromAccount)
  transactionsFrom!: Transaction[];

  @OneToMany(() => Transaction, (transaction) => transaction.toAccount)
  transactionsTo!: Transaction[];
}
