import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  Index,
} from 'typeorm';
import { Wallet } from './wallet.entity';
import { BaseEntity } from '@app/common';

@Entity({ name: 'users' })
export class User extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', unique: true, nullable: false })
  email!: string;

  @Column({ type: 'text', nullable: false, name: 'password_hash' })
  passwordHash!: string;

  @OneToOne(() => Wallet, (wallet) => wallet.user, { cascade: true })
  wallet!: Wallet;
}
