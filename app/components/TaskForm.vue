<!-- app/components/TaskForm.vue -->
<script setup lang="ts">
import { estimateDiskSpace, estimateTileCount } from '~/utils/tile'

const emit = defineEmits(['close'])
const taskStore = useTaskStore()

const formData = reactive({
  name: '',
  description: '',
  mapType: 'google-satellite',
  bounds: {
    sw: { lat: 39.8, lng: 116.2 },
    ne: { lat: 40.0, lng: 116.5 },
  },
  zoomLevels: [14],
  concurrency: 5,
  downloadDelay: 0.2,
})

const mapTypes = [
  { value: 'google-satellite', label: '谷歌卫星地图' },
  { value: 'osm-standard', label: 'OpenStreetMap 标准图' },
  { value: 'osm-topo', label: 'OpenStreetMap 地形图' },
]
const availableZooms = Array.from({ length: 19 }, (_, i) => i + 1) // 1-19
function toggleZoom(zoom: number) {
  const index = formData.zoomLevels.indexOf(zoom)
  if (index > -1)
    formData.zoomLevels.splice(index, 1)
  else
    formData.zoomLevels.push(zoom)
  formData.zoomLevels.sort((a, b) => a - b)
}

async function handleSubmit() {
  try {
    await taskStore.createTask(JSON.parse(JSON.stringify(formData)))
    emit('close')
  }
  catch (error) {
    console.error('Submission failed', error)
  }
}

// --- 新增的计算属性 ---
const estimatedTiles = computed(() => {
  return estimateTileCount(formData.bounds, formData.zoomLevels)
})

const estimatedSpace = computed(() => {
  // 可以根据不同的地图类型设置不同的平均瓦片大小
  const avgSize = formData.mapType === 'google-satellite' ? 30 : 15 // 卫星图通常更大
  return estimateDiskSpace(estimatedTiles.value, avgSize)
})
</script>

<template>
  <form class="p-6 md:p-8" @submit.prevent="handleSubmit">
    <h2 class="text-2xl font-bold mb-8">
      创建新任务
    </h2>

    <!-- 使用 Grid 实现两列布局 -->
    <div class="gap-y-6 grid grid-cols-1 md:gap-x-8 md:grid-cols-2">
      <!-- 左列 -->
      <div class="space-y-6">
        <div>
          <label for="name" class="form-label">任务名称</label>
          <input id="name" v-model="formData.name" type="text" required class="form-input">
        </div>
        <div>
          <label for="description" class="form-label">描述 (可选)</label>
          <textarea id="description" v-model="formData.description" rows="3" class="form-input" />
        </div>
        <div>
          <label for="mapType" class="form-label">贴图类型</label>
          <select id="mapType" v-model="formData.mapType" class="form-select">
            <option v-for="mt in mapTypes" :key="mt.value" :value="mt.value">
              {{ mt.label }}
            </option>
          </select>
        </div>
      </div>

      <!-- 右列 -->
      <div class="space-y-6">
        <div>
          <label class="form-label">地理范围选择</label>
          <p class="text-xs text-gray-500 mb-2">
            移动和缩放地图，将目标区域置于中心虚线框内。
          </p>
          <ClientOnly>
            <MapSelector v-model="formData.bounds" />
          </ClientOnly>
        </div>
      </div>

      <!-- 跨两列的全宽部分 -->
      <div class="md:col-span-2">
        <label class="form-label">缩放级别 (可多选)</label>
        <div class="mt-2 gap-2 grid grid-cols-6 md:grid-cols-12 sm:grid-cols-10">
          <button
            v-for="zoom in availableZooms"
            :key="zoom"
            type="button"
            class="p-2 text-center border rounded-md transition-colors"
            :class="formData.zoomLevels.includes(zoom)
              ? 'bg-sky-600 text-white border-sky-600'
              : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'"
            @click="toggleZoom(zoom)"
          >
            {{ zoom }}
          </button>
        </div>
      </div>

      <div class="gap-x-8 gap-y-6 grid grid-cols-1 md:col-span-2 sm:grid-cols-2">
        <div>
          <label for="concurrency" class="form-label">并发数 ({{ formData.concurrency }})</label>
          <input id="concurrency" v-model.number="formData.concurrency" type="range" min="1" max="20" class="mt-2 appearance-none rounded-lg bg-gray-300 h-2 w-full cursor-pointer dark:bg-gray-700">
        </div>
        <div>
          <label for="downloadDelay" class="form-label">下载延迟 ({{ formData.downloadDelay.toFixed(1) }}s)</label>
          <input id="downloadDelay" v-model.number="formData.downloadDelay" type="range" min="0" max="5" step="0.1" class="mt-2 appearance-none rounded-lg bg-gray-300 h-2 w-full cursor-pointer dark:bg-gray-700">
        </div>
      </div>
    </div>

    <!-- 底部按钮和估算信息 -->
    <div class="mt-10 pt-6 border-t border-gray-200 flex items-center justify-between dark:border-gray-700">
      <!-- 左侧：估算信息 -->
      <div class="text-sm text-gray-600 dark:text-gray-400">
        <div class="flex items-center">
          <div i-carbon-calculation class="mr-2" />
          <span>预估瓦片总数: <strong class="text-sky-600 font-semibold dark:text-sky-500">{{ estimatedTiles.toLocaleString() }}</strong></span>
        </div>
        <div class="mt-1 flex items-center">
          <div i-carbon-data-base class="mr-2" />
          <span>预估磁盘占用: <strong class="text-sky-600 font-semibold dark:text-sky-500">{{ estimatedSpace }}</strong></span>
        </div>
      </div>

      <!-- 右侧：操作按钮 -->
      <div class="space-x-4">
        <button type="button" class="btn-secondary" @click="emit('close')">
          取消
        </button>
        <button type="submit" class="btn-primary" :disabled="taskStore.isLoading">
          {{ taskStore.isLoading ? '创建中...' : '创建任务' }}
        </button>
      </div>
    </div>
  </form>
</template>
