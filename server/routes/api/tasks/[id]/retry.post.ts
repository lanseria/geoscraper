// server/routes/api/tasks/[id]/retry.post.ts
import { eq } from 'drizzle-orm'
import { tasks } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const taskId = getRouterParam(event, 'id')
  if (!taskId || Number.isNaN(Number(taskId)))
    throw createError({ statusCode: 400, statusMessage: 'Invalid Task ID' })

  const numericTaskId = Number(taskId)
  const db = useDb()

  // 1. 检查任务是否存在且状态为 'failed'
  const [task] = await db.select().from(tasks).where(eq(tasks.id, numericTaskId))
  if (!task)
    throw createError({ statusCode: 404, statusMessage: 'Task not found' })

  if (task.status !== 'failed') {
    throw createError({
      statusCode: 409, // Conflict
      statusMessage: `Only failed tasks can be retried. Current status: ${task.status}`,
    })
  }

  // 2. 重置任务状态和进度
  const [updatedTask] = await db.update(tasks)
    .set({
      status: 'queued',
      progress: 0,
      completedTiles: 0,
      totalTiles: 0,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, numericTaskId))
    .returning()

  // 3. 通过 SSE 通知前端状态已更新
  const redis = useRedis()
  if (!redis.isOpen)
    await redis.connect()
  await redis.publish('task-updates', JSON.stringify(updatedTask))

  setResponseStatus(event, 200)
  return { message: `Task ${numericTaskId} has been reset to queued state.` }
})
