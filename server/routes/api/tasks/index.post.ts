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

  // 1. 验证输入
  const validation = taskSchema.safeParse(body)
  if (!validation.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid input',
      data: validation.error.errors,
    })
  }
  const taskData = validation.data

  const db = useDb()
  const queue = useQueue()

  try {
    // 2. 将任务存入数据库
    const [newTask] = await db.insert(tasks).values({
      name: taskData.name,
      description: taskData.description,
      mapType: taskData.mapType,
      bounds: taskData.bounds,
      zoomLevels: taskData.zoomLevels,
      concurrency: taskData.concurrency,
      downloadDelay: taskData.downloadDelay,
      status: 'queued', // 初始状态为排队中
    }).returning()

    if (!newTask) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to create task in database',
      })
    }

    // 3. 将任务 ID 添加到 BullMQ 队列
    await queue.add('scrape-task', { taskId: newTask.id })

    // 4. 返回成功创建的任务
    return {
      statusCode: 201,
      message: 'Task created and queued successfully.',
      task: newTask,
    }
  }
  catch (error) {
    console.error('Error creating task:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'An internal error occurred while creating the task.',
    })
  }
})
