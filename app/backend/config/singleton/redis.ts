import Redis from 'ioredis';
import { logger, env } from 'config';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  redisClient = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy(times: number): number {
      const delay = Math.min(times * 200, 2_000);
      logger.warn('Redis reconnect attempt', { times, delay });
      return delay;
    },
  });

  redisClient.on('connect', () => {
    logger.info('Redis socket connected');
  });

  redisClient.on('ready', () => {
    logger.info('Redis connection ready');
  });

  redisClient.on('error', (error: unknown) => {
    logger.error('Redis error', {
      error: error instanceof Error ? error.message : String(error),
    });
  });

  redisClient.on('close', () => {
    logger.warn('Redis connection closed');
  });

  redisClient.on('reconnecting', () => {
    logger.warn('Redis reconnecting');
  });

  return redisClient;
}

export async function connectRedis(): Promise<void> {
  const client = getRedisClient();

  if (client.status === 'wait') {
    await client.connect();
  }
}

export async function disconnectRedis(): Promise<void> {
  if (!redisClient) {
    return;
  }

  await redisClient.quit();
  redisClient = null;
}
