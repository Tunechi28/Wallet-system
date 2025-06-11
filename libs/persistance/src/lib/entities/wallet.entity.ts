import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { BaseEntity } from '@app/common';
import { Account } from './account.entity';

@Entity({ name: 'wallets' })
export class Wallet extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'uuid', name: 'user_id', unique: true })
  userId!: string;

  @OneToOne(() => User, (user) => user.wallet, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'text', name: 'encrypted_system_mnemonic', nullable: false })
  encryptedSystemMnemonic!: string;

  @Column({ type: 'varchar', name: 'key_vault_key_id', nullable: false })
  keyVaultKeyId!: string;

  @Column({ type: 'varchar', length: 32, nullable: false })
  salt!: string;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @OneToMany(() => Account, (account) => account.wallet, { cascade: true })
  accounts!: Account[];
}
