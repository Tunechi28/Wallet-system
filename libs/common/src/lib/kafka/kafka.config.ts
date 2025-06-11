import { config } from 'dotenv';
import { get } from 'env-var';

import { EnvVar } from '../enums';
import { KafkaConfig } from './kafka.message';

config();

export function getKafkaConfig(): KafkaConfig {
  return {
    clientId: get(EnvVar.KAFKA_CLIENT_ID).required().asString(),
    kafkaConsumerClientId: get(EnvVar.KAFKA_CONSUMER_CLIENT_ID)
      .required()
      .asString(),
    brokers: [get(EnvVar.KAFKA_BOOTSTRAP_SERVER).required().asString()],
    ssl: get(EnvVar.KAFKA_SSL).required().asBool(),
    kafkaSASL: null,
    groupId: get(EnvVar.KAFKA_GROUP_ID).required().asString(),
    heartbeatInterval: get(EnvVar.KAFKA_HEARTBEAT_INTERVAL).required().asInt(),
    sessionTimeout: get(EnvVar.KAFKA_SESSION_TIMEOUT).required().asInt(),
  };
}
