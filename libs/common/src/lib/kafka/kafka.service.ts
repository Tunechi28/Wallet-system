import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  Kafka,
  Producer,
  SASLOptions,
  Partitioners,
  Message,
  RecordMetadata,
} from 'kafkajs';

import { KafkaConfig } from './kafka.message';

const MAX_RETRIES = 2;

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);

  private kafka: Kafka;

  private producer: Producer;

  constructor(private kafkaConfig: KafkaConfig) {
    this.kafka = new Kafka({
      clientId: this.kafkaConfig.clientId,
      brokers: this.kafkaConfig.brokers,
      ssl: this.kafkaConfig.ssl,
      sasl: this.kafkaConfig.kafkaSASL as SASLOptions,
    });
    this.producer = this.kafka.producer({
      createPartitioner: Partitioners.LegacyPartitioner,
      retry: { retries: 5 },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
  }

  async sendMessages(
    topic: string,
    messages: Message[],
    numOfRetries = 0,
  ): Promise<{
    error?: string;
    message?: RecordMetadata[];
  }> {
    this.logger.log(
      `Attempting to send ${messages.length} messages to topic: ${topic}`,
    );

    try {
      const response = await this.producer.send({
        topic,
        messages,
      });
      this.logger.log(
        `Successfully sent ${messages.length} messages to topic: ${topic}`,
      );
      this.logger.log(`Response from kafka: ${JSON.stringify(response)}`);

      return {
        message: response,
      };
    } catch (error) {
      this.logger.error(`Error sending message to topic: ${topic}`);

      this.logger.error(JSON.stringify(error));

      if (numOfRetries >= MAX_RETRIES) {
        this.logger.error(
          `Maximum number of retries reached for sending to topic: ${topic}`,
        );
        return { error: 'Maximum number of retries reached' };
      }

      this.logger.log('Attempting to reconnect to Kafka');
      await this.producer.connect();
      this.logger.log(
        `Retrying sending message to ${topic} topic after reconnect ${numOfRetries + 1} times`,
      );

      return await this.sendMessages(topic, messages, numOfRetries + 1);
    }
  }
}
