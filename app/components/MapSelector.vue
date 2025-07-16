<!-- app/components/MapSelector.vue -->
<script setup lang="ts">
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

onMounted(() => {
  if (!mapContainer.value)
    return

  const initialState = {
    lng: props.modelValue.sw.lng,
    lat: props.modelValue.sw.lat,
    zoom: 7,
  }

  map.value = new Map({
    container: mapContainer.value,
    style: mapStyle,
    center: [initialState.lng, initialState.lat],
    zoom: initialState.zoom,
  })

  map.value.addControl(new NavigationControl({}), 'top-right')

  // 添加一个简单的方框来可视化选择的区域
  const box = document.createElement('div')
  box.style.border = '2px dashed #fff'
  box.style.position = 'absolute'
  box.style.pointerEvents = 'none' // 让鼠标事件穿透
  map.value.getCanvasContainer().appendChild(box)

  function updateBox() {
    if (!map.value)
      return
    const canvas = map.value.getCanvas()
    const width = canvas.clientWidth
    const height = canvas.height
    // 这里我们简单地在中心画一个 50% 宽高的框
    const boxSize = 0.5
    box.style.width = `${width * boxSize}px`
    box.style.height = `${height * boxSize}px`
    box.style.left = `${(width * (1 - boxSize)) / 2}px`
    box.style.top = `${(height * (1 - boxSize)) / 2}px`
  }

  function onMapMoveEnd() {
    if (!map.value)
      return
    const bounds = map.value.getBounds()
    const newBounds: Bounds = {
      sw: { lat: bounds.getSouth(), lng: bounds.getWest() },
      ne: { lat: bounds.getNorth(), lng: bounds.getEast() },
    }
    // 简单地取地图可视范围的中心 50% 区域作为选择范围
    const center = map.value.getCenter()
    const latSpan = (newBounds.ne.lat - newBounds.sw.lat) * 0.25
    const lngSpan = (newBounds.ne.lng - newBounds.sw.lng) * 0.25

    emit('update:modelValue', {
      sw: { lat: center.lat - latSpan, lng: center.lng - lngSpan },
      ne: { lat: center.lat + latSpan, lng: center.lng + lngSpan },
    })
  }

  map.value.on('load', updateBox)
  map.value.on('resize', updateBox)
  map.value.on('moveend', onMapMoveEnd)
})

onUnmounted(() => {
  map.value?.remove()
})
</script>

<template>
  <div ref="mapContainer" class="rounded-md h-80 w-full relative" />
</template>
