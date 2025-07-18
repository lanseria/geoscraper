// server/routes/api/tasks/[id].get.ts
import { eq } from 'drizzle-orm'
import { tasks } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const taskId = getRouterParam(event, 'id')
  if (!taskId || Number.isNaN(Number(taskId))) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid Task ID',
    })
  }

  const numericTaskId = Number(taskId)
  const db = useDb()

  const [task] = await db.select().from(tasks).where(eq(tasks.id, numericTaskId))

  if (!task) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Task not found',
    })
  }

  return task
})
