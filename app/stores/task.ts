// app/stores/task.ts
import type { tasks } from '~~/server/database/schema'
import { acceptHMRUpdate, defineStore } from 'pinia'
// 假设你把 Zod schema 移到共享文件，或者在这里重新定义类型
// 为简单起见，我们先用 any
type Task = typeof tasks.$inferSelect
type TaskCreatePayload = any // z.infer<typeof taskSchema> in api

export const useTaskStore = defineStore('task', () => {
  const tasks = ref<Task[]>([])
  const isLoading = ref(false)

  async function fetchTasks() {
    isLoading.value = true
    try {
      const data = await $fetch<Task[]>('/api/tasks')
      tasks.value = data
    }
    catch (error) {
      console.error('Failed to fetch tasks', error)
      // 可以在这里添加错误提示
    }
    finally {
      isLoading.value = false
    }
  }

  async function createTask(payload: TaskCreatePayload) {
    isLoading.value = true
    try {
      const result = await $fetch('/api/tasks', {
        method: 'POST',
        body: payload,
      })
      // 成功后重新加载列表
      await fetchTasks()
      return result
    }
    catch (error) {
      console.error('Failed to create task', error)
      // 可以在这里添加错误提示
      throw error // 将错误抛出，让组件处理
    }
    finally {
      isLoading.value = false
    }
  }

  // 初始化时加载一次任务
  fetchTasks()

  return {
    tasks,
    isLoading,
    fetchTasks,
    createTask,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useTaskStore, import.meta.hot))
