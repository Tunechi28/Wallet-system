import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisCacheClient } from './redis-cache.client';
import Redis, { RedisKey } from 'ioredis';
import { LoggerService } from '../logger';

@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
  private client!: RedisCacheClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly appLogger: LoggerService,
  ) {
    this.appLogger.setContext(RedisCacheService.name);
  }

  onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.appLogger.error(
        'REDIS_URL is not configured. RedisCacheService will not work.',
      );
      throw new Error('REDIS_URL is not configured.');
    }
    const clientLogger = new LoggerService(this.configService);
    clientLogger.setContext('RedisCacheInternalClient');

    this.client = new RedisCacheClient(redisUrl, clientLogger);
    this.appLogger.log('RedisCacheService initialized.');
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.disconnect();
      this.appLogger.log('RedisCacheService destroyed, client disconnected.');
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client)
      throw new Error('RedisCacheService not initialized properly.');
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (!this.client)
      throw new Error('RedisCacheService not initialized properly.');
    return this.client.set(key, value, ttlSeconds);
  }

  async del(keyOrKeys: RedisKey | RedisKey[]): Promise<boolean> {
    if (!this.client)
      throw new Error('RedisCacheService not initialized properly.');
    return this.client.del(keyOrKeys);
  }

  async lpush(queueName: RedisKey, values: string | string[]): Promise<number> {
    if (!this.client)
      throw new Error('RedisCacheService not initialized properly.');
    return this.client.lpush(queueName, values);
  }

  async rpop(queueName: RedisKey): Promise<string | null> {
    if (!this.client)
      throw new Error('RedisCacheService not initialized properly.');
    return this.client.rpop(queueName);
  }

  async rateLimit(
    keyPrefix: string,
    identifier: string,
    limit: number,
    windowMs: number,
  ): Promise<{ allowed: boolean; remaining: number; retryAfterMs?: number }> {
    if (!this.client) throw new Error('RedisCacheService not initialized');
    return this.client.rateLimit(keyPrefix, identifier, limit, windowMs);
  }

  getUnderlyingClient(): Redis {
    if (!this.client)
      throw new Error('RedisCacheService not initialized properly.');
    return this.client.getClient();
  }
}
