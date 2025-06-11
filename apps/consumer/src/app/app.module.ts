import { Module } from '@nestjs/common';
import { EmailNotificationController } from './controller/email.controller';
import { EmailModule, getEmailConfig } from '@app/common';
import { ProcessorModule } from './transaction-processor/transaction-processor.module';
import { Transaction, Account, Block, Wallet, User } from '@app/persistance';
import { BlockModule } from '@app/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KafkaModule, DatabaseModule, appConfig } from '@app/common';

import { ConfigModule } from '@nestjs/config';

const emailConfig = getEmailConfig();

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, Transaction, Account, Block, User]),
    EmailModule.register(emailConfig),
    ProcessorModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [appConfig],
    }),
    DatabaseModule.forRoot([]),
    BlockModule,
    KafkaModule,
  ],
  controllers: [EmailNotificationController],
  providers: [],
})
export class AppModule {}
