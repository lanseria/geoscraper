<!-- app/pages/viewer/[id].vue -->
<script setup lang="ts">
import { Map, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const route = useRoute<'viewer-id'>()
const config = useRuntimeConfig()
const taskId = route.params.id as string

// 使用 useFetch 获取任务详情，这是 Nuxt 推荐的数据获取方式
const { data: task, pending, error } = await useFetch(`/api/tasks/${taskId}`)

const mapContainer = ref<HTMLElement | null>(null)
const map = shallowRef<Map | null>(null)

onMounted(() => {
  // 确保在 task 数据加载完毕后再初始化地图
  watch(task, (newTask) => {
    if (newTask && mapContainer.value && !map.value) {
      // 构造瓦片服务的 URL
      const tileUrl = `${config.public.gisServerUrl}/${newTask.mapType}/{z}/{x}/{y}.png`

      // 定义地图样式，数据源指向我们的瓦片服务
      const mapStyle: any = {
        version: 8,
        sources: {
          'local-tiles': {
            type: 'raster',
            tiles: [tileUrl],
            tileSize: 256,
            attribution: '© GeoScraper Local Cache',
          },
        },
        layers: [
          {
            id: 'tiles-layer',
            type: 'raster',
            source: 'local-tiles',
            minzoom: 0,
            maxzoom: 22, // 可以根据你的数据调整
          },
        ],
      }

      map.value = new Map({
        container: mapContainer.value,
        style: mapStyle,
        // 将地图视图自动缩放到任务的边界
        bounds: [
          [newTask.bounds.sw.lng, newTask.bounds.sw.lat],
          [newTask.bounds.ne.lng, newTask.bounds.ne.lat],
        ],
        fitBoundsOptions: {
          padding: 50, // 在边界周围留出一些边距
        },
      })

      map.value.addControl(new NavigationControl({}), 'top-right')
    }
  }, { immediate: true }) // immediate: true 确保初始加载时也执行
})

onUnmounted(() => {
  map.value?.remove()
})
</script>

<template>
  <div class="bg-gray-100 flex flex-col h-screen w-screen dark:bg-gray-900">
    <!-- Header -->
    <header class="p-4 bg-white flex shadow-md items-center justify-between z-10 dark:bg-gray-800">
      <div v-if="pending" class="text-lg font-bold">
        加载中...
      </div>
      <div v-else-if="error" class="text-lg text-red-500 font-bold">
        加载任务失败
      </div>
      <h1 v-else-if="task" class="text-lg font-bold">
        查看地图: <span class="text-sky-600">{{ task.name }}</span>
      </h1>

      <NuxtLink to="/" class="btn-secondary">
        ← 返回仪表盘
      </NuxtLink>
    </header>

    <!-- Map Area -->
    <main class="flex-grow relative">
      <div v-if="pending" class="flex h-full w-full items-center justify-center">
        正在加载任务数据...
      </div>
      <div v-else-if="error" class="text-red-500 flex h-full w-full items-center justify-center">
        错误: {{ error.message }}
      </div>
      <div ref="mapContainer" class="h-full w-full inset-0 absolute" />
    </main>
  </div>
</template>
