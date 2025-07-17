// server/utils/redis.ts
import type { RedisClientType } from 'redis'
import { createClient } from 'redis'

let client: RedisClientType | null = null

/**
 * 获取一个共享的 Redis 客户端实例。
 * 这个实例可以用于执行常规命令和发布消息。
 */
export function useRedis() {
  if (client)
    return client

  const config = useRuntimeConfig()
  const redisConfig = config.redis
  if (!redisConfig?.host)
    throw new Error('Redis configuration is missing in nuxt.config')

  client = createClient({
    socket: {
      host: redisConfig.host,
      port: 6379,
    },
    password: redisConfig.password,
    database: redisConfig.db,
  })

  client.on('error', err => console.error('Redis Client Error', err))

  // 注意：我们只在需要时连接，而不是在这里立即连接。
  // createClient 不会立即连接。
  return client
}
