// server/routes/api/tasks/[id].delete.ts
/* eslint-disable no-console */
import { eq } from 'drizzle-orm'
import { tasks } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  // 从路由参数中获取任务ID
  const taskId = getRouterParam(event, 'id')
  if (!taskId || Number.isNaN(Number(taskId))) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid Task ID',
    })
  }

  const numericTaskId = Number(taskId)
  const db = useDb()
  const queue = useQueue()

  try {
    // 1. 从 BullMQ 队列中移除作业 (逻辑不变)
    const jobs = await queue.getJobs(['wait', 'active', 'delayed'])
    const jobToRemove = jobs.find(job => job?.data.taskId === numericTaskId)

    if (jobToRemove) {
      try {
        await jobToRemove.remove()
        console.log(`[Task ${numericTaskId}] Removed job ${jobToRemove.id} from queue.`)
      }
      catch (qError) {
        console.error(`[Task ${numericTaskId}] Failed to remove job from queue, but proceeding.`, qError)
      }
    }

    // 2. 从数据库中删除任务记录 (逻辑不变)
    const deletedTasks = await db.delete(tasks).where(eq(tasks.id, numericTaskId)).returning()
    if (deletedTasks.length === 0) {
      return {
        statusCode: 200,
        message: 'Task not found in database, assumed already deleted.',
      }
    }
    console.log(`[Task ${numericTaskId}] Deleted from database.`)

    console.log(`[Task ${numericTaskId}] Task metadata deleted. Tile files are preserved in the shared cache.`)

    // 4. 返回成功响应 (逻辑不变)
    setResponseStatus(event, 204)
  }
  catch (error) {
    console.error(`[Task ${numericTaskId}] Error during deletion:`, error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to delete task ${numericTaskId}.`,
    })
  }
})
