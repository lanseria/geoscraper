<!-- eslint-disable no-alert -->
<!-- app/pages/viewer/[id].vue -->
<script setup lang="ts">
import type { Feature, FeatureCollection, Polygon } from 'geojson'
import type { LngLatLike } from 'maplibre-gl'
import { Map, NavigationControl } from 'maplibre-gl'
import TaskViewerHeader from '~/components/TaskViewerHeader.vue'
import TaskViewerInfo from '~/components/TaskViewerInfo.vue'
import TaskViewerMissingTiles from '~/components/TaskViewerMissingTiles.vue'
import 'maplibre-gl/dist/maplibre-gl.css'

// --- 1. 数据获取与状态管理 ---
const config = useRuntimeConfig()
const route = useRoute<'viewer-id'>()
const taskId = route.params.id as string
const { data: task, pending, error, refresh } = await useFetch<Task>(`/api/tasks/${taskId}`)

const mapContainer = ref<HTMLElement | null>(null)
const map = shallowRef<Map | null>(null)
const selectedTiles = ref<Record<string, { z: number, x: number, y: number }>>({})
const isSubmitting = ref(false)

// --- 2. 瓦片坐标 <-> 经纬度转换工具函数 ---
function tileToLon(x: number, z: number): number { return (x / (2 ** z)) * 360 - 180 }
function tileToLat(y: number, z: number): number { const n = Math.PI - (2 * Math.PI * y) / (2 ** z); return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))) }

// --- 新增: 将瓦片列表转换为 GeoJSON 的函数 ---
function tilesToGeoJSON(tiles: { z: number, x: number, y: number }[]): FeatureCollection<Polygon> {
  const features: Feature<Polygon>[] = tiles.map((tile) => {
    const { z, x, y } = tile
    // 计算瓦片四个角的经纬度
    const ne_lon = tileToLon(x + 1, z)
    const ne_lat = tileToLat(y, z)
    const sw_lon = tileToLon(x, z)
    const sw_lat = tileToLat(y + 1, z)

    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [sw_lon, sw_lat],
          [ne_lon, sw_lat],
          [ne_lon, ne_lat],
          [sw_lon, ne_lat],
          [sw_lon, sw_lat],
        ]],
      },
      properties: {
        zoom: z, // 将 zoom 级别作为属性，用于地图渲染
      },
    }
  })

  return { type: 'FeatureCollection', features }
}

// --- 3. 事件处理函数 (从子组件接收事件) ---
function handleZoomTo(zoom: number) {
  if (!map.value || !task.value)
    return
  const bounds = task.value.bounds
  const centerLng = (bounds.sw.lng + bounds.ne.lng) / 2
  const centerLat = (bounds.sw.lat + bounds.ne.lat) / 2
  map.value.flyTo({ center: [centerLng, centerLat] as LngLatLike, zoom, duration: 1000 })
}

function handleFlyTo(tile: { z: number, x: number, y: number }) {
  if (!map.value)
    return
  const centerLon = tileToLon(tile.x + 0.5, tile.z)
  const centerLat = tileToLat(tile.y + 0.5, tile.z)
  map.value.flyTo({ center: [centerLon, centerLat] as LngLatLike, zoom: tile.z + 2, speed: 1.5 })
}

function handleToggleTile(tile: { z: number, x: number, y: number }) {
  const key = `${tile.z}-${tile.x}-${tile.y}`
  if (selectedTiles.value[key])
    delete selectedTiles.value[key]
  else
    selectedTiles.value[key] = tile
}

function handleToggleAllForZoom(zoom: number, event: Event) {
  if (!task.value)
    return
  const isChecked = (event.target as HTMLInputElement).checked
  const tilesInZoom = (task.value.missingTileList || []).filter(t => t.z === zoom)
  for (const tile of tilesInZoom) {
    const key = `${tile.z}-${tile.x}-${tile.y}`
    if (isChecked)
      selectedTiles.value[key] = tile
    else if (selectedTiles.value[key])
      delete selectedTiles.value[key]
  }
}

