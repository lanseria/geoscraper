// server/utils/queue.ts
import { Queue } from 'bullmq'

let queue: Queue | null = null

export const TASK_QUEUE_NAME = 'tile-scrape-queue'

export function useQueue() {
  if (!queue) {
    const config = useRuntimeConfig()
    const redisConfig = config.redis
    if (!redisConfig?.host)
      throw new Error('Redis configuration is missing in nuxt.config')

    queue = new Queue(TASK_QUEUE_NAME, {
      connection: {
        host: redisConfig.host,
        password: redisConfig.password,
      },
    })
  }
  return queue
}
