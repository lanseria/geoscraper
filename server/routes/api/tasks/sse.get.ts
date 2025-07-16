/* eslint-disable no-console */
// server/api/tasks/sse.get.ts
import { desc } from 'drizzle-orm'
import { createClient } from 'redis'
import { tasks } from '~~/server/database/schema'

const REDIS_UPDATE_CHANNEL = 'task-updates'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const redisConfig = config.redis
  if (!redisConfig?.host)
    throw new Error('Redis configuration is missing in nuxt.config')

  // 创建一个专门用于订阅的 Redis 客户端
  const subscriber = createClient({
    socket: {
      host: redisConfig.host,
      port: 6379, // 默认端口
    },
    password: redisConfig.password,
    database: redisConfig.db,
  })

  // 创建一个 EventStream 来保持连接并发送事件
  const stream = createEventStream(event)

  subscriber.on('error', (err) => {
    console.error('Redis Subscriber Error', err)
    stream.close() // 出错时关闭 SSE 连接
  })

  await subscriber.connect()
  console.log('SSE: Redis subscriber connected.')

  // 订阅任务更新频道
  await subscriber.subscribe(REDIS_UPDATE_CHANNEL, (message) => {
    // 收到消息时，将其推送到前端
    stream.push(message)
  })

  // 当客户端断开连接时，清理资源
  stream.onClosed(async () => {
    console.log('SSE: Client disconnected, unsubscribing and quitting Redis.')
    await subscriber.unsubscribe(REDIS_UPDATE_CHANNEL)
    await subscriber.quit()
  })

  // 初始连接时，可以先发送一次当前所有任务列表
  // 这样客户端一连上就有数据，无需再单独请求一次
  const db = useDb()
  const allTasks = await db.select().from(tasks).orderBy(desc(tasks.createdAt))
  stream.push(JSON.stringify({ type: 'initial-load', data: allTasks }))

  return stream.send()
})
