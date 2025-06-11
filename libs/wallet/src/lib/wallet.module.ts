import { Module } from '@nestjs/common';
import { WalletController } from './controllers/wallet.controller';
import { BlockController } from './controllers/block.controller';
import { TransactionController } from './controllers/transaction.controller';
import { WalletService } from './services/wallet.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, Wallet, Transaction, Account, Block } from '@app/persistance';
import {
  KeyVaultModule,
  LoggerModule,
  RedisCacheModule,
  TransactionQueueModule,
  BlockModule
} from '@app/common';
import { AuthModule } from '@app/auth';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, User, Transaction, Account]),
    LoggerModule,
    KeyVaultModule,
    RedisCacheModule,
    TransactionQueueModule,
    BlockModule
  ],
  controllers: [WalletController, BlockController, TransactionController ],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
