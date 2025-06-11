import { Producer, SASLOptions, Message, RecordMetadata } from 'kafkajs';
import { KafkaConfig } from './kafka.message';
import { KafkaService } from './kafka.service';

jest.mock('kafkajs', () => {
  return {
    Kafka: jest.fn().mockImplementation(() => ({
      producer: jest.fn().mockImplementation(() => ({
        connect: jest.fn(),
        disconnect: jest.fn(),
        send: jest.fn(),
      })),
    })),
    Partitioners: { LegacyPartitioner: jest.fn() },
  };
});

describe('KafkaService', () => {
  let kafkaService: KafkaService;
  let kafkaConfig: KafkaConfig;
  let mockProducer: jest.Mocked<Producer>;

  beforeEach(() => {
    kafkaConfig = {
      clientId: 'test-client',
      brokers: ['localhost:9092'],
      ssl: false,
      kafkaSASL: {} as SASLOptions,
    };

    kafkaService = new KafkaService(kafkaConfig);
    mockProducer = (kafkaService as any).producer as jest.Mocked<Producer>;
  });

  it('should connect the producer on module init', async () => {
    await kafkaService.onModuleInit();
    expect(mockProducer.connect).toHaveBeenCalled();
  });

  it('should disconnect the producer on module destroy', async () => {
    await kafkaService.onModuleDestroy();
    expect(mockProducer.disconnect).toHaveBeenCalled();
  });

  it('should send messages successfully', async () => {
    const topic = 'test-topic';
    const messages: Message[] = [{ key: 'key1', value: 'value1' }];
    const recordMetadata: RecordMetadata[] = [
      {
        topicName: topic,
        partition: 0,
        baseOffset: '0',
        logAppendTime: '0',
        errorCode: 0,
      },
    ];

    mockProducer.send.mockResolvedValue(recordMetadata);

    const result = await kafkaService.sendMessages(topic, messages);

    expect(mockProducer.send).toHaveBeenCalledWith({ topic, messages });
    expect(result).toEqual({ message: recordMetadata });
  });

  it('should retry sending messages when an error occurs', async () => {
    const topic = 'test-topic';
    const messages: Message[] = [{ key: 'key1', value: 'value1' }];
    const error = new Error('Kafka send error');

    mockProducer.send.mockRejectedValueOnce(error);
    await kafkaService.sendMessages(topic, messages);

    expect(mockProducer.send).toHaveBeenCalledTimes(2);
    expect(mockProducer.connect).toHaveBeenCalled();
  });

  it('should return an error after max retries', async () => {
    const topic = 'test-topic';
    const messages: Message[] = [{ key: 'key1', value: 'value1' }];
    const error = new Error('Kafka send error');

    mockProducer.send.mockRejectedValue(error);

    const result = await kafkaService.sendMessages(topic, messages, 2);

    expect(mockProducer.send).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ error: 'Maximum number of retries reached' });
  });
});
