import * as tls from 'tls';

import { SASLOptions } from 'kafkajs';
import { Authorization } from 'mappersmith';

export declare class KafkaConfig {
  clientId: string;

  brokers: string[];

  ssl: tls.ConnectionOptions | boolean;

  kafkaSASL: SASLOptions | Authorization | null;

  groupId?: string;

  heartbeatInterval?: number;

  sessionTimeout?: number;

  kafkaConsumerClientId?: string;
}
