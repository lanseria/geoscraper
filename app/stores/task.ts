/* eslint-disable no-console */
// app/stores/task.ts
import type { tasks } from '~~/server/database/schema'
import { acceptHMRUpdate, defineStore } from 'pinia'

type Task = typeof tasks.$inferSelect
type TaskCreatePayload = any

export const useTaskStore = defineStore('task', () => {
  const tasks = ref<Task[]>([])
  const isLoading = ref(true) // 初始设为 true
  let eventSource: EventSource | null = null

  // --- 新增: SSE 初始化和关闭 ---
  function initializeSSE() {
    // 确保只在客户端执行
    if (import.meta.server)
      return
    // 如果已有连接，先关闭
    if (eventSource)
      eventSource.close()

    isLoading.value = true
    eventSource = new EventSource('/api/tasks/sse')

    eventSource.onopen = () => {
      console.log('SSE connection opened.')
    }

    eventSource.onmessage = (event) => {
      const eventData = JSON.parse(event.data)

      // 处理初始加载事件
      if (eventData.type === 'initial-load') {
        tasks.value = eventData.data
        isLoading.value = false
        console.log('SSE: Initial tasks loaded.')
        return
      }

      // 处理单个任务更新事件
      const updatedTask: Task = eventData
      const index = tasks.value.findIndex(t => t.id === updatedTask.id)

      if (index > -1) {
        // 更新现有任务
        tasks.value[index] = updatedTask
      }
      else {
        // 如果是新任务，添加到列表顶部
        tasks.value.unshift(updatedTask)
      }
      // 保持列表按创建时间倒序
      tasks.value.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }

    eventSource.onerror = (error) => {
      console.error('SSE Error:', error)
      isLoading.value = false // 出错时停止加载状态
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

  // --- 现有函数保持不变，但不再需要主动 fetchTasks ---
  // fetchTasks 仍然可以保留，以备 SSE 不可用时的后备方案

  async function createTask(payload: TaskCreatePayload) {
    try {
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

  async function deleteTask(taskId: number) {
    try {
      // 删除操作也应该使用 apiFetch，以保持一致性
      await apiFetch(`/tasks/${taskId}`, {
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

  return {
    tasks,
    isLoading,
    createTask,
    deleteTask,
    initializeSSE,
    closeSSE,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useTaskStore, import.meta.hot))
