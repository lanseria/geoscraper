// server/routes/api/tasks/[id]/mark-non-existent.post.ts
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { tasks } from '~~/server/database/schema'

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

  // 1. 合并新的和已有的 nonExistentTiles
  const existingNonExistent = task.nonExistentTiles || []
  const tileToMarkSet = new Set(tilesToMark.map(t => `${t.z}-${t.x}-${t.y}`))
  const newNonExistentTiles = [...existingNonExistent]

  for (const tile of tilesToMark) {
    if (!tileToMarkSet.has(`${tile.z}-${tile.x}-${tile.y}`)) {
      newNonExistentTiles.push(tile)
    }
  }

  // 2. 从 missingTileList 中移除这些被标记的瓦片
  const newMissingTileList = (task.missingTileList || []).filter((tile) => {
    return !tileToMarkSet.has(`${tile.z}-${tile.x}-${tile.y}`)
  })

  // 3. 更新数据库
  const [updatedTask] = await db.update(tasks)
    .set({
      nonExistentTiles: newNonExistentTiles,
      missingTileList: newMissingTileList,
      missingTiles: newMissingTileList.length, // 更新缺失瓦片数量
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, numericTaskId))
    .returning()

  // 4. 通过 SSE 通知前端更新
  const redis = useRedis()
  if (!redis.isOpen)
    await redis.connect()
  await redis.publish('task-updates', JSON.stringify(updatedTask))

  setResponseStatus(event, 200)
  return { message: `${tilesToMark.length} tiles marked as non-existent.` }
})
