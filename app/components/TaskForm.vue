<!-- eslint-disable no-console -->
<!-- app/components/TaskForm.vue -->
<script setup lang="ts">
import type { tasks } from '~~/server/database/schema'
import { estimateDiskSpace, estimateTileCount } from '~/utils/tile'

type Task = typeof tasks.$inferSelect

const props = defineProps<{
  // --- 新增: 接收一个可选的初始任务数据，用于编辑模式 ---
  initialData?: Task
}>()

const emit = defineEmits(['close'])
const taskStore = useTaskStore()

// --- 修改: 基于 props 初始化表单数据 ---
const isEditMode = computed(() => !!props.initialData)

const defaultFormData = {
  name: '',
  description: '',
  mapType: 'google-satellite',
  bounds: {
    sw: { lat: 29.779905422695972, lng: 121.42487982827588 },
    ne: { lat: 30.985718769126667, lng: 123.17218493203195 },
  },
  zoomLevels: [10],
  concurrency: 5,
  downloadDelay: 0.2,
}

const formData = reactive({ ...defaultFormData })

function populateForm(data: any) {
  formData.name = data.name
  formData.description = data.description || ''
  formData.mapType = data.mapType
  formData.bounds = data.bounds
  formData.zoomLevels = data.zoomLevels
  formData.concurrency = data.concurrency
  formData.downloadDelay = data.downloadDelay
}

onMounted(() => {
  // --- 修改: 根据模式填充表单 ---
  if (isEditMode.value && props.initialData) {
    // 编辑模式: 只填充 name 和 description
    formData.name = props.initialData.name
    formData.description = props.initialData.description || ''
  }
  else if (taskStore.taskToCopy) {
    // 复制模式
    const copiedTask = { ...taskStore.taskToCopy }
    copiedTask.name = `Copy of ${copiedTask.name}`
    populateForm(copiedTask)
    taskStore.setTaskToCopy(null) // 用完后清空
  }
})

const errors = ref<Record<string, string>>({})

const mapTypes = [
  { value: 'google-satellite', label: '谷歌卫星地图' },
  { value: 'osm-standard', label: 'OpenStreetMap 标准图' },
  { value: 'osm-topo', label: 'OpenStreetMap 地形图' },
]
const availableZooms = Array.from({ length: 19 }, (_, i) => i + 1)

function toggleZoom(zoom: number) {
  const index = formData.zoomLevels.indexOf(zoom)
  if (index > -1)
    formData.zoomLevels.splice(index, 1)
  else
    formData.zoomLevels.push(zoom)
  formData.zoomLevels.sort((a, b) => a - b)
  if (errors.value.zoomLevels)
    delete errors.value.zoomLevels
}

watch(() => formData.name, () => {
  if (errors.value.name)
    delete errors.value.name
})

async function handleSubmit() {
  errors.value = {}
  try {
    // --- 修改: 根据模式调用不同的 store action ---
    if (isEditMode.value && props.initialData) {
      await taskStore.updateTask(props.initialData.id, {
        name: formData.name,
        description: formData.description,
      })
    }
    else {
      await taskStore.createTask(JSON.parse(JSON.stringify(formData)))
    }
    emit('close')
  }
  catch (error: any) {
    if (error.data && Array.isArray(error.data)) {
      const newErrors: Record<string, string> = {}
      for (const err of error.data) {
        const fieldName = err.path[0]
        if (fieldName && !newErrors[fieldName])
          newErrors[fieldName] = err.message
      }
      errors.value = newErrors
    }
    else {
      errors.value.general = '操作失败，请检查网络或稍后重试。'
    }
  }
}

const estimatedTiles = computed(() => {
  return estimateTileCount(formData.bounds, formData.zoomLevels)
})
const estimatedSpace = computed(() => {
  const avgSize = formData.mapType === 'google-satellite' ? 30 : 15
  return estimateDiskSpace(estimatedTiles.value, avgSize)
})
</script>

