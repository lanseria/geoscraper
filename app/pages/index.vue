<!-- app/pages/index.vue -->
<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useTaskStore } from '~/stores/task'

const taskStore = useTaskStore()
const { tasks, isLoading } = storeToRefs(taskStore)

const isFormVisible = ref(false)

// --- 新增的删除处理逻辑 ---
const isDeleting = ref<number | null>(null) // 用于跟踪哪个任务正在被删除

async function handleDelete(task: any) {
  // 使用浏览器原生的 confirm 对话框进行确认
  // eslint-disable-next-line no-alert
  const confirmed = window.confirm(`确定要删除任务 "${task.name}" 吗？\n此操作不可逆，将同时删除已下载的瓦片文件。`)

  if (confirmed) {
    isDeleting.value = task.id
    try {
      await taskStore.deleteTask(task.id)
      // 可以在这里显示成功提示
    }
    catch (error) {
      // 可以在这里显示失败提示
      console.error('删除任务失败', error)
    }
    finally {
      isDeleting.value = null
    }
  }
}
</script>

<template>
  <div p-8>
    <div mb-6 flex items-center justify-between>
      <h1 text-2xl font-bold>
        任务仪表盘
      </h1>
      <button class="btn-primary flex items-center" @click="isFormVisible = true">
        <div i-carbon-add mr-2 />
        创建新任务
      </button>
    </div>

    <!-- 任务列表 -->
    <div v-if="isLoading && tasks.length === 0" p-10 text-center>
      加载中...
    </div>
    <div v-else-if="tasks.length === 0" text-gray-500 p-10 text-center>
      暂无任务，快去创建一个吧！
    </div>
    <div v-else grid="~ cols-1 md:cols-2 lg:cols-3 gap-4">
      <div v-for="task in tasks" :key="task.id" class="p-4 border rounded-lg bg-white shadow dark:bg-gray-800">
        <h3 class="font-bold">
          {{ task.name }}
        </h3>
        <p class="text-sm text-gray-500">
          {{ task.mapType }}
        </p>
        <div
          class="text-xs mt-2 px-2 py-1 rounded-full inline-block"
          :class="{
            'bg-yellow-100 text-yellow-800': task.status === 'queued',
            'bg-blue-100 text-blue-800': task.status === 'running',
            'bg-green-100 text-green-800': task.status === 'completed',
            'bg-red-100 text-red-800': task.status === 'failed',
          }"
        >
          {{ task.status }}
        </div>
        <!-- 可以添加进度条等 -->
        <!-- 操作按钮区域 -->
        <div class="mt-4 pt-4 border-t border-gray-200 flex items-center justify-end space-x-2 dark:border-gray-700">
          <!-- 可以添加 '查看结果' 等按钮 -->
          <button
            class="icon-btn text-red-500 hover:text-red-700"
            :disabled="isDeleting === task.id"
            @click="handleDelete(task)"
          >
            <div v-if="isDeleting === task.id" i-carbon-circle-dash class="animate-spin" />
            <div v-else i-carbon-trash-can />
          </button>
        </div>
      </div>
    </div>

    <!-- 创建任务的弹窗/模态框 -->
    <div v-if="isFormVisible" bg="black/50" flex items-center inset-0 justify-center fixed z-50 @click.self="isFormVisible = false">
      <div class="rounded-lg bg-white max-h-[90vh] max-w-4xl w-full shadow-xl overflow-y-auto dark:bg-gray-900">
        <TaskForm @close="isFormVisible = false" />
      </div>
    </div>
  </div>
</template>
