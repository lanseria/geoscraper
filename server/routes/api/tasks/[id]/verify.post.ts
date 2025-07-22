// server/routes/api/tasks/[id]/verify.post.ts
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

  if (task.status !== 'completed') {
    throw createError({
      statusCode: 409,
      statusMessage: `Only completed tasks can be verified. Current status: ${task.status}`,
    })
  }

  // 非阻塞地启动校验任务
  executeVerificationTask(numericTaskId).catch((err) => {
    console.error(`[Task ${numericTaskId}] Unhandled error in verification task:`, err)
  })

  setResponseStatus(event, 202) // Accepted
  return { message: `Task ${numericTaskId} verification has been started.` }
})
