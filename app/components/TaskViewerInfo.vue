<script setup lang="ts">
import type { Task } from '~/stores/task'

defineProps<{
  task: Task
}>()

const emit = defineEmits<{
  (e: 'zoom-to', zoom: number): void
}>()
</script>

<template>
  <div>
    <!-- 任务基本信息 -->
    <div class="text-sm space-y-3">
      <h2 class="text-lg font-semibold mb-2">
        任务信息
      </h2>
      <div class="flex justify-between">
        <span class="text-gray-500 dark:text-gray-400">地图类型:</span>
        <strong>{{ task.mapType }}</strong>
      </div>
      <div class="flex justify-between">
        <span class="text-gray-500 dark:text-gray-400">并发数:</span>
        <strong>{{ task.concurrency }}</strong>
      </div>
      <div class="flex justify-between">
        <span class="text-gray-500 dark:text-gray-400">下载延迟:</span>
        <strong>{{ task.downloadDelay }}s</strong>
      </div>
      <div class="flex justify-between">
        <span class="text-gray-500 dark:text-gray-400">总瓦片数:</span>
        <strong>{{ (task.totalTiles || 0).toLocaleString() }}</strong>
      </div>
    </div>

    <!-- 缩放级别 -->
    <div class="mt-6">
      <h2 class="text-lg font-semibold mb-2">
        缩放级别
      </h2>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="zoom in task.zoomLevels"
          :key="zoom"
          class="text-sm font-semibold px-3 py-1 rounded-md bg-gray-200 transition-colors hover:text-white dark:bg-gray-700 hover:bg-sky-500 dark:hover:bg-sky-600"
          @click="emit('zoom-to', zoom)"
        >
          {{ zoom }}
        </button>
      </div>
    </div>
  </div>
</template>
