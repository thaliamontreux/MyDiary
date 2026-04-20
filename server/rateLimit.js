import { createClient } from 'redis';

let redisClient = null;
let redisReady = false;
let redisInitPromise = null;

function memoryRateLimiter({ windowMs, maxRequests }) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of hits.entries()) {
      if (value.resetAt <= now) hits.delete(key);
    }
  }, Math.max(1000, Math.floor(windowMs / 2))).unref();

  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const current = hits.get(ip);

    if (!current || current.resetAt <= now) {
      hits.set(ip, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (current.count >= maxRequests) {
      res.status(429).json({ error: 'Too many requests, please try again soon.' });
      return;
    }

    current.count += 1;
    next();
  };
}

async function ensureRedis() {
  if (!process.env.REDIS_URL) return null;
  if (redisReady && redisClient) return redisClient;
  if (redisInitPromise) return redisInitPromise;

  redisInitPromise = (async () => {
    try {
      const client = createClient({
        url: process.env.REDIS_URL,
        socket: {
          connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 5000)
        }
      });

      client.on('error', () => {
        redisReady = false;
      });

      await client.connect();
      redisClient = client;
      redisReady = true;
      return client;
    } catch {
      redisClient = null;
      redisReady = false;
      return null;
    } finally {
      redisInitPromise = null;
    }
  })();

  return redisInitPromise;
}

function redisRateLimiter({ windowMs, maxRequests, prefix }) {
  return async (req, res, next) => {
    const client = await ensureRedis();
    if (!client) {
      next();
      return;
    }

    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${prefix}:${ip}`;
    const ttlSec = Math.max(1, Math.ceil(windowMs / 1000));

    try {
      const count = await client.incr(key);
      if (count === 1) {
        await client.expire(key, ttlSec);
      }

      if (count > maxRequests) {
        res.status(429).json({ error: 'Too many requests, please try again soon.' });
        return;
      }

      next();
    } catch {
      next();
    }
  };
}

export function createRateLimiter({ windowMs, maxRequests, prefix }) {
  const memory = memoryRateLimiter({ windowMs, maxRequests });
  const redis = redisRateLimiter({ windowMs, maxRequests, prefix });

  return async (req, res, next) => {
    if (!process.env.REDIS_URL) {
      memory(req, res, next);
      return;
    }

    const client = await ensureRedis();
    if (!client) {
      memory(req, res, next);
      return;
    }

    await redis(req, res, next);
  };
}
