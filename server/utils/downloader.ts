import type { FetchOptions } from 'ofetch'
import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { env } from 'node:process'

const MAP_URL_TEMPLATES: Record<string, string> = {
  'google-satellite': 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
  'osm-standard': 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  'osm-topo': 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
}

/**
 * 下载单个瓦片并保存到文件系统。
 * @param tile - 瓦片坐标 { z, x, y }
 * @param task - 包含任务详情的对象
 * @returns 'downloaded' 或 'failed'
 */
export async function downloadTile(
  tile: { z: number, x: number, y: number },
  task: { id: number, mapType: string, downloadDelay: number },
): Promise<'downloaded' | 'failed' | 'skipped_404'> {
  const { z, x, y } = tile
  const { id: taskId, mapType, downloadDelay } = task

  const urlTemplate = MAP_URL_TEMPLATES[mapType]
  if (!urlTemplate) {
    console.error(`[Task ${taskId}] Unknown mapType: ${mapType}`)
    return 'failed'
  }

  const url = urlTemplate.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
  const storageRoot = env.STORAGE_ROOT || '/data/geoscraper-tiles'
  const saveDir = path.join(storageRoot, String(taskId), String(z), String(x))
  const filePath = path.join(saveDir, `${y}.png`)

  // --- ofetch 配置 ---
  const fetchOptions: FetchOptions<'arrayBuffer'> = {
    responseType: 'arrayBuffer',
    headers: { 'User-Agent': 'Mozilla/5.0' },
    retry: 3, // 最多重试3次
    retryDelay: 1000, // 初始重试延迟1秒
    retryStatusCodes: [408, 429, 500, 502, 503, 504, 522, 524],

    // --- 代理配置 ---
    // ofetch 会自动读取 http_proxy 和 https_proxy 环境变量，
    // 但为了明确和可定制，我们从自定义变量读取。
    // 使用 undici 的 dispatcher 来设置代理
    // 注意: 这需要 Node.js >= 18 和 undici (Nuxt 默认使用)
    ...(env.HTTP_PROXY_URL && {
      dispatcher: new (await import('undici')).ProxyAgent(env.HTTP_PROXY_URL),
    }),
  }

  try {
    // 如果设置了下载延迟，则在每次请求前等待
    if (downloadDelay > 0)
      await new Promise(resolve => setTimeout(resolve, downloadDelay * 1000))

    const imageBuffer = await $fetch(url, fetchOptions)

    await mkdir(saveDir, { recursive: true })
    await writeFile(filePath, Buffer.from(imageBuffer))

    return 'downloaded'
  }
  catch (error: any) {
    // --- 核心修改：在 catch 块中处理 404 ---
    // 检查错误是否是 ofetch 的 FetchError 并且状态码是 404
    if (error.statusCode === 404) {
      // 这是预期的行为（瓦片不存在），静默处理，不打印为错误
      // console.log(`[Task ${taskId}] Tile ${z}/${x}/${y} does not exist (404), skipping.`)
      return 'skipped_404' // 返回一个特定状态，表示是因404而跳过
    }

    // 对于其他错误（如 5xx、网络超时等），在重试后仍然失败，打印错误日志
    console.error(`[Task ${taskId}] Tile ${z}/${x}/${y} failed after all retries. Error: ${error.message}`)
    return 'failed'
  }
}
