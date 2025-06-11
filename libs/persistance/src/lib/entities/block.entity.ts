import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  Index,
} from 'typeorm';
import { Transaction } from './transaction.entity';
import { BaseEntity } from '@app/common';

@Entity({ name: 'blocks' })
export class Block extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'bigint', name: 'height', unique: true })
  height!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, name: 'block_hash', unique: true })
  blockHash!: string;

  @Index()
  @Column({
    type: 'varchar',
    length: 64,
    name: 'previous_block_hash',
    nullable: true,
  })
  previousBlockHash!: string | null;

  @Column({
    type: 'timestamp with time zone',
    name: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  timestamp!: Date;

  @Column({ type: 'varchar', length: 64, name: 'merkle_root', nullable: true })
  merkleRoot!: string | null;

  @OneToMany(() => Transaction, (transaction) => transaction.block, {
    cascade: ['insert', 'update'],
  })
  transactions!: Transaction[];
}
