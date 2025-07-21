// server/routes/api/tasks/[id]/start.post.ts
import { eq } from 'drizzle-orm'
import { tasks } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const taskId = getRouterParam(event, 'id')
  if (!taskId || Number.isNaN(Number(taskId))) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid Task ID' })
  }

  const numericTaskId = Number(taskId)
  const db = useDb()

  // 检查任务是否存在且状态是否为 'queued'
  const [task] = await db.select().from(tasks).where(eq(tasks.id, numericTaskId))
  if (!task)
    throw createError({ statusCode: 404, statusMessage: 'Task not found' })

  if (task.status !== 'queued') {
    throw createError({
      statusCode: 409, // Conflict
      statusMessage: `Task cannot be started. Current status: ${task.status}`,
    })
  }

  // 非阻塞地启动下载任务
  executeDownloadTask(numericTaskId).catch((err) => {
    console.error(`[Task ${numericTaskId}] Unhandled error in task runner:`, err)
    // 可以在这里添加额外的错误处理，比如更新任务状态为 failed
  })

  // 立即返回响应
  setResponseStatus(event, 202) // 202 Accepted 表示请求已接受，正在处理
  return { message: `Task ${numericTaskId} has been started.` }
})
