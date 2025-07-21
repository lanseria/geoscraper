// server/routes/api/tasks/[id].delete.ts
/* eslint-disable no-console */
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { tasks } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const taskId = getRouterParam(event, 'id')
  const { deleteFiles } = getQuery(event)

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

    // 在删除数据库记录前，先查询出任务信息，因为需要用它来定位文件路径
    const [taskToDelete] = await db.select().from(tasks).where(eq(tasks.id, numericTaskId))

    // 从数据库中删除任务记录
    const deletedTasks = await db.delete(tasks).where(eq(tasks.id, numericTaskId)).returning()

    if (deletedTasks.length === 0) {
      // 即使数据库中没有，也可能需要清理文件（如果 taskToDelete 查询到了）
      console.log(`[Task ${numericTaskId}] Task not found in database, assumed already deleted.`)
    }
    else {
      console.log(`[Task ${numericTaskId}] Deleted from database.`)
    }

    // --- 新增: 文件删除逻辑 ---
    if (deleteFiles === 'true' && taskToDelete) {
      const config = useRuntimeConfig()
      const storageRoot = config.storageRoot || '/data/geoscraper-tiles'

      // 注意：这里的删除逻辑是基于整个 mapType 的，这符合共享缓存的设计。
      // 我们将删除此任务涉及到的所有 zoom level 目录。
      // 这是一个潜在的破坏性操作，因为会影响其他共享此 mapType 的任务。
      // 更安全的做法是只删除特定边界内的文件，但这会非常复杂。
      // 当前实现假定用户了解此行为。
      console.log(`[Task ${numericTaskId}] Attempting to delete files for mapType: ${taskToDelete.mapType}`)
      for (const zoom of taskToDelete.zoomLevels) {
        const dirToDelete = path.join(storageRoot, taskToDelete.mapType, String(zoom))
        try {
          console.log(`[Task ${numericTaskId}] Removing directory: ${dirToDelete}`)
          await rm(dirToDelete, { recursive: true, force: true })
        }
        catch (fsError) {
          console.error(`[Task ${numericTaskId}] Failed to delete directory ${dirToDelete}.`, fsError)
          // 不抛出错误，继续执行
        }
      }
      console.log(`[Task ${numericTaskId}] File deletion process completed.`)
    }

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
