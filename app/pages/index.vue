<!-- eslint-disable no-alert -->
<!-- app/pages/index.vue -->
<script setup lang="ts">
import type { Task } from '~/stores/task'
import { storeToRefs } from 'pinia'
import { useTaskStore } from '~/stores/task'

const taskStore = useTaskStore()
const { tasks, isLoading, proxyStatus } = storeToRefs(taskStore)

onMounted(() => {
  taskStore.initializeSSE()
  taskStore.checkProxyStatus()
})

onUnmounted(() => {
  taskStore.closeSSE()
})

const isFormVisible = ref(false)
const isDeleting = ref<number | null>(null)
const isStarting = ref<number | null>(null)
const isVerifying = ref<number | null>(null)
const isRedownloading = ref<number | null>(null)
const editingTask = ref<Task | null>(null)
const isRetrying = ref<number | null>(null)

function openCreateForm() {
  editingTask.value = null
  isFormVisible.value = true
}

function openEditForm(task: Task) {
  editingTask.value = task
  isFormVisible.value = true
}

function handleCopy(task: Task) {
  taskStore.setTaskToCopy(task)
  openCreateForm()
}

async function handleStart(task: Task) {
  isStarting.value = task.id
  try {
    await taskStore.startTask(task.id)
  }
  catch (error) {
    console.error(`启动任务 ${task.id} 失败`, error)
    alert(`启动任务失败: ${error}`)
  }
  finally {
    isStarting.value = null
  }
}

async function handleVerify(task: Task) {
  isVerifying.value = task.id
  try {
    await taskStore.verifyTask(task.id)
  }
  catch (error) {
    alert(`启动校验失败: ${error}`)
  }
  finally {
    isVerifying.value = null
  }
}

async function handleRedownload(task: Task) {
  isRedownloading.value = task.id
  try {
    await taskStore.redownloadMissing(task.id)
  }
  catch (error) {
    alert(`开始重新下载失败: ${error}`)
  }
  finally {
    isRedownloading.value = null
  }
}

async function handleRetry(task: Task) {
  isRetrying.value = task.id
  try {
    await taskStore.retryTask(task.id)
  }
  catch (error) {
    console.error(`重试任务 ${task.id} 失败`, error)
    alert(`重试任务失败: ${error}`)
  }
  finally {
    isRetrying.value = null
  }
}

async function handleDelete(task: Task) {
  const message = `确定要删除任务 "${task.name}" 吗？\n此操作不可逆。`
  const confirmed = window.confirm(message)
  if (confirmed) {
    const promptResponse = prompt(`要同时删除此任务相关的瓦片文件吗？\n这将释放磁盘空间，但可能影响其他共享此地图类型的任务。\n\n输入 "DELETE" 确认删除文件，否则只删除任务记录。`)
    const shouldDeleteFiles = promptResponse === 'DELETE'

    isDeleting.value = task.id
    try {
      await taskStore.deleteTask(task.id, shouldDeleteFiles)
    }
    catch (error) {
      console.error('删除任务失败', error)
      alert(`删除任务失败: ${error}`)
    }
    finally {
      isDeleting.value = null
    }
  }
}

function closeForm() {
  isFormVisible.value = false
  editingTask.value = null
}
</script>

<template>
  <div class="p-4 md:p-8">
    <!-- Header 和代理状态 (保持不变) -->
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl font-bold">
        任务仪表盘
      </h1>
      <button class="btn-primary flex items-center" @click="openCreateForm">
        <div i-carbon-add mr-2 />
        创建新任务
      </button>
    </div>
    <div class="text-sm mb-6 rounded-lg">
      <div v-if="proxyStatus === null" class="text-gray-500 flex items-center">
        <div i-carbon-circle-dash class="mr-2 animate-spin" />
        正在检查网络代理状态...
      </div>
      <div v-else-if="proxyStatus.ok" class="text-green-800 p-4 rounded-lg bg-green-100 flex items-center dark:text-green-300 dark:bg-green-900/50">
        <div i-carbon-checkmark-outline class="mr-2 flex-shrink-0" />
        <div>
          <span class="font-semibold">网络代理正常。</span>
          <span class="text-xs ml-2 opacity-80">(检查于 {{ proxyStatus.checkedAt }})</span>
        </div>
      </div>
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

    <!-- 任务列表 (已重构) -->
    <div v-if="isLoading && tasks.length === 0" class="text-gray-500 p-10 text-center">
      <div i-carbon-circle-dash class="mx-auto mb-2 animate-spin" />
      连接中，正在获取任务列表...
    </div>
    <div v-else-if="tasks.length === 0" class="text-gray-500 p-10 text-center border-2 border-gray-300 rounded-lg border-dashed dark:border-gray-700">
      <div i-carbon-document-blank class="text-4xl mx-auto mb-4 opacity-50" />
      暂无任务，快去创建一个吧！
    </div>
    <div v-else grid="~ cols-1 md:cols-2 lg:cols-3 gap-6">
      <TaskCard
        v-for="task in tasks"
        :key="task.id"
        :task="task"
        :is-starting="isStarting === task.id"
        :is-retrying="isRetrying === task.id"
        :is-verifying="isVerifying === task.id"
        :is-redownloading="isRedownloading === task.id"
        :is-deleting="isDeleting === task.id"
        @start="handleStart"
        @retry="handleRetry"
        @verify="handleVerify"
        @redownload="handleRedownload"
        @edit="openEditForm"
        @copy="handleCopy"
        @delete="handleDelete"
      />
    </div>

    <!-- 弹窗 (保持不变) -->
    <div v-if="isFormVisible" class="bg-black/50 flex items-center inset-0 justify-center fixed z-50">
      <div class="rounded-lg bg-white max-h-[90vh] max-w-4xl w-full shadow-xl overflow-y-auto dark:bg-gray-900">
        <TaskForm :initial-data="editingTask!" @close="closeForm" />
      </div>
    </div>
  </div>
</template>
