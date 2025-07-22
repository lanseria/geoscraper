<!-- app/pages/viewer/[id].vue -->
<script setup lang="ts">
import type { LngLatLike } from 'maplibre-gl'
import { Map, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// --- 1. 数据获取与状态管理 ---
const route = useRoute<'viewer-id'>()
const config = useRuntimeConfig()
const taskId = route.params.id as string

const { data: task, pending, error } = await useFetch(`/api/tasks/${taskId}`)

const mapContainer = ref<HTMLElement | null>(null)
const map = shallowRef<Map | null>(null)

// --- 2. 瓦片坐标 <-> 经纬度转换工具函数 ---
function tileToLon(x: number, z: number): number {
  return (x / (2 ** z)) * 360 - 180
}

function tileToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / (2 ** z)
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

// --- 3. 地图交互函数 (核心修改区域) ---
function zoomToLevel(zoom: number) {
  if (!map.value || !task.value)
    return

  const bounds = task.value.bounds
  // 计算 bounds 的中心点
  const centerLng = (bounds.sw.lng + bounds.ne.lng) / 2
  const centerLat = (bounds.sw.lat + bounds.ne.lat) / 2

  // 使用 flyTo 同时设置中心点和缩放级别
  map.value.flyTo({
    center: [centerLng, centerLat] as LngLatLike,
    zoom,
    duration: 1000,
  })
}

function flyToTile(tile: { z: number, x: number, y: number }) {
  if (!map.value)
    return

  const centerLon = tileToLon(tile.x + 0.5, tile.z) // 瓦片中心经度
  const centerLat = tileToLat(tile.y + 0.5, tile.z) // 瓦片中心纬度

  map.value.flyTo({
    center: [centerLon, centerLat] as LngLatLike,
    zoom: tile.z, // 飞过去后稍微放大一点，看得更清楚
    speed: 1.5,
  })
}

// --- 4. 生命周期与地图初始化 ---
onMounted(() => {
  watch(task, (newTask) => {
    if (newTask && mapContainer.value && !map.value) {
      const tileUrl = `${config.public.gisServerUrl}/${newTask.mapType}/{z}/{x}/{y}.png`
      const mapStyle: any = {
        version: 8,
        sources: {
          'local-tiles': {
            type: 'raster',
            tiles: [tileUrl],
            tileSize: 256,
            attribution: '© GeoScraper Local Cache',
            // 明确指定瓦片范围，地图库可以此优化
            bounds: [
              newTask.bounds.sw.lng,
              newTask.bounds.sw.lat,
              newTask.bounds.ne.lng,
              newTask.bounds.ne.lat,
            ],
          },
        },
        layers: [
          {
            id: 'tiles-layer',
            type: 'raster',
            source: 'local-tiles',
            minzoom: 0,
            maxzoom: 22,
          },
        ],
      }

      map.value = new Map({
        container: mapContainer.value,
        style: mapStyle,
        bounds: [
          [newTask.bounds.sw.lng, newTask.bounds.sw.lat],
          [newTask.bounds.ne.lng, newTask.bounds.ne.lat],
        ],
        fitBoundsOptions: { padding: 50 },
      })

      map.value.addControl(new NavigationControl({}), 'top-right')

      // 在地图上添加一个十字标记，用于指示 flyTo 的中心点
      map.value.on('load', () => {
        map.value!.addSource('flyto-marker', {
          type: 'geojson',
          data: { type: 'Point', coordinates: [0, 0] },
        })
        map.value!.addLayer({
          id: 'flyto-marker-layer',
          type: 'symbol',
          source: 'flyto-marker',
          layout: {
            'icon-image': 'marker-15', // 使用 maplibre 内置的图标
            'icon-size': 2,
            'icon-allow-overlap': true,
          },
          paint: {
            'icon-color': '#ff4d4d',
          },
        })
      })

      // 当 flyTo 动画结束时，更新标记位置
      map.value.on('moveend', () => {
        const center = map.value!.getCenter()
        const source = map.value!.getSource('flyto-marker') as any
        source.setData({ type: 'Point', coordinates: [center.lng, center.lat] })
      })
    }
  }, { immediate: true })
})

onUnmounted(() => {
  map.value?.remove()
})
</script>

<template>
  <div class="bg-gray-100 flex h-screen w-screen dark:bg-gray-900">
    <!-- 左侧信息面板 -->
    <aside class="p-6 bg-white flex flex-shrink-0 flex-col w-96 shadow-lg z-10 overflow-y-auto dark:bg-gray-800">
      <div v-if="pending" class="text-lg font-bold">
        <div i-carbon-circle-dash class="animate-spin" />
        加载中...
      </div>
      <div v-else-if="error" class="text-lg text-red-500 font-bold">
        加载任务失败
      </div>
      <template v-else-if="task">
        <!-- 标题和返回按钮 -->
        <div class="mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
          <h1 class="text-xl font-bold">
            地图详情
          </h1>
          <p class="text-sky-600 font-semibold dark:text-sky-500">
            {{ task.name }}
          </p>
          <NuxtLink to="/" class="btn-secondary mt-4 flex w-full items-center justify-center">
            <div i-carbon-arrow-left class="mr-2" />
            返回仪表盘
          </NuxtLink>
        </div>

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
            <span class="text-gray-500 dark:text-gray-400">缺失的瓦片数:</span>
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
              @click="zoomToLevel(zoom)"
            >
              {{ zoom }}
            </button>
          </div>
        </div>

        <!-- 缺失瓦片列表 -->
        <div class="mt-6 flex flex-grow flex-col min-h-0">
          <h2 class="text-lg font-semibold mb-2">
            缺失的瓦片 ({{ (task.missingTileList || []).length }})
          </h2>
          <div
            v-if="!task.missingTileList || task.missingTileList.length === 0"
            class="text-gray-500 p-4 text-center border-2 rounded-md border-dashed"
          >
            未发现缺失瓦片
          </div>
          <div v-else class="pr-2 flex-grow overflow-y-auto -mr-2">
            <div v-for="zoom in task.zoomLevels" :key="`missing-${zoom}`">
              <div v-if="task.missingTileList.some(t => t.z === zoom)">
                <h3 class="font-bold my-2 py-1 bg-white/80 top-0 sticky backdrop-blur-sm dark:bg-gray-800/80">
                  Zoom {{ zoom }}
                </h3>
                <div class="text-sm gap-2 grid grid-cols-3">
                  <button
                    v-for="tile in task.missingTileList.filter(t => t.z === zoom)"
                    :key="`${tile.z}-${tile.x}-${tile.y}`"
                    class="font-mono p-1 text-center rounded bg-red-100 transition-colors hover:text-white dark:bg-red-900/50 hover:bg-red-500 dark:hover:bg-red-600"
                    @click="flyToTile(tile)"
                  >
                    {{ tile.x }}, {{ tile.y }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </aside>

    <!-- 右侧地图区域 -->
    <main class="flex-grow relative">
      <div v-if="pending" class="flex h-full w-full items-center justify-center">
        <div i-carbon-circle-dash class="animate-spin" />
        正在加载任务数据...
      </div>
      <div v-else-if="error" class="text-red-500 flex h-full w-full items-center justify-center">
        错误: {{ error.message }}
      </div>
      <div ref="mapContainer" class="h-full w-full inset-0 absolute" />
    </main>
  </div>
</template>
