// server/api/tasks/index.post.ts
import { z } from 'zod'
import { tasks } from '~~/server/database/schema'

// 使用 Zod 定义输入数据的验证规则
const taskSchema = z.object({
  name: z.string().min(3, '任务名称至少需要3个字符'),
  description: z.string().optional(),
  mapType: z.enum(['google-satellite', 'osm-standard', 'osm-topo']),
  bounds: z.object({
    sw: z.object({ lat: z.number(), lng: z.number() }),
    ne: z.object({ lat: z.number(), lng: z.number() }),
  }),
  zoomLevels: z.array(z.number().min(0).max(22)).min(1, '至少选择一个缩放级别'),
  concurrency: z.number().min(1).max(20).default(5),
  downloadDelay: z.number().min(0).max(5).default(0.2),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const validation = taskSchema.safeParse(body)
  if (!validation.success) {
    throw createError({ statusCode: 400, data: validation.error.errors })
  }
  const taskData = validation.data

  const db = useDb()

  try {
    const [newTask] = await db.insert(tasks).values({
      name: taskData.name,
      description: taskData.description,
      mapType: taskData.mapType,
      bounds: taskData.bounds,
      zoomLevels: taskData.zoomLevels,
      concurrency: taskData.concurrency,
      downloadDelay: taskData.downloadDelay,
      status: 'queued',
    }).returning()

    if (!newTask) {
      throw createError({ statusCode: 500, statusMessage: 'Failed to create task' })
    }

    // --- 核心修改 ---
    // 立即调用任务执行器，但不要 await 它！
    // 这会让任务在后台运行，而 API 可以立即响应前端。
    executeDownloadTask(newTask.id).catch((err) => {
      console.error(`[Task ${newTask.id}] Unhandled error in task runner:`, err)
      // 可以在这里添加额外的错误处理，比如更新任务状态为 failed
    })

    // API 立即返回，告知前端任务已创建并开始处理
    return {
      statusCode: 201,
      message: 'Task created and started.',
      task: newTask,
    }
  }
  catch (error) {
    console.error('Error creating task:', error)
    throw createError({ statusCode: 500, statusMessage: 'Internal error' })
  }
})
