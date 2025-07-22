<script setup lang="ts">
import type { Task } from '~/stores/task'

defineProps<{
  task: Task
}>()
</script>

<template>
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
</template>
