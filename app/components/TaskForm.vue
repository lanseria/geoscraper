<!-- app/components/TaskForm.vue -->
<script setup lang="ts">
const emit = defineEmits(['close'])
const taskStore = useTaskStore()
const formData = reactive({
  name: '',
  description: '',
  mapType: 'google-satellite',
  // 暂时用静态数据，后续替换为地图选择
  bounds: {
    sw: { lat: 39.8, lng: 116.2 },
    ne: { lat: 40.0, lng: 116.5 },
  },
  zoomLevels: [14, 15],
  concurrency: 5,
  downloadDelay: 0.2,
})

const mapTypes = [
  { value: 'google-satellite', label: '谷歌卫星地图' },
  { value: 'osm-standard', label: 'OpenStreetMap 标准图' },
  { value: 'osm-topo', label: 'OpenStreetMap 地形图' },
]

async function handleSubmit() {
  try {
    await taskStore.createTask(formData)
    // 可以在这里显示成功消息
    emit('close') // 关闭表单/弹窗
  }
  catch (error) {
    // 处理API返回的错误，例如显示错误提示
    console.error('Submission failed', error)
  }
}
</script>

<template>
  <form p-6 @submit.prevent="handleSubmit">
    <h2 text-xl font-bold mb-4>
      创建新任务
    </h2>
    <div space-y-4>
      <div>
        <label for="name" text-sm font-medium block>任务名称</label>
        <input id="name" v-model="formData.name" type="text" required class="mt-1 border-gray-300 rounded-md w-full block shadow-sm dark:border-gray-600 dark:bg-gray-800">
      </div>
      <div>
        <label for="mapType" text-sm font-medium block>贴图类型</label>
        <select id="mapType" v-model="formData.mapType" class="mt-1 border-gray-300 rounded-md w-full block shadow-sm dark:border-gray-600 dark:bg-gray-800">
          <option v-for="mt in mapTypes" :key="mt.value" :value="mt.value">
            {{ mt.label }}
          </option>
        </select>
      </div>
      <!-- 更多表单项，如 description, zoomLevels 等 -->
      <div>
        <p text-sm>
          地理范围 (临时): {{ formData.bounds }}
        </p>
        <p text-sm>
          缩放级别 (临时): {{ formData.zoomLevels }}
        </p>
      </div>
    </div>
    <div mt-6 flex justify-end space-x-3>
      <button type="button" class="btn bg-gray-500 hover:bg-gray-600" @click="emit('close')">
        取消
      </button>
      <button type="submit" class="btn" :disabled="taskStore.isLoading">
        {{ taskStore.isLoading ? '创建中...' : '创建任务' }}
      </button>
    </div>
  </form>
</template>
