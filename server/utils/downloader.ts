// server/utils/downloader.ts
import { Buffer } from 'node:buffer'
import { mkdir, stat, writeFile } from 'node:fs/promises' // 引入 stat
import path from 'node:path'

const MAP_URL_TEMPLATES: Record<string, string> = {
  'google-satellite': 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
  'osm-standard': 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  'osm-topo': 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
}

/**
 * 下载单个瓦片并保存到文件系统。
 * @param tile - 瓦片坐标 { z, x, y }
 * @param task - 包含任务详情的对象
 * @returns 'downloaded', 'failed', 'skipped_404', 或 'skipped_exists'
 */
export async function downloadTile(
  tile: { z: number, x: number, y: number },
  task: { id: number, mapType: string, downloadDelay: number },
): Promise<'downloaded' | 'failed' | 'skipped_404' | 'skipped_exists'> { // --- 1. 新增返回类型
  const config = useRuntimeConfig()
  const { z, x, y } = tile
  const { id: taskId, mapType, downloadDelay } = task

  const urlTemplate = MAP_URL_TEMPLATES[mapType]
  if (!urlTemplate) {
    console.error(`[Task ${taskId}] Unknown mapType: ${mapType}`)
    return 'failed'
  }

  const url = urlTemplate.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))

  // --- 2. 核心修改: 改变路径拼接方式 ---
  const storageRoot = config.storageRoot || '/data/geoscraper-tiles'
  const saveDir = path.join(storageRoot, mapType, String(z), String(x)) // 使用 mapType 替代 taskId
  const filePath = path.join(saveDir, `${y}.png`)

  // --- 3. 核心修改: 检查文件是否已存在且有效 ---
  try {
    const fileStats = await stat(filePath)
    // 如果文件存在且大小大于0，则视为有效，直接跳过
    if (fileStats.size > 0)
      return 'skipped_exists'
    // 如果文件大小为0，则视为破损文件，继续执行下载以覆盖它
  }
  catch (error: any) {
    // 如果错误不是 "文件未找到" (ENOENT)，则记录错误并失败。
    // 这可以捕获权限问题等其他文件系统错误。
    if (error.code !== 'ENOENT') {
      console.error(`[Task ${taskId}] Error checking file ${filePath}:`, error)
      return 'failed'
    }
    // 如果是 ENOENT 错误，说明文件不存在，这是正常情况，继续执行下载。
  }

  // --- ofetch 配置 (保持不变) ---
  const fetchOptions: any = {
    responseType: 'arrayBuffer',
    headers: { 'User-Agent': 'Mozilla/5.0' },
    retry: 3,
    retryDelay: 1000,
    retryStatusCodes: [408, 429, 500, 502, 503, 504, 522, 524],
    ...(config.proxyUrl && {
      dispatcher: new (await import('undici')).ProxyAgent(config.proxyUrl),
    }),
  }

  try {
    if (downloadDelay > 0)
      await new Promise(resolve => setTimeout(resolve, downloadDelay * 1000))

    const imageBuffer: any = await $fetch(url, fetchOptions)

    await mkdir(saveDir, { recursive: true })
    await writeFile(filePath, Buffer.from(imageBuffer))

    return 'downloaded'
  }
  catch (error: any) {
    if (error.statusCode === 404) {
      return 'skipped_404'
    }
    console.error(`[Task ${taskId}] Tile ${z}/${x}/${y} failed after all retries. Error: ${error.message}`)
    return 'failed'
  }
}
