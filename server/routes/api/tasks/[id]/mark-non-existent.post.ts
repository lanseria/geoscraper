// server/routes/api/tasks/[id]/mark-non-existent.post.ts
import { and, count, eq, or } from 'drizzle-orm'
import { z } from 'zod'
import { tasks, taskTiles } from '~~/server/database/schema'

const tileSchema = z.object({ z: z.number(), x: z.number(), y: z.number() })
const bodySchema = z.object({
  tilesToMark: z.array(tileSchema),
})

export default defineEventHandler(async (event) => {
  const taskId = getRouterParam(event, 'id')
  if (!taskId || Number.isNaN(Number(taskId)))
    throw createError({ statusCode: 400, statusMessage: 'Invalid Task ID' })

  const numericTaskId = Number(taskId)
  const body = await readBody(event)
  const validation = bodySchema.safeParse(body)

  if (!validation.success)
    throw createError({ statusCode: 400, data: validation.error.errors })

  const { tilesToMark } = validation.data
  if (tilesToMark.length === 0)
    return { message: 'No tiles to mark.' }

  const db = useDb()
  const [task] = await db.select().from(tasks).where(eq(tasks.id, numericTaskId))

  if (!task)
    throw createError({ statusCode: 404, statusMessage: 'Task not found' })

  // --- 核心修正区域 ---

  // 1. 将 'missing' 记录更新为 'non-existent'
  // 我们直接更新匹配的瓦片记录，而不是先删除再插入
  const orConditions = tilesToMark.map(t =>
    and(
      eq(taskTiles.z, t.z),
      eq(taskTiles.x, t.x),
      eq(taskTiles.y, t.y),
    ),
  )

  await db.update(taskTiles)
    .set({ type: 'non-existent' })
    .where(and(
      eq(taskTiles.taskId, numericTaskId),
      eq(taskTiles.type, 'missing'),
      or(...orConditions), // 使用 'or' 操作符组合所有瓦片条件
    ))

  // 2. 如果某些 'non-existent' 瓦片之前不存在于 missing 列表，则需要插入它们
  // (这是一个更完整的逻辑，处理用户可能直接标记了非缺失瓦片的情况)
  // 为了简化，我们假设用户总是标记 'missing' 列表中的瓦片。
  // 如果需要更复杂的 "upsert" 逻辑，可以像下面这样做：
  const valuesToInsert = tilesToMark.map(t => ({
    taskId: numericTaskId,
    z: t.z,
    x: t.x,
    y: t.y,
    type: 'non-existent' as const,
  }))

  if (valuesToInsert.length > 0) {
    // 使用 ON CONFLICT DO UPDATE 来实现 upsert 逻辑
    // 这需要你在数据库中为 (taskId, z, x, y) 创建一个唯一索引
    // ALTER TABLE geoscraper.task_tiles ADD CONSTRAINT unique_tile_per_task UNIQUE (task_id, z, x, y);
    await db.insert(taskTiles)
      .values(valuesToInsert)
      .onConflictDoUpdate({
        target: [taskTiles.taskId, taskTiles.z, taskTiles.x, taskTiles.y],
        set: { type: 'non-existent' },
      })
  }

  // 3. 重新计算任务的 'missingTiles' 计数
  const newMissingCountResult = await db.select({ count: count() }).from(taskTiles).where(and(eq(taskTiles.taskId, numericTaskId), eq(taskTiles.type, 'missing')))

  const [updatedTask] = await db.update(tasks)
    .set({
      missingTiles: newMissingCountResult[0].count,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, numericTaskId))
    .returning()

  // 4. 通过 SSE 通知前端更新
  const redis = useRedis()
  if (!redis.isOpen)
    await redis.connect()

  // --- 优化: 发布完整的任务对象，以便前端可以立即更新计数 ---
  const taskDetailForSse = {
    ...updatedTask,
    missingTiles: newMissingCountResult[0].count, // 确保这个值是最新的
  }
  await redis.publish('task-updates', JSON.stringify(taskDetailForSse))

  setResponseStatus(event, 200)
  return { message: `${tilesToMark.length} tiles marked as non-existent.` }
})
