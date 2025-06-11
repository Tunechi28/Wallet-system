import { Module } from '@nestjs/common';
import {
  getKafkaConfig,
  KafkaModule,
  DatabaseModule,
  CoreModule,
  appConfig,
} from '@app/common';
import { PersistanceModule } from '@app/persistance';
import { WalletModule } from '@app/wallet';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '@app/auth';

const kafkaConfig = getKafkaConfig();

@Module({
  imports: [
    CoreModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [appConfig],
    }),
    KafkaModule.register(kafkaConfig),
    DatabaseModule.forRoot([]),
    PersistanceModule,
    WalletModule,
    AuthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
