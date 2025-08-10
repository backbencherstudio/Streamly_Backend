import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const url =  process.env.REDIS_HOST;

export const connection = new IORedis(url, {
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,

    retryStrategy: times => Math.min(times * 500, 5000),
    enableReadyCheck: true,
    tls: url.startsWith('rediss://') ? {} : undefined,
});

connection.on('connect', () => console.log('[Redis] connected'));
connection.on('error', (e) => console.error('[Redis] error:', e?.message || e));

export const mediaQueue = new Queue('media', { connection });
