import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { TransactionProcessorService } from './transaction-processor.service';
import { Transaction, Account, Block } from '@app/persistance';
import { LoggerModule, RedisCacheModule, TransactionQueueModule, BlockModule} from '@app/common';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      Transaction,
      Account,
      Block,
    ]),
    LoggerModule,
    RedisCacheModule,
    TransactionQueueModule,
    BlockModule
  ],
  providers: [
    TransactionProcessorService,
  ],
  exports: [TransactionProcessorService],
})
export class ProcessorModule {}
