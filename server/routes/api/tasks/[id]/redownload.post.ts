// server/routes/api/tasks/[id]/redownload.post.ts
import { eq } from 'drizzle-orm'
import { tasks } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const taskId = getRouterParam(event, 'id')
  if (!taskId || Number.isNaN(Number(taskId)))
    throw createError({ statusCode: 400, statusMessage: 'Invalid Task ID' })

  const numericTaskId = Number(taskId)
  const db = useDb()

  const [task] = await db.select().from(tasks).where(eq(tasks.id, numericTaskId))
  if (!task)
    throw createError({ statusCode: 404, statusMessage: 'Task not found' })

  if (task.verificationStatus !== 'completed' || !task.missingTiles || task.missingTiles === 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `No missing tiles found to redownload. Please run verification first.`,
    })
  }

  // 非阻塞地启动重新下载任务
  executeRedownloadTask(numericTaskId).catch((err) => {
    console.error(`[Task ${numericTaskId}] Unhandled error in redownload task:`, err)
  })

  setResponseStatus(event, 202) // Accepted
  return { message: `Task ${numericTaskId} redownload has been started.` }
})
