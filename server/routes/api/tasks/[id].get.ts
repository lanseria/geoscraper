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

  const taskWithTiles = await db.query.tasks.findFirst({
    where: eq(tasks.id, numericTaskId),
    with: {
      tiles: true, // 这会加载所有关联的 task_tiles 记录
    },
  })

  if (!taskWithTiles) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Task not found',
    })
  }

  // --- 核心修改: 将平铺的瓦片列表重新组合成前端期望的格式 ---
  const task = {
    ...taskWithTiles,
    missingTileList: taskWithTiles.tiles
      .filter(t => t.type === 'missing')
      .map(({ z, x, y }) => ({ z, x, y })),
    nonExistentTiles: taskWithTiles.tiles
      .filter(t => t.type === 'non-existent')
      .map(({ z, x, y }) => ({ z, x, y })),
  }
  // eslint-disable-next-line ts/ban-ts-comment
  // @ts-expect-error
  delete task.tiles // 从最终响应中移除原始的平铺列表

  return task
})
