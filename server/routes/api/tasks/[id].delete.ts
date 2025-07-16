/* eslint-disable no-console */
import fs from 'node:fs/promises'
import path from 'node:path'
import { env } from 'node:process'
// server/api/tasks/[id].delete.ts
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
    // 1. 从 BullMQ 队列中移除作业
    // 这会尝试从所有可能的状态中移除作业（waiting, active, delayed, etc.）
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

    // 2. 从数据库中删除任务记录
    const deletedTasks = await db.delete(tasks).where(eq(tasks.id, numericTaskId)).returning()
    if (deletedTasks.length === 0) {
      // 如果任务在数据库中不存在，可能已经被删除，也算成功
      return {
        statusCode: 200, // or 404 if you want to be strict
        message: 'Task not found in database, assumed already deleted.',
      }
    }
    console.log(`[Task ${numericTaskId}] Deleted from database.`)

    // 3. 从文件系统中删除已下载的瓦片 (可选但推荐)
    // 注意: 环境变量需要在 .env 中定义
    const storageRoot = env.STORAGE_ROOT || '/data/geoscraper-tiles'
    const taskDirectory = path.join(storageRoot, String(numericTaskId))

    try {
      // 检查目录是否存在
      await fs.access(taskDirectory)
      // 递归删除目录及其所有内容
      await fs.rm(taskDirectory, { recursive: true, force: true })
      console.log(`[Task ${numericTaskId}] Deleted tile directory: ${taskDirectory}`)
    }
    catch (fsError: any) {
      // 如果目录不存在 (ENOENT)，则忽略错误，因为这说明没有文件需要删除
      if (fsError.code !== 'ENOENT')
        console.error(`[Task ${numericTaskId}] Failed to delete tile directory.`, fsError)
    }

    // 4. 返回成功响应
    setResponseStatus(event, 204) // 204 No Content 是 DELETE 成功的常用状态码
  }
  catch (error) {
    console.error(`[Task ${numericTaskId}] Error during deletion:`, error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to delete task ${numericTaskId}.`,
    })
  }
})
