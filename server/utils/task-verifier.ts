// server/utils/task-verifier.ts
/* eslint-disable no-console */
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { tasks as tasksSchema } from '~~/server/database/schema'
import { calculateAllTiles } from '~~/server/utils/tile'
import { downloadTile } from './downloader'

const REDIS_UPDATE_CHANNEL = 'task-updates'

// 辅助函数，用于更新任务状态并发布到 Redis
async function updateTaskState(taskId: number, updates: Partial<typeof tasksSchema.$inferInsert>) {
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
    console.error(`[Task ${taskId}] Failed to update state:`, error)
  }
}

/**
 * 执行瓦片完整性校验任务
 */
export async function executeVerificationTask(taskId: number) {
  console.log(`[Task ${taskId}] Verification process started.`)
  const db = useDb()
  const config = useRuntimeConfig()

  try {
    const [task] = await db.select().from(tasksSchema).where(eq(tasksSchema.id, taskId))
    if (!task)
      throw new Error('Task not found')

    const allTiles = calculateAllTiles(task.bounds, task.zoomLevels)
    const totalTiles = allTiles.length
    if (totalTiles === 0) {
      await updateTaskState(taskId, { verificationStatus: 'completed', verificationProgress: 100 })
      return
    }

    // --- 新增: 状态追踪变量 ---
    let lastProgress = -1
    let lastVerifiedCount = -1
    let lastMissingCount = -1

    await updateTaskState(taskId, { verificationStatus: 'running', verificationProgress: 0, verifiedTiles: 0, missingTiles: 0 })

    let checkedCount = 0
    let verifiedCount = 0
    const missingTileList: { z: number, x: number, y: number }[] = []
    let lastUpdateTime = Date.now()
    const storageRoot = config.storageRoot || '/data/geoscraper-tiles'

    for (const tile of allTiles) {
      const filePath = path.join(storageRoot, task.mapType, String(tile.z), String(tile.x), `${tile.y}.png`)
      let fileExistsAndIsValid = false
      try {
        const stats = await stat(filePath)
        if (stats.size > 0) { // 确保文件不是空的
          fileExistsAndIsValid = true
          verifiedCount++
        }
      }
      catch (error: any) {
        if (error.code !== 'ENOENT')
          console.error(`[Task ${taskId}] Error checking file ${filePath}:`, error)
      }
      if (!fileExistsAndIsValid)
        missingTileList.push(tile)
      checkedCount++
      const now = Date.now()
      const isLastTile = checkedCount === totalTiles
      if (now - lastUpdateTime > 1000 || isLastTile) {
        lastUpdateTime = now
        const progress = totalTiles > 0 ? Math.floor((checkedCount / totalTiles) * 100) : 100
        const missingCount = missingTileList.length

        // 只有在进度、已验证数或缺失数发生变化时才更新
        if (progress !== lastProgress || verifiedCount !== lastVerifiedCount || missingCount !== lastMissingCount || isLastTile) {
          lastProgress = progress
          lastVerifiedCount = verifiedCount
          lastMissingCount = missingCount

          await updateTaskState(taskId, {
            verificationProgress: progress,
            verifiedTiles: verifiedCount,
            missingTiles: missingCount,
          })
        }
      }
    }

    // 最终更新，写入缺失的瓦片列表
    await updateTaskState(taskId, {
      verificationStatus: 'completed',
      missingTileList,
    })
    console.log(`[Task ${taskId}] Verification complete. Found ${missingTileList.length} missing tiles.`)
  }
  catch (error) {
    console.error(`[Task ${taskId}] Verification failed:`, error)
    await updateTaskState(taskId, { verificationStatus: 'none' }) // or 'failed'
  }
}

/**
 * 执行重新下载缺失瓦片的任务
 */
export async function executeRedownloadTask(taskId: number) {
  console.log(`[Task ${taskId}] Redownload process started.`)
  const db = useDb()

  try {
    const [task] = await db.select().from(tasksSchema).where(eq(tasksSchema.id, taskId))
    if (!task || !task.missingTileList || task.missingTileList.length === 0) {
      console.log(`[Task ${taskId}] No missing tiles to redownload.`)
      await updateTaskState(taskId, { status: 'completed' }) // 确保状态正确
      return
    }

    const tilesToRedownload = task.missingTileList
    const totalToRedownload = tilesToRedownload.length

    // --- 新增: 状态追踪变量 ---
    let lastProgress = -1
    let lastCompletedCount = -1

    // 重置主进度条，用于重下载过程
    await updateTaskState(taskId, { status: 'running', progress: 0, totalTiles: totalToRedownload, completedTiles: 0 })

    let completedCount = 0
    let lastUpdateTime = Date.now()

    for (const tile of tilesToRedownload) {
      const result = await downloadTile(tile, task)
      if (result === 'downloaded' || result === 'skipped_exists')
        completedCount++

      const now = Date.now()
      const isLastTile = completedCount === totalToRedownload || (tile === tilesToRedownload[tilesToRedownload.length - 1])
      if (now - lastUpdateTime > 500 || isLastTile) {
        lastUpdateTime = now
        const progress = totalToRedownload > 0 ? Math.floor((completedCount / totalToRedownload) * 100) : 100

        if (progress !== lastProgress || completedCount !== lastCompletedCount || isLastTile) {
          lastProgress = progress
          lastCompletedCount = completedCount

          await updateTaskState(taskId, { progress, completedTiles: completedCount })
        }
      }
    }

    // 重下载完成后，将任务状态设为 completed，并清空校验状态，以便可以再次校验
    await updateTaskState(taskId, {
      status: 'completed',
      verificationStatus: 'none',
      verificationProgress: 0,
      verifiedTiles: 0,
      missingTiles: 0,
      missingTileList: [],
    })
    console.log(`[Task ${taskId}] Redownload complete.`)
  }
  catch (error) {
    console.error(`[Task ${taskId}] Redownload failed:`, error)
    await updateTaskState(taskId, { status: 'failed' })
  }
}
