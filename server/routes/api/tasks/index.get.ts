// server/api/tasks/index.get.ts
import { desc } from 'drizzle-orm'
import { tasks } from '~~/server/database/schema'

export default defineEventHandler(async () => {
  const db = useDb()
  try {
    const allTasks = await db.select().from(tasks).orderBy(desc(tasks.createdAt))
    return allTasks
  }
  catch (error) {
    console.error('Error fetching tasks:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch tasks',
    })
  }
})
