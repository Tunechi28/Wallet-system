import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { BlockService } from './block.service';
import { LoggerModule } from '@app/common';
import { Block } from '../../../../persistance/src/lib/entities/block.entity';
import { Transaction } from '../../../../persistance/src/lib/entities/transaction.entity';

@Global()
@Module({
  imports: [ConfigModule, LoggerModule, TypeOrmModule.forFeature([Block, Transaction])],
  providers: [BlockService],
  exports: [BlockService],
})
export class BlockModule {}
