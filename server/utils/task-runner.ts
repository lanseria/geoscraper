// server/utils/task-runner.ts
/* eslint-disable no-console */
import { eq } from 'drizzle-orm'
import { tasks as tasksSchema } from '~~/server/database/schema'
import { calculateAllTiles } from '~~/server/utils/tile'
import { downloadTile } from './downloader'

const REDIS_UPDATE_CHANNEL = 'task-updates'

async function updateTaskProgress(taskId: number, updates: Partial<typeof tasksSchema.$inferInsert>) {
  const db = useDb()
  const redis = useRedis()
  try {
    const [updatedTask] = await db.update(tasksSchema)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tasksSchema.id, taskId))
      .returning()
    if (updatedTask) {
      if (!redis.isOpen)
        await redis.connect()
      await redis.publish(REDIS_UPDATE_CHANNEL, JSON.stringify(updatedTask))
    }
    return updatedTask
  }
  catch (error) {
    console.error(`[Task ${taskId}] Failed to update DB or publish:`, error)
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  asyncFn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = []
  let currentIndex = 0
  async function worker() {
    while (currentIndex < items.length) {
      const itemIndex = currentIndex++
      const item = items[itemIndex]
      if (item) {
        const result = await asyncFn(item)
        results[itemIndex] = result
      }
    }
  }
  const workers = Array.from({ length: concurrency }, () => worker())
  await Promise.all(workers)
  return results
}

export async function executeDownloadTask(taskId: number) {
  console.log(`[Task ${taskId}] Nitro task runner started.`)
  const db = useDb()

  // --- 核心修改: 添加 try...catch 块 ---
  try {
    const [task] = await db.select().from(tasksSchema).where(eq(tasksSchema.id, taskId))
    if (!task) {
      console.error(`[Task ${taskId}] Could not find task details in DB.`)
      return
    }

    const allTiles = calculateAllTiles(task.bounds, task.zoomLevels)
    const totalTiles = allTiles.length

    await updateTaskProgress(taskId, { status: 'running', totalTiles, progress: 0, completedTiles: 0 })

    if (totalTiles === 0) {
      await updateTaskProgress(taskId, { status: 'completed', progress: 100 })
      return
    }

    let completedCount = 0
    let lastUpdateTime = Date.now()

    const progressUpdater = async (tileResult: string) => {
      if (tileResult === 'downloaded' || tileResult === 'skipped_404' || tileResult === 'skipped_exists')
        completedCount++

      const now = Date.now()
      if (now - lastUpdateTime > 1000 || completedCount === totalTiles) {
        lastUpdateTime = now
        const progress = totalTiles > 0 ? (completedCount / totalTiles) * 100 : 100
        await updateTaskProgress(taskId, { progress, completedTiles: completedCount })
      }
    }

    const downloadTasks = allTiles.map(tile => async () => {
      const result = await downloadTile(tile, task)
      await progressUpdater(result)
    })

    await runWithConcurrency(downloadTasks, fn => fn(), task.concurrency)

    console.log(`[Task ${taskId}] Processing finished. ${completedCount}/${totalTiles} tiles successful.`)
    await updateTaskProgress(taskId, { status: 'completed' })
  }
  catch (error: any) {
    // 捕获到任何未处理的异常，将任务状态更新为 'failed'
    console.error(`[Task ${taskId}] An unexpected error occurred:`, error)
    await updateTaskProgress(taskId, { status: 'failed' })
  }
}
