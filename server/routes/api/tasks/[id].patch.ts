// server/routes/api/tasks/[id].patch.ts
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { tasks } from '~~/server/database/schema'

// 验证规则：只允许更新 name 和 description
const taskUpdateSchema = z.object({
  name: z.string().min(3, '任务名称至少需要3个字符'),
  description: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const taskId = getRouterParam(event, 'id')
  if (!taskId || Number.isNaN(Number(taskId)))
    throw createError({ statusCode: 400, statusMessage: 'Invalid Task ID' })

  const numericTaskId = Number(taskId)
  const body = await readBody(event)

  // 验证输入
  const validation = taskUpdateSchema.safeParse(body)
  if (!validation.success)
    throw createError({ statusCode: 400, data: validation.error.errors })

  const { name, description } = validation.data
  const db = useDb()

  try {
    // 更新数据库
    const [updatedTask] = await db.update(tasks)
      .set({ name, description, updatedAt: new Date() })
      .where(eq(tasks.id, numericTaskId))
      .returning()

    if (!updatedTask)
      throw createError({ statusCode: 404, statusMessage: 'Task not found' })

    // 通过 Redis 发布更新，让所有客户端实时看到变化
    const redis = useRedis()
    if (!redis.isOpen)
      await redis.connect()
    await redis.publish('task-updates', JSON.stringify(updatedTask))

    return updatedTask
  }
  catch (error) {
    console.error(`Error updating task ${numericTaskId}:`, error)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
