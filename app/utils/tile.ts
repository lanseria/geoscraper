// app/utils/tile.ts

/**
 * 将经度转换为指定缩放级别的瓦片 X 坐标
 * @param lon 经度 (-180 to 180)
 * @param zoom 缩放级别
 */
function lonToTileX(lon: number, zoom: number): number {
  return Math.floor((lon + 180) / 360 * (2 ** zoom))
}

/**
 * 将纬度转换为指定缩放级别的瓦片 Y 坐标
 * @param lat 纬度 (-85.0511 to 85.0511)
 * @param zoom 缩放级别
 */
function latToTileY(lat: number, zoom: number): number {
  return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * (2 ** zoom))
}

/**
 * 估算所需下载的瓦片总数
 * @param bounds 地理范围 { sw: { lat, lng }, ne: { lat, lng } }
 * @param zoomLevels 要下载的缩放级别数组
 * @returns 瓦片总数
 */
export function estimateTileCount(
  bounds: { sw: { lat: number, lng: number }, ne: { lat: number, lng: number } },
  zoomLevels: number[],
): number {
  if (!bounds || zoomLevels.length === 0)
    return 0

  let totalCount = 0

  for (const zoom of zoomLevels) {
    const minX = lonToTileX(bounds.sw.lng, zoom)
    const maxX = lonToTileX(bounds.ne.lng, zoom)
    const minY = latToTileY(bounds.ne.lat, zoom) // 注意：Y坐标北小南大
    const maxY = latToTileY(bounds.sw.lat, zoom)

    const count = (maxX - minX + 1) * (maxY - minY + 1)
    if (count > 0)
      totalCount += count
  }

  return totalCount
}

/**
 * 估算磁盘空间占用
 * @param tileCount 瓦片总数
 * @param avgTileSizeInKB 每个瓦片的平均大小 (KB)，卫星图通常较大
 * @returns 格式化后的磁盘空间字符串 (e.g., "1.25 GB")
 */
export function estimateDiskSpace(tileCount: number, avgTileSizeInKB = 25): string {
  if (tileCount === 0)
    return '0 MB'

  const totalKB = tileCount * avgTileSizeInKB
  const totalMB = totalKB / 1024
  const totalGB = totalMB / 1024

  if (totalGB >= 1)
    return `${totalGB.toFixed(2)} GB`

  if (totalMB >= 1)
    return `${totalMB.toFixed(2)} MB`

  return `${totalKB.toFixed(2)} KB`
}
