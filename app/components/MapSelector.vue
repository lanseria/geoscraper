<!-- app/components/MapSelector.vue -->
<script setup lang="ts">
import type { LngLatBoundsLike } from 'maplibre-gl'
import { Map, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

interface Bounds {
  sw: { lat: number, lng: number }
  ne: { lat: number, lng: number }
}

const props = defineProps<{
  modelValue: Bounds
}>()

const emit = defineEmits(['update:modelValue'])

const config = useRuntimeConfig()
const mapContainer = ref<HTMLElement | null>(null)
const map = shallowRef<Map | null>(null)

const mapStyle = `https://api.maptiler.com/maps/satellite/style.json?key=${config.public.maptilerKey}`
const SELECTION_SOURCE_ID = 'selection-source'

// 将 bounds 对象转换为 GeoJSON Polygon 特征
function boundsToGeoJSON(bounds: Bounds): any {
  const { sw, ne } = bounds
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [sw.lng, sw.lat],
        [ne.lng, sw.lat],
        [ne.lng, ne.lat],
        [sw.lng, ne.lat],
        [sw.lng, sw.lat],
      ]],
    },
    properties: {},
  }
}

// 更新地图上的选区图层
function updateSelectionFeature(bounds: Bounds) {
  const source = map.value?.getSource(SELECTION_SOURCE_ID) as any
  if (source)
    source.setData(boundsToGeoJSON(bounds))
}

// 当地图移动或缩放结束后，更新父组件的 modelValue
function onMapMoveEnd() {
  if (!map.value)
    return

  const mapBounds = map.value.getBounds()
  const newBounds: Bounds = {
    sw: { lat: mapBounds.getSouth(), lng: mapBounds.getWest() },
    ne: { lat: mapBounds.getNorth(), lng: mapBounds.getEast() },
  }
  emit('update:modelValue', newBounds)
}

onMounted(() => {
  if (!mapContainer.value)
    return

  // 将 props.modelValue 转换为 maplibre 能识别的 LngLatBoundsLike 格式
  const initialBounds: LngLatBoundsLike = [
    [props.modelValue.sw.lng, props.modelValue.sw.lat],
    [props.modelValue.ne.lng, props.modelValue.ne.lat],
  ]

  map.value = new Map({
    container: mapContainer.value,
    style: mapStyle,
    bounds: initialBounds, // 直接在初始化时设定边界
    fitBoundsOptions: {
      padding: 60, // 在边界周围留出一些边距
    },
  })

  map.value.addControl(new NavigationControl({}), 'top-right')

  map.value.on('load', () => {
    // 添加 GeoJSON source 用于存储选区
    map.value!.addSource(SELECTION_SOURCE_ID, {
      type: 'geojson',
      data: boundsToGeoJSON(props.modelValue), // 初始数据
    })

    // 添加图层来渲染选区的填充色
    map.value!.addLayer({
      id: 'selection-fill',
      type: 'fill',
      source: SELECTION_SOURCE_ID,
      paint: {
        'fill-color': '#38bdf8', // sky-500
        'fill-opacity': 0.3,
      },
    })

    // 添加图层来渲染选区的边框
    map.value!.addLayer({
      id: 'selection-outline',
      type: 'line',
      source: SELECTION_SOURCE_ID,
      paint: {
        'line-color': '#0284c7', // sky-600
        'line-width': 2,
        'line-dasharray': [2, 1],
      },
    })
  })

  // 监听地图移动结束事件
  map.value.on('moveend', onMapMoveEnd)
})

// 监听 props.modelValue 的变化，确保地图选区与数据同步
watch(() => props.modelValue, (newBounds) => {
  if (map.value)
    updateSelectionFeature(newBounds)
}, { deep: true })

onUnmounted(() => {
  map.value?.remove()
})
</script>

<template>
  <div ref="mapContainer" class="rounded-md h-80 w-full relative" />
</template>
