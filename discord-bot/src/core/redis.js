const Redis = require("ioredis");

let redisClient = null;
let redisAvailable = false;

function connectRedis() {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    console.log("Redis not configured (REDIS_URL not set). Using in-memory fallback.");
    return null;
  }

  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 5) {
        console.warn("Redis retry limit reached. Falling back to in-memory.");
        return null;
      }
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
  });

  client.on("connect", () => {
    redisAvailable = true;
    console.log("Redis connected.");
  });

  client.on("error", (error) => {
    console.warn("Redis error:", error.message || error);
  });

  client.on("close", () => {
    redisAvailable = false;
  });

  client.connect().catch((error) => {
    console.warn("Redis connection failed:", error.message || error);
    redisAvailable = false;
  });

  redisClient = client;
  return client;
}

function getRedis() {
  return redisClient;
}

function isRedisAvailable() {
  return redisAvailable && redisClient !== null;
}

async function acquireLock(key, ttlMs = 15000) {
  if (!isRedisAvailable()) {
    return null;
  }
  const lockKey = `lock:${key}`;
  const result = await redisClient.set(lockKey, "1", "PX", ttlMs, "NX");
  return result === "OK" ? lockKey : null;
}

async function releaseLock(lockKey) {
  if (!isRedisAvailable() || !lockKey) {
    return;
  }
  await redisClient.del(lockKey).catch(() => null);
}

async function disconnectRedis() {
  if (redisClient) {
    await redisClient.quit().catch(() => null);
    redisClient = null;
    redisAvailable = false;
  }
}

module.exports = { connectRedis, getRedis, isRedisAvailable, acquireLock, releaseLock, disconnectRedis };
