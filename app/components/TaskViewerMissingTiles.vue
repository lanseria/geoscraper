<script setup lang="ts">
import type { Task } from '~/stores/task'

interface Tile { z: number, x: number, y: number }

defineProps<{
  task: Task
  selectedTiles: Record<string, Tile>
  isSubmitting: boolean
}>()

const emit = defineEmits<{
  (e: 'fly-to', tile: Tile): void
  (e: 'toggle-tile', tile: Tile): void
  (e: 'toggle-all-for-zoom', zoom: number, event: Event): void
  (e: 'submit-selection'): void
}>()
</script>

<template>
  <div class="mt-6 flex flex-grow flex-col min-h-0">
    <div class="mb-2 flex items-center justify-between">
      <h2 class="text-lg font-semibold">
        缺失的瓦片 ({{ (task.missingTileList || []).length }})
      </h2>
      <!-- 提交按钮 -->
      <button
        v-if="task.missingTileList && task.missingTileList.length > 0"
        class="text-sm btn-primary px-2 py-1"
        :disabled="isSubmitting || Object.keys(selectedTiles).length === 0"
        @click="emit('submit-selection')"
      >
        <div v-if="isSubmitting" i-carbon-circle-dash class="mr-1 animate-spin" />
        标记为空白 ({{ Object.keys(selectedTiles).length }})
      </button>
    </div>

    <div
      v-if="!task.missingTileList || task.missingTileList.length === 0"
      class="text-gray-500 p-4 text-center border-2 rounded-md border-dashed"
    >
      <template v-if="task.verificationStatus === 'completed'">
        太棒了！未发现缺失瓦片。
      </template>
      <template v-else>
        请先返回仪表盘运行校验。
      </template>
    </div>
    <div v-else class="pr-2 flex-grow overflow-y-auto -mr-2">
      <div v-for="zoom in task.zoomLevels" :key="`missing-${zoom}`">
        <div v-if="task.missingTileList.some(t => t.z === zoom)">
          <div class="font-bold my-2 py-1 bg-white/80 flex items-center top-0 sticky backdrop-blur-sm dark:bg-gray-800/80">
            <h3 class="flex-grow">
              Zoom {{ zoom }}
            </h3>
            <label class="text-xs font-normal mr-2 flex cursor-pointer items-center">
              <input
                type="checkbox"
                class="text-sky-600 mr-1 border-gray-300 rounded h-4 w-4 focus:ring-sky-500"
                :checked="task.missingTileList.filter(t => t.z === zoom).every(t => selectedTiles[`${t.z}-${t.x}-${t.y}`])"
                @change="emit('toggle-all-for-zoom', zoom, $event)"
              >
              全选
            </label>
          </div>
          <div class="text-sm gap-1 grid grid-cols-1">
            <label
              v-for="tile in task.missingTileList.filter(t => t.z === zoom)"
              :key="`${tile.z}-${tile.x}-${tile.y}`"
              class="p-1.5 rounded flex cursor-pointer transition-colors items-center"
              :class="selectedTiles[`${tile.z}-${tile.x}-${tile.y}`] ? 'bg-red-200 dark:bg-red-800/50' : 'hover:bg-gray-100 dark:hover:bg-gray-700'"
            >
              <input
                type="checkbox"
                class="text-sky-600 mr-3 border-gray-300 rounded h-4 w-4 focus:ring-sky-500"
                :checked="!!selectedTiles[`${tile.z}-${tile.x}-${tile.y}`]"
                @change="emit('toggle-tile', tile)"
              >
              <span
                class="font-mono flex-grow"
                @click.prevent.stop="emit('fly-to', tile)"
              >
                {{ tile.x }}, {{ tile.y }}
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
