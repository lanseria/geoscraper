// server/api/tasks/index.post.ts
import { z } from 'zod'
import { tasks } from '~~/server/database/schema'

// 使用 Zod 定义输入数据的验证规则
const taskSchema = z.object({
  name: z.string().min(3, '任务名称至少需要3个字符'),
  description: z.string().optional(),
  mapType: z.enum(['google-satellite', 'osm-standard', 'osm-topo']),
  bounds: z.object({
    sw: z.object({ lat: z.number(), lng: z.number() }),
    ne: z.object({ lat: z.number(), lng: z.number() }),
  }),
  zoomLevels: z.array(z.number().min(0).max(22)).min(1, '至少选择一个缩放级别'),
  concurrency: z.number().min(1).max(20).default(5),
  downloadDelay: z.number().min(0).max(5).default(0.2),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const validation = taskSchema.safeParse(body)
  if (!validation.success) {
    throw createError({ statusCode: 400, data: validation.error.errors })
  }
  const taskData = validation.data

  const db = useDb()

  try {
    const [newTask] = await db.insert(tasks).values({
      name: taskData.name,
      description: taskData.description,
      mapType: taskData.mapType,
      bounds: taskData.bounds,
      zoomLevels: taskData.zoomLevels,
      concurrency: taskData.concurrency,
      downloadDelay: taskData.downloadDelay,
      status: 'queued', // 状态固定为 queued
    }).returning()

    if (!newTask) {
      throw createError({ statusCode: 500, statusMessage: 'Failed to create task' })
    }

    // --- 核心修改 ---
    // 不再立即调用任务执行器。
    // executeDownloadTask(newTask.id).catch(...) // <--- 移除此行

    // --- 新增: 通过 SSE 通知前端有新任务加入 ---
    // 这样列表可以实时更新，而无需等待页面刷新
    const redis = useRedis()
    if (!redis.isOpen)
      await redis.connect()
    await redis.publish('task-updates', JSON.stringify(newTask))

    // API 立即返回，告知前端任务已创建
    return {
      statusCode: 201,
      message: 'Task created and is now queued.', // 修改消息
      task: newTask,
    }
  }
  catch (error) {
    console.error('Error creating task:', error)
    throw createError({ statusCode: 500, statusMessage: 'Internal error' })
  }
})
