<!-- app/pages/index.vue -->
<script setup lang="ts">
const taskStore = useTaskStore()
const { tasks, isLoading } = storeToRefs(taskStore)

const isFormVisible = ref(false)
</script>

<template>
  <div p-8>
    <div mb-6 flex items-center justify-between>
      <h1 text-2xl font-bold>
        任务仪表盘
      </h1>
      <button class="btn flex items-center" @click="isFormVisible = true">
        <div i-carbon-add mr-2 />
        创建新任务
      </button>
    </div>

    <!-- 任务列表 -->
    <div v-if="isLoading && tasks.length === 0" p-10 text-center>
      加载中...
    </div>
    <div v-else-if="tasks.length === 0" text-gray-500 p-10 text-center>
      暂无任务，快去创建一个吧！
    </div>
    <div v-else grid="~ cols-1 md:cols-2 lg:cols-3 gap-4">
      <div v-for="task in tasks" :key="task.id" class="p-4 border rounded-lg bg-white shadow dark:bg-gray-800">
        <h3 class="font-bold">
          {{ task.name }}
        </h3>
        <p class="text-sm text-gray-500">
          {{ task.mapType }}
        </p>
        <div
          class="text-xs mt-2 px-2 py-1 rounded-full inline-block"
          :class="{
            'bg-yellow-100 text-yellow-800': task.status === 'queued',
            'bg-blue-100 text-blue-800': task.status === 'running',
            'bg-green-100 text-green-800': task.status === 'completed',
            'bg-red-100 text-red-800': task.status === 'failed',
          }"
        >
          {{ task.status }}
        </div>
        <!-- 可以添加进度条等 -->
      </div>
    </div>

    <!-- 创建任务的弹窗/模态框 (简单实现) -->
    <div v-if="isFormVisible" bg="black/50" flex items-center inset-0 justify-center fixed @click.self="isFormVisible = false">
      <div class="rounded-lg bg-white max-w-lg w-full shadow-xl dark:bg-gray-900">
        <TaskForm @close="isFormVisible = false" />
      </div>
    </div>
  </div>
</template>
