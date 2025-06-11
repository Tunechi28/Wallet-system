import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { getKafkaConfig } from '@app/common';
import { SASLOptions } from '@nestjs/microservices/external/kafka.interface';
const kafkaConfig = getKafkaConfig();
async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId: kafkaConfig.clientId,
          brokers: kafkaConfig.brokers,
          ssl: kafkaConfig.ssl,
          sasl: <SASLOptions>kafkaConfig.kafkaSASL,
        },
        consumer: {
          groupId: kafkaConfig.groupId,
          heartbeatInterval: 60000,
          sessionTimeout: 400000,
        },
        run: {
          partitionsConsumedConcurrently: 3,
          autoCommitInterval: 20000,
        },
      },
    },
  );

  await app.listen();
}

bootstrap();
