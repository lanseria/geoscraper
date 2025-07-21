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
const editingTask = ref<Task | null>(null)
// --- 新增: 重试状态 ---
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
    // eslint-disable-next-line no-alert
    alert(`启动任务失败: ${error}`)
  }
  finally {
    isStarting.value = null
  }
}

// --- 新增: 处理重试 ---
async function handleRetry(task: Task) {
  isRetrying.value = task.id
  try {
    await taskStore.retryTask(task.id)
  }
  catch (error) {
    console.error(`重试任务 ${task.id} 失败`, error)
    // eslint-disable-next-line no-alert
    alert(`重试任务失败: ${error}`)
  }
  finally {
    isRetrying.value = null
  }
}

// --- 修改: 处理删除，增加选项 ---
async function handleDelete(task: Task) {
  const message = `确定要删除任务 "${task.name}" 吗？\n此操作不可逆。`
  const confirmed = window.confirm(message)
  if (confirmed) {
    // 这里我们用一个 prompt 来模拟带选项的对话框，更真实的应用会用UI库的模态框
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
    <!-- Header 和 代理状态 (保持不变) -->
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl font-bold">
        任务仪表盘
      </h1>
      <button class="btn-primary flex items-center" @click="openCreateForm">
        <div i-carbon-add mr-2 />
        创建新任务
      </button>
    </div>
    <!-- ... proxy status ... -->
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

    <!-- 任务列表 (保持不变) -->
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
        <!-- 任务详情 (保持不变) -->
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

        <!-- --- 修改: 操作按钮区域 --- -->
        <div class="mt-4 pt-3 border-t border-gray-200 flex items-center justify-end space-x-2 dark:border-gray-700">
          <button
            v-if="task.status === 'queued'"
            class="icon-btn text-green-600 hover:text-green-700"
            :disabled="isStarting === task.id" title="启动任务" @click="handleStart(task)"
          >
            <div v-if="isStarting === task.id" i-carbon-circle-dash class="animate-spin" />
            <div v-else i-carbon-play />
          </button>

          <!-- 新增: 重试按钮 -->
          <button
            v-if="task.status === 'failed'"
            class="icon-btn text-orange-600 hover:text-orange-700"
            :disabled="isRetrying === task.id" title="重试任务" @click="handleRetry(task)"
          >
            <div v-if="isRetrying === task.id" i-carbon-circle-dash class="animate-spin" />
            <div v-else i-carbon-renew />
          </button>

          <NuxtLink
            v-if="task.status === 'completed'"
            :to="`/viewer/${task.id}`" class="icon-btn" title="查看地图"
          >
            <div i-carbon-map />
          </NuxtLink>

          <button
            class="icon-btn"
            :disabled="task.status === 'running'" title="编辑" @click="openEditForm(task)"
          >
            <div i-carbon-edit />
          </button>

          <button class="icon-btn" title="复制任务" @click="handleCopy(task)">
            <div i-carbon-copy />
          </button>

          <button
            class="icon-btn text-red-500 hover:text-red-700"
            :disabled="isDeleting === task.id" title="删除" @click="handleDelete(task)"
          >
            <div v-if="isDeleting === task.id" i-carbon-circle-dash class="animate-spin" />
            <div v-else i-carbon-trash-can />
          </button>
        </div>
      </div>
    </div>

    <!-- 弹窗 (保持不变) -->
    <div v-if="isFormVisible" class="bg-black/50 flex items-center inset-0 justify-center fixed z-50" @click.self="closeForm">
      <div class="rounded-lg bg-white max-h-[90vh] max-w-4xl w-full shadow-xl overflow-y-auto dark:bg-gray-900">
        <TaskForm :initial-data="editingTask!" @close="closeForm" />
      </div>
    </div>
  </div>
</template>
