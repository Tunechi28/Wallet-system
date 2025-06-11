import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TransactionQueueService } from './transaction-queue.service';
import { RedisCacheModule } from '../cache/redis-cache.module';
import { LoggerModule } from '../logger';

@Global()
@Module({
  imports: [ConfigModule, RedisCacheModule, LoggerModule],
  providers: [TransactionQueueService],
  exports: [TransactionQueueService],
})
export class TransactionQueueModule {}
