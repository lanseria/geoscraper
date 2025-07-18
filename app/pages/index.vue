<!-- app/pages/index.vue -->
<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useTaskStore } from '~/stores/task'

const taskStore = useTaskStore()
const { tasks, isLoading, proxyStatus } = storeToRefs(taskStore)

onMounted(() => {
  taskStore.initializeSSE()
  // 页面加载时立即检查一次代理状态
  taskStore.checkProxyStatus()
})

onUnmounted(() => {
  taskStore.closeSSE()
})

const isFormVisible = ref(false)
const isDeleting = ref<number | null>(null)

async function handleDelete(task: any) {
  // eslint-disable-next-line no-alert
  const confirmed = window.confirm(`确定要删除任务 "${task.name}" 吗？\n此操作不可逆，但不会删除已下载的瓦片文件。`)

  if (confirmed) {
    isDeleting.value = task.id
    try {
      await taskStore.deleteTask(task.id)
    }
    catch (error) {
      console.error('删除任务失败', error)
    }
    finally {
      isDeleting.value = null
    }
  }
}
</script>

<template>
  <div class="p-4 md:p-8">
    <!-- Header -->
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl font-bold">
        任务仪表盘
      </h1>
      <button class="btn-primary flex items-center" @click="isFormVisible = true">
        <div i-carbon-add mr-2 />
        创建新任务
      </button>
    </div>

    <!-- 新增: 代理状态检查区域 -->
    <div class="text-sm mb-6 rounded-lg">
      <!-- 正在检查状态 -->
      <div v-if="proxyStatus === null" class="text-gray-500 flex items-center">
        <div i-carbon-circle-dash class="mr-2 animate-spin" />
        正在检查网络代理状态...
      </div>
      <!-- 代理正常状态 -->
      <div v-else-if="proxyStatus.ok" class="text-green-800 p-4 rounded-lg bg-green-100 flex items-center dark:text-green-300 dark:bg-green-900/50">
        <div i-carbon-checkmark-outline class="mr-2 flex-shrink-0" />
        <div>
          <span class="font-semibold">网络代理正常。</span>
          <span class="text-xs ml-2 opacity-80">(检查于 {{ proxyStatus.checkedAt }})</span>
        </div>
      </div>
      <!-- 代理异常状态 -->
      <div v-else class="text-red-800 p-4 rounded-lg bg-red-100 dark:text-red-300 dark:bg-red-900/50">
        <div class="flex items-center">
          <div i-carbon-warning-alt class="mr-2 flex-shrink-0" />
          <span class="font-semibold">网络代理连接失败。</span>
          <button class="icon-btn ml-auto" @click="taskStore.checkProxyStatus()">
            <div i-carbon-renew title="重试" />
          </button>
        </div>
        <p class="text-xs mt-2 pl-6 opacity-90">
          错误信息: {{ proxyStatus.error }}
          <span class="ml-2 opacity-80">(检查于 {{ proxyStatus.checkedAt }})</span>
        </p>
        <p class="text-xs mt-1 pl-6 opacity-70">
          这可能会导致下载任务失败，请检查您的网络环境或 `.env` 文件中的 `HTTP_PROXY_URL` 配置。
        </p>
      </div>
    </div>

    <!-- 任务列表 -->
    <div v-if="isLoading && tasks.length === 0" class="text-gray-500 p-10 text-center">
      <div i-carbon-circle-dash class="mx-auto mb-2 animate-spin" />
      连接中，正在获取任务列表...
    </div>
    <div v-else-if="tasks.length === 0" class="text-gray-500 p-10 text-center border-2 border-gray-300 rounded-lg border-dashed dark:border-gray-700">
      <div i-carbon-document-blank class="text-4xl mx-auto mb-4 opacity-50" />
      暂无任务，快去创建一个吧！
    </div>
    <div v-else grid="~ cols-1 md:cols-2 lg:cols-3 gap-6">
      <div v-for="task in tasks" :key="task.id" class="p-4 border rounded-lg bg-white flex flex-col shadow-md dark:border-gray-700 dark:bg-gray-800">
        <div class="flex-grow space-y-3">
          <div class="flex items-start justify-between">
            <div>
              <h3 class="text-lg font-bold">
                {{ task.name }}
              </h3>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                {{ task.description || '无描述' }}
              </p>
            </div>
            <div
              class="text-xs font-semibold ml-2 mt-1 px-2 py-1 rounded-full flex-shrink-0 inline-block whitespace-nowrap"
              :class="{
                'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300': task.status === 'queued',
                'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300': task.status === 'running',
                'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300': task.status === 'completed',
                'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300': task.status === 'failed',
              }"
            >
              {{ task.status }}
            </div>
          </div>

          <!-- 进度条和详细信息 -->
          <div v-if="task.status === 'running' || task.status === 'completed'">
            <div class="text-sm text-gray-600 flex justify-between dark:text-gray-300">
              <span>进度</span>
              <span>{{ Math.round(task.progress || 0) }}%</span>
            </div>
            <div class="mt-1 rounded-full bg-gray-200 h-2 w-full dark:bg-gray-700">
              <div class="rounded-full bg-sky-600 h-2" :style="{ width: `${task.progress || 0}%` }" />
            </div>
            <div class="text-xs text-gray-500 mt-1 text-right dark:text-gray-400">
              {{ (task.completedTiles || 0).toLocaleString() }} / {{ (task.totalTiles || 0).toLocaleString() }} tiles
            </div>
          </div>

          <div class="text-xs text-gray-400">
            创建于: {{ new Date(task.createdAt).toLocaleString() }}
          </div>
        </div>

        <div class="mt-4 pt-3 border-t border-gray-200 flex items-center justify-end space-x-2 dark:border-gray-700">
          <NuxtLink
            v-if="task.status === 'completed'"
            :to="`/viewer/${task.id}`"
            class="icon-btn"
            title="查看地图"
          >
            <div i-carbon-map />
          </NuxtLink>

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

    <!-- (弹窗部分不变) -->
    <div v-if="isFormVisible" class="bg-black/50 flex items-center inset-0 justify-center fixed z-50" @click.self="isFormVisible = false">
      <div class="rounded-lg bg-white max-h-[90vh] max-w-4xl w-full shadow-xl overflow-y-auto dark:bg-gray-900">
        <TaskForm @close="isFormVisible = false" />
      </div>
    </div>
  </div>
</template>
