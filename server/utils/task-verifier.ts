// server/utils/task-verifier.ts
/* eslint-disable no-console */
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { and, eq } from 'drizzle-orm'
import { tasks as tasksSchema, taskTiles } from '~~/server/database/schema'
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

    const nonExistentTilesResult = await db.select().from(taskTiles).where(and(eq(taskTiles.taskId, taskId), eq(taskTiles.type, 'non-existent')))
    const nonExistentSet = new Set(nonExistentTilesResult.map(t => `${t.z}-${t.x}-${t.y}`))

    // --- 核心修改 [2]: 在开始前，清空该任务之前的所有 "missing" 记录 ---
    await db.delete(taskTiles).where(and(eq(taskTiles.taskId, taskId), eq(taskTiles.type, 'missing')))

    const allTiles = calculateAllTiles(task.bounds, task.zoomLevels)
    const totalTiles = allTiles.length
    if (totalTiles === 0) {
      await updateTaskState(taskId, { verificationStatus: 'completed', verificationProgress: 100 })
      return
    }

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
      const tileKey = `${tile.z}-${tile.x}-${tile.y}`

      // --- 如果瓦片在 "不存在" 集合中，则跳过文件检查，并将其计为已验证 ---
      if (nonExistentSet.has(tileKey)) {
        checkedCount++
        verifiedCount++ // 将其视为已验证/已处理
        continue // 直接处理下一个瓦片
      }

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

    if (missingTileList.length > 0) {
      await db.insert(taskTiles).values(
        missingTileList.map(tile => ({
          taskId,
          z: tile.z,
          x: tile.x,
          y: tile.y,
          type: 'missing' as const, // 明确类型
        })),
      )
    }

    // 最终更新，不再写入列表，只更新状态
    await updateTaskState(taskId, {
      verificationStatus: 'completed',
      // missingTileList, // <--- 移除
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

    // --- 核心修改 1: 从 task_tiles 表查询需要重新下载的瓦片 ---
    const tilesToRedownload = await db.select({ z: taskTiles.z, x: taskTiles.x, y: taskTiles.y })
      .from(taskTiles)
      .where(and(
        eq(taskTiles.taskId, taskId),
        eq(taskTiles.type, 'missing'),
      ))

    if (!task || tilesToRedownload.length === 0) {
      console.log(`[Task ${taskId}] No missing tiles to redownload.`)
      // 如果没有需要下载的，确保任务状态是 'completed'
      await updateTaskState(taskId, {
        status: 'completed',
        verificationStatus: 'none',
        verificationProgress: 0,
        verifiedTiles: 0,
        missingTiles: 0,
      })
      return
    }

    const totalToRedownload = tilesToRedownload.length

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

    // --- 核心修改 2: 重新下载完成后，清空 'missing' 类型的瓦片记录 ---
    await db.delete(taskTiles).where(and(
      eq(taskTiles.taskId, taskId),
      eq(taskTiles.type, 'missing'),
    ))

    // 最终更新任务状态
    await updateTaskState(taskId, {
      status: 'completed',
      verificationStatus: 'none',
      verificationProgress: 0,
      verifiedTiles: 0,
      missingTiles: 0,
    })
    console.log(`[Task ${taskId}] Redownload complete.`)
  }
  catch (error) {
    console.error(`[Task ${taskId}] Redownload failed:`, error)
    await updateTaskState(taskId, { status: 'failed' })
  }
}