<template>
  <form class="p-6 md:p-8" @submit.prevent="handleSubmit">
    <h2 class="text-2xl font-bold mb-8">
      <!-- 修改: 动态标题 -->
      {{ isEditMode ? '编辑任务' : '创建新任务' }}
    </h2>

    <!--
      修改:
      - 编辑模式下，禁用大部分字段的输入
      - 使用 <fieldset :disabled="isEditMode"> 来包裹不可编辑的部分
    -->
    <div class="gap-y-6 grid grid-cols-1 md:gap-x-8 md:grid-cols-2">
      <!-- 左列 -->
      <div class="space-y-6">
        <div>
          <label for="name" class="form-label">任务名称</label>
          <input
            id="name"
            v-model="formData.name"
            type="text"
            required
            class="form-input"
            :class="{ 'border-red-500 focus:border-red-500 focus:ring-red-500/50': errors.name }"
          >
          <p v-if="errors.name" class="text-sm text-red-600 mt-1">
            {{ errors.name }}
          </p>
        </div>
        <div>
          <label for="description" class="form-label">描述 (可选)</label>
          <textarea id="description" v-model="formData.description" rows="3" class="form-input" />
          <p v-if="errors.description" class="text-sm text-red-600 mt-1">
            {{ errors.description }}
          </p>
        </div>
        <!-- 仅在创建模式下显示 -->
        <div v-if="!isEditMode">
          <label for="mapType" class="form-label">贴图类型</label>
          <select
            id="mapType"
            v-model="formData.mapType"
            class="form-select"
            :class="{ 'border-red-500 focus:border-red-500 focus:ring-red-500/50': errors.mapType }"
            :disabled="isEditMode"
          >
            <option v-for="mt in mapTypes" :key="mt.value" :value="mt.value">
              {{ mt.label }}
            </option>
          </select>
          <p v-if="errors.mapType" class="text-sm text-red-600 mt-1">
            {{ errors.mapType }}
          </p>
        </div>
      </div>

      <!-- 右列 (仅创建模式显示) -->
      <div v-if="!isEditMode" class="space-y-6">
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

      <!-- 跨两列的全宽部分 (仅创建模式显示) -->
      <div v-if="!isEditMode" class="md:col-span-2">
        <label class="form-label" :class="{ 'text-red-600': errors.zoomLevels }">
          缩放级别 (可多选)
        </label>
        <div class="mt-2 gap-2 grid grid-cols-6 md:grid-cols-12 sm:grid-cols-10">
          <button
            v-for="zoom in availableZooms"
            :key="zoom"
            type="button"
            class="p-2 text-center border rounded-md transition-colors"
            :class="[
              formData.zoomLevels.includes(zoom)
                ? 'bg-sky-600 text-white border-sky-600'
                : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700',
              { '!border-red-500': errors.zoomLevels },
            ]"
            @click="toggleZoom(zoom)"
          >
            {{ zoom }}
          </button>
        </div>
        <p v-if="errors.zoomLevels" class="text-sm text-red-600 mt-1">
          {{ errors.zoomLevels }}
        </p>
      </div>

      <!-- 其他设置 (仅创建模式显示) -->
      <div v-if="!isEditMode" class="gap-x-8 gap-y-6 grid grid-cols-1 md:col-span-2 sm:grid-cols-2">
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
      <div class="text-sm text-gray-600 dark:text-gray-400">
        <p v-if="errors.general" class="text-sm text-red-600 font-semibold mb-2">
          {{ errors.general }}
        </p>
        <!-- 估算信息仅在创建模式下显示 -->
        <template v-if="!isEditMode">
          <div class="flex items-center">
            <div i-carbon-calculation class="mr-2" />
            <span>预估瓦片总数: <strong class="text-sky-600 font-semibold dark:text-sky-500">{{ estimatedTiles.toLocaleString() }}</strong></span>
          </div>
          <div class="mt-1 flex items-center">
            <div i-carbon-data-base class="mr-2" />
            <span>预估磁盘占用: <strong class="text-sky-600 font-semibold dark:text-sky-500">{{ estimatedSpace }}</strong></span>
          </div>
        </template>
      </div>

      <div class="space-x-4">
        <button type="button" class="btn-secondary" @click="emit('close')">
          取消
        </button>
        <button type="submit" class="btn-primary" :disabled="taskStore.isLoading">
          <!-- 修改: 动态按钮文本 -->
          {{ isEditMode ? '保存更改' : '创建任务' }}
        </button>
      </div>
    </div>
  </form>
</template>
