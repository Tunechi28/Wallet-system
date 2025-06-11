import Redis, { RedisKey } from 'ioredis';
import { LoggerService } from '../logger';

export class RedisCacheClient {
  private client: Redis;
  private logger: LoggerService;

  constructor(url: string, logger: LoggerService) {
    this.logger = logger;
    this.logger.setContext(RedisCacheClient.name);
    this.client = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times) => {
        const delay = Math.min(times * 100, 2000);
        this.logger.warn(
          `Retrying Redis connection (attempt ${times}), delaying ${delay}ms`,
        );
        return delay;
      },
    });

    this.client.on('connect', () => this.logger.log('Connected to Redis.'));
    this.client.on('ready', () => this.logger.log('Redis client ready.'));
    this.client.on('error', (err) =>
      this.logger.error('Redis error.', err.stack, undefined, {
        error: err.message,
      }),
    );
    this.client.on('reconnecting', () =>
      this.logger.warn('Reconnecting to Redis...'),
    );
    this.client.on('end', () => this.logger.warn('Redis connection closed.'));
  }

  async get(key: string): Promise<string | null> {
    const start = Date.now();
    try {
      const value = await this.client.get(key);
      this.logger.debug(
        `GET ${key} (${Date.now() - start}ms) ${value ? 'HIT' : 'MISS'}`,
      );
      return value;
    } catch (err: any) {
      this.logger.error(`GET ${key} failed.`, err.stack, undefined, {
        error: err.message,
        key,
      });
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    const start = Date.now();
    try {
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.setex(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
      this.logger.debug(
        `SET ${key} (${Date.now() - start}ms) ${ttlSeconds ? `TTL: ${ttlSeconds}s` : ''}`,
      );
      return true;
    } catch (err: any) {
      this.logger.error(`SET ${key} failed.`, err.stack, undefined, {
        error: err.message,
        key,
      });
      return false;
    }
  }

  async del(keyOrKeys: RedisKey | RedisKey[]): Promise<boolean> {
    const start = Date.now();
    try {
      let result: number;
      if (Array.isArray(keyOrKeys)) {
        if (keyOrKeys.length === 0) return true;
        result = await this.client.del(...keyOrKeys);
      } else {
        result = await this.client.del(keyOrKeys);
      }
      this.logger.debug(
        `DEL ${Array.isArray(keyOrKeys) ? keyOrKeys.join(', ') : keyOrKeys} (${Date.now() - start}ms) - Keys deleted: ${result}`,
      );
      return result > 0;
    } catch (err: any) {
      this.logger.error(
        `DEL ${Array.isArray(keyOrKeys) ? keyOrKeys.join(', ') : keyOrKeys} failed.`,
        err.stack,
        undefined,
        { error: err.message, key: keyOrKeys },
      );
      return false;
    }
  }

  async rateLimit(
    keyPrefix: string,
    identifier: string,
    limit: number,
    windowMs: number,
  ): Promise<{ allowed: boolean; remaining: number; retryAfterMs?: number }> {
    const key = `rate_limit:${keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - windowMs;
    const windowSeconds = Math.ceil(windowMs / 1000);

    const pipeline = this.client.pipeline();
    pipeline.zremrangebyscore(key, 0, (windowStart - 1).toString());
    pipeline.zadd(key, now.toString(), now.toString());
    pipeline.zcard(key);
    pipeline.expire(key, windowSeconds + 1);

    const results = await pipeline.exec();

    if (!results) {
      this.logger.error(
        'Rate limit pipeline failed to execute.',
        undefined,
        undefined,
        { key },
      );
      return { allowed: true, remaining: limit };
    }

    let count = 0;
    if (
      results[2] &&
      results[2][0] === null &&
      typeof results[2][1] === 'number'
    ) {
      count = results[2][1];
    } else {
      this.logger.error(
        'Rate limit ZCARD result was unexpected.',
        undefined,
        undefined,
        { key, zcardResult: results[2] },
      );
      return { allowed: true, remaining: limit };
    }

    const allowed = count <= limit;
    const remaining = Math.max(0, limit - count);

    if (!allowed) {
      const oldestRequestInWindow = await this.client.zrange(
        key,
        0,
        0,
        'WITHSCORES',
      );
      let retryAfterMs = windowMs;
      if (oldestRequestInWindow && oldestRequestInWindow.length > 1) {
        const oldestTimestamp = parseInt(oldestRequestInWindow[1], 10);
        retryAfterMs = Math.max(0, oldestTimestamp + windowMs - now);
      }
      this.logger.warn(`Rate limit EXCEEDED for ${key}`, undefined, undefined, {
        limit,
        count,
        identifier,
      });
      return { allowed: false, remaining: 0, retryAfterMs };
    }
    this.logger.debug(
      `Rate limit check for ${key}: allowed=${allowed}, remaining=${remaining}, count=${count}`,
    );
    return { allowed: true, remaining };
  }

  async lpush(key: RedisKey, values: string | string[]): Promise<number> {
    if (Array.isArray(values)) {
      if (values.length === 0) return this.client.llen(key);
      return this.client.lpush(key, ...values);
    }
    return this.client.lpush(key, values);
  }

  async rpop(key: RedisKey): Promise<string | null> {
    return this.client.rpop(key);
  }

  async lrange(key: RedisKey, start: number, stop: number): Promise<string[]> {
    return this.client.lrange(key, start, stop);
  }

  async lrem(key: RedisKey, count: number, value: string): Promise<number> {
    return this.client.lrem(key, count, value);
  }

  getClient(): Redis {
    return this.client;
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
    this.logger.log('Redis client disconnected.');
  }
}
