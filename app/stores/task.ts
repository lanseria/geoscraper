// app/stores/task.ts
/* eslint-disable no-console */
import type { tasks } from '~~/server/database/schema'
import { acceptHMRUpdate, defineStore } from 'pinia'

export type Task = typeof tasks.$inferSelect & {
  // --- 核心修改: 将这些字段标记为可选 ---
  missingTileList?: { z: number, x: number, y: number }[]
  nonExistentTiles?: { z: number, x: number, y: number }[]
}
export type TaskCreatePayload = any
export type TaskUpdatePayload = Pick<Task, 'name' | 'description'>

export const useTaskStore = defineStore('task', () => {
  const tasks = ref<Task[]>([])
  const isLoading = ref(true)
  const proxyStatus = ref<{ ok: boolean, checkedAt?: string, error?: string } | null>(null)
  let eventSource: EventSource | null = null

  // --- 用于复制功能的 ref ---
  const taskToCopy = ref<Task | null>(null)

  async function checkProxyStatus() {
    try {
      await apiFetch('/health/proxy')
      proxyStatus.value = {
        ok: true,
        checkedAt: new Date().toLocaleTimeString(),
      }
    }
    catch (error: any) {
      proxyStatus.value = {
        ok: false,
        checkedAt: new Date().toLocaleTimeString(),
        error: error.data?.error || '连接代理失败',
      }
    }
  }

  function initializeSSE() {
    if (import.meta.server)
      return
    if (eventSource)
      eventSource.close()

    isLoading.value = true
    eventSource = new EventSource('/api/tasks/sse')

    eventSource.onopen = () => console.log('SSE connection opened.')

    eventSource.onmessage = (event) => {
      const eventData = JSON.parse(event.data)

      if (eventData.type === 'initial-load') {
        tasks.value = eventData.data
        isLoading.value = false
        console.log('SSE: Initial tasks loaded.')
        return
      }

      const updatedTask: Task = eventData
      const index = tasks.value.findIndex(t => t.id === updatedTask.id)

      if (index > -1)
        tasks.value[index] = updatedTask
      else
        tasks.value.unshift(updatedTask)

      tasks.value.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }

    eventSource.onerror = (error) => {
      console.error('SSE Error:', error)
      isLoading.value = false
      eventSource?.close()
    }
  }

  function closeSSE() {
    if (eventSource) {
      eventSource.close()
      eventSource = null
      console.log('SSE connection closed.')
    }
  }

  // --- 启动任务的 action ---
  async function startTask(taskId: number) {
    try {
      await apiFetch(`/tasks/${taskId}/start`, { method: 'POST' })
      // 任务状态的变更将通过 SSE 自动推送到前端
    }
    catch (error) {
      console.error(`Failed to start task ${taskId}`, error)
      throw error // 抛出错误，以便 UI 层可以捕获并显示提示
    }
  }

  // --- 新增: 校验任务的 action ---
  async function verifyTask(taskId: number) {
    try {
      await apiFetch(`/tasks/${taskId}/verify`, { method: 'POST' })
    }
    catch (error) {
      console.error(`Failed to start verification for task ${taskId}`, error)
      throw error
    }
  }

  // --- 新增: 重新下载任务的 action ---
  async function redownloadMissing(taskId: number) {
    try {
      await apiFetch(`/tasks/${taskId}/redownload`, { method: 'POST' })
    }
    catch (error) {
      console.error(`Failed to start redownload for task ${taskId}`, error)
      throw error
    }
  }

  async function createTask(payload: TaskCreatePayload) {
    try {
      // 创建任务的 API 调用本身不需要改变
      const response = await apiFetch('/tasks', {
        method: 'POST',
        body: payload,
      })
      return response
    }
    catch (error) {
      console.error('API call failed in store action:', error)
      throw error
    }
  }

  // --- 更新任务的 action ---
  async function updateTask(taskId: number, payload: TaskUpdatePayload) {
    try {
      const response = await apiFetch(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: payload,
      })
      // SSE 会自动处理状态更新，这里不需要手动修改 tasks.value
      return response
    }
    catch (error) {
      console.error('API call failed in store action:', error)
      throw error
    }
  }

  // --- 重试任务的 action ---
  async function retryTask(taskId: number) {
    try {
      await apiFetch(`/tasks/${taskId}/retry`, { method: 'POST' })
      // 状态更新将通过 SSE 自动推送到前端
    }
    catch (error) {
      console.error(`Failed to retry task ${taskId}`, error)
      throw error
    }
  }

  // --- deleteTask action ---
  async function deleteTask(taskId: number, deleteFiles: boolean) {
    try {
      // 将 deleteFiles 作为查询参数传递
      await apiFetch(`/tasks/${taskId}?deleteFiles=${deleteFiles}`, {
        method: 'DELETE',
      })
      const index = tasks.value.findIndex(t => t.id === taskId)
      if (index > -1)
        tasks.value.splice(index, 1)
    }
    catch (error) {
      console.error(`Failed to delete task ${taskId}`, error)
      throw error
    }
  }

  // --- 用于复制功能的函数 ---
  function setTaskToCopy(task: Task | null) {
    taskToCopy.value = task
  }

  return {
    tasks,
    isLoading,
    proxyStatus,
    taskToCopy,
    createTask,
    updateTask,
    startTask,
    retryTask,
    deleteTask,
    verifyTask,
    redownloadMissing,
    initializeSSE,
    closeSSE,
    checkProxyStatus,
    setTaskToCopy,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useTaskStore, import.meta.hot))