async function handleSubmitSelection() {
  const tilesToMark = Object.values(selectedTiles.value)
  if (tilesToMark.length === 0) {
    alert('请至少选择一个瓦片。')
    return
  }
  isSubmitting.value = true
  try {
    await apiFetch(`/tasks/${taskId}/mark-non-existent`, {
      method: 'POST',
      body: { tilesToMark },
    })
    selectedTiles.value = {}
    refresh()
  }
  catch (err: any) {
    console.error('Failed to mark tiles:', err)
    alert(`操作失败: ${err.data?.message || err.message}`)
  }
  finally {
    isSubmitting.value = false
  }
}
// --- 4. 生命周期与地图初始化 ---
onMounted(() => {
  watch(task, (newTask) => {
    // 确保有任务数据和 DOM 容器
    if (!newTask || !mapContainer.value)
      return

    // --- A. 地图初始化 (只执行一次) ---
    if (!map.value) {
      const tileUrl = `${config.public.gisServerUrl}/${newTask.mapType}/{z}/{x}/{y}.png`
      const mapStyle: any = {
        version: 8,
        glyphs: `https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=${config.public.maptilerKey}`,
        sources: {
          'local-tiles': {
            type: 'raster',
            tiles: [tileUrl],
            tileSize: 256,
            attribution: '© GeoScraper Local Cache',
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

      map.value.on('load', () => {
        // 在地图加载后，定义好所有需要的 source 和 layer

        // flyto-marker source 和 layer
        map.value!.addSource('flyto-marker', {
          type: 'geojson',
          data: { type: 'Point', coordinates: [0, 0] },
        })
        map.value!.addLayer({
          id: 'flyto-marker-layer',
          type: 'symbol',
          source: 'flyto-marker',
          layout: { 'icon-image': 'marker-15', 'icon-size': 2, 'icon-allow-overlap': true },
          paint: { 'icon-color': '#ff4d4d' },
        })

        // missing-tiles-source 和 layers
        map.value!.addSource('missing-tiles-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }, // 初始为空
        })
        map.value!.addLayer({
          id: 'missing-tiles-fill',
          type: 'fill',
          source: 'missing-tiles-source',
          paint: { 'fill-color': '#ff4d4d', 'fill-opacity': 0.3 },
        })
        map.value!.addLayer({
          id: 'missing-tiles-outline',
          type: 'line',
          source: 'missing-tiles-source',
          paint: { 'line-color': '#ff4d4d', 'line-width': 1 },
        })
        map.value!.addLayer({
          id: 'missing-tiles-label',
          type: 'symbol',
          source: 'missing-tiles-source',
          layout: { 'text-field': ['get', 'zoom'], 'text-size': 14, 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'], 'text-allow-overlap': true },
          paint: { 'text-color': '#ffffff', 'text-halo-color': '#000000', 'text-halo-width': 1 },
        })

        // --- 核心修改点 1: 在 load 事件中，为首次加载填充数据 ---
        // 这样可以确保地图一出来就显示正确的缺失瓦片
        const source = map.value!.getSource('missing-tiles-source') as any
        const geojsonData = tilesToGeoJSON(newTask.missingTileList || [])
        if (source)
          source.setData(geojsonData)
      })

      map.value.on('moveend', () => {
        const center = map.value!.getCenter()
        const source = map.value!.getSource('flyto-marker') as any
        source.setData({ type: 'Point', coordinates: [center.lng, center.lat] })
      })
    }

    // --- B. 地图数据更新 (每次 task 变化时都执行) ---
    // 核心修改点 2: 将更新逻辑放在 watch 的主干上
    // 确保地图已加载完成且 source 已存在
    if (map.value && map.value.isStyleLoaded()) {
      const source = map.value.getSource('missing-tiles-source') as any
      const geojsonData = tilesToGeoJSON(newTask.missingTileList || [])
      // 检查 source 是否存在，以防万一
      if (source)
        source.setData(geojsonData)
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
        <TaskViewerHeader :task="task" />
        <TaskViewerInfo :task="task" @zoom-to="handleZoomTo" />
        <TaskViewerMissingTiles
          :task="task"
          :selected-tiles="selectedTiles"
          :is-submitting="isSubmitting"
          @fly-to="handleFlyTo"
          @toggle-tile="handleToggleTile"
          @toggle-all-for-zoom="handleToggleAllForZoom"
          @submit-selection="handleSubmitSelection"
        />
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
