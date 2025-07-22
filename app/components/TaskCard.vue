<script setup lang="ts">
import type { Task } from '~/stores/task'

defineProps<{
  task: Task
  isStarting: boolean
  isRetrying: boolean
  isVerifying: boolean
  isRedownloading: boolean
  isDeleting: boolean
}>()

defineEmits<{
  (e: 'start', task: Task): void
  (e: 'retry', task: Task): void
  (e: 'verify', task: Task): void
  (e: 'redownload', task: Task): void
  (e: 'view', task: Task): void
  (e: 'edit', task: Task): void
  (e: 'copy', task: Task): void
  (e: 'delete', task: Task): void
}>()
</script>

<template>
  <div class="p-4 border rounded-lg bg-white flex flex-col shadow-md dark:border-gray-700 dark:bg-gray-800">
    <!-- 任务详情 -->
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
          {{ task.verificationStatus === 'running' ? 'Verifying' : task.status }}
        </div>
      </div>

      <!-- 下载进度条 -->
      <div v-if="task.status === 'running' || (task.status === 'completed' && task.progress! < 100)">
        <div class="text-sm text-gray-600 flex justify-between dark:text-gray-300">
          <span>下载进度</span>
          <span>{{ Math.round(task.progress || 0) }}%</span>
        </div>
        <div class="mt-1 rounded-full bg-gray-200 h-2 w-full dark:bg-gray-700">
          <div class="rounded-full bg-sky-600 h-2" :style="{ width: `${task.progress || 0}%` }" />
        </div>
        <div class="text-xs text-gray-500 mt-1 text-right dark:text-gray-400">
          {{ (task.completedTiles || 0).toLocaleString() }} / {{ (task.totalTiles || 0).toLocaleString() }} tiles
        </div>
      </div>

      <!-- 校验进度条 -->
      <div v-if="task.verificationStatus === 'running'">
        <div class="text-sm text-gray-600 flex justify-between dark:text-gray-300">
          <span>校验进度</span>
          <span>{{ Math.round(task.verificationProgress || 0) }}%</span>
        </div>
        <div class="mt-1 rounded-full bg-gray-200 h-2 w-full dark:bg-gray-700">
          <div class="rounded-full bg-indigo-600 h-2" :style="{ width: `${task.verificationProgress || 0}%` }" />
        </div>
        <div class="text-xs text-gray-500 mt-1 text-right dark:text-gray-400">
          {{ (task.verifiedTiles || 0).toLocaleString() }} verified / {{ (task.missingTiles || 0).toLocaleString() }} missing
        </div>
      </div>

      <!-- 校验结果 -->
      <div
        v-if="task.verificationStatus === 'completed' && task.missingTiles! > 0"
        class="text-sm text-orange-800 p-2 rounded bg-orange-100 dark:text-orange-300 dark:bg-orange-900/50"
      >
        校验完成: 发现
        <strong class="font-semibold">{{ task.missingTiles }}</strong>
        个缺失瓦片。
      </div>

      <div class="text-xs text-gray-400">
        创建于: {{ new Date(task.createdAt).toLocaleString() }}
      </div>
    </div>

    <!-- 操作按钮区域 -->
    <div class="mt-4 pt-3 border-t border-gray-200 flex items-center justify-end space-x-2 dark:border-gray-700">
      <!-- 启动按钮 -->
      <button
        v-if="task.status === 'queued'"
        class="icon-btn text-green-600 hover:text-green-700"
        :disabled="isStarting"
        title="启动任务"
        @click="$emit('start', task)"
      >
        <div v-if="isStarting" i-carbon-circle-dash class="animate-spin" />
        <div v-else i-carbon-play />
      </button>

      <!-- 重试按钮 -->
      <button
        v-if="task.status === 'failed'"
        class="icon-btn text-orange-600 hover:text-orange-700"
        :disabled="isRetrying"
        title="重试任务"
        @click="$emit('retry', task)"
      >
        <div v-if="isRetrying" i-carbon-circle-dash class="animate-spin" />
        <div v-else i-carbon-renew />
      </button>

      <!-- 校验和重新下载按钮 (核心修改区域) -->
      <template v-if="task.status === 'completed'">
        <!-- 重新下载按钮: 仅当校验完成且发现有缺失瓦片时显示 -->
        <button
          v-if="task.verificationStatus === 'completed' && task.missingTiles! > 0"
          class="icon-btn text-cyan-600 hover:text-cyan-700"
          :disabled="isRedownloading"
          title="重新下载缺失瓦片"
          @click="$emit('redownload', task)"
        >
          <div v-if="isRedownloading" i-carbon-circle-dash class="animate-spin" />
          <div v-else i-carbon-download />
        </button>

        <!-- 校验按钮: 始终显示，除非正在重新下载 -->
        <button
          class="icon-btn"
          :disabled="isVerifying || task.verificationStatus === 'running' || isRedownloading"
          title="校验文件完整性"
          @click="$emit('verify', task)"
        >
          <div v-if="isVerifying || task.verificationStatus === 'running'" i-carbon-circle-dash class="animate-spin" />
          <div v-else i-carbon-task-approved />
        </button>
      </template>

      <!-- 查看地图按钮 -->
      <NuxtLink
        v-if="task.status === 'completed'"
        :to="`/viewer/${task.id}`"
        class="icon-btn"
        title="查看地图"
        @click="$emit('view', task)"
      >
        <div i-carbon-map />
      </NuxtLink>

      <!-- 编辑按钮 -->
      <button
        class="icon-btn"
        :disabled="task.status === 'running' || task.verificationStatus === 'running'"
        title="编辑"
        @click="$emit('edit', task)"
      >
        <div i-carbon-edit />
      </button>

      <!-- 复制按钮 -->
      <button class="icon-btn" title="复制任务" @click="$emit('copy', task)">
        <div i-carbon-copy />
      </button>

      <!-- 删除按钮 -->
      <button
        class="icon-btn text-red-500 hover:text-red-700"
        :disabled="isDeleting || task.status === 'running' || task.verificationStatus === 'running'"
        title="删除"
        @click="$emit('delete', task)"
      >
        <div v-if="isDeleting" i-carbon-circle-dash class="animate-spin" />
        <div v-else i-carbon-trash-can />
      </button>
    </div>
  </div>
</template>
