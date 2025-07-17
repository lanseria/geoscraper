// server/utils/tile.ts

/**
 * 将经度转换为指定缩放级别的瓦片 X 坐标
 */
function lonToTileX(lon: number, zoom: number): number {
  return Math.floor((lon + 180) / 360 * (2 ** zoom))
}

/**
 * 将纬度转换为指定缩放级别的瓦片 Y 坐标
 */
function latToTileY(lat: number, zoom: number): number {
  return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * (2 ** zoom))
}

/**
 * 为给定的地理范围和缩放级别生成所有瓦片的坐标列表
 * @returns 一个包含 {z, x, y} 对象的数组
 */
export function calculateAllTiles(
  bounds: { sw: { lat: number, lng: number }, ne: { lat: number, lng: number } },
  zoomLevels: number[],
): { z: number, x: number, y: number }[] {
  const tilesToDownload = []
  for (const zoom of zoomLevels) {
    const minX = lonToTileX(bounds.sw.lng, zoom)
    const maxX = lonToTileX(bounds.ne.lng, zoom)
    const minY = latToTileY(bounds.ne.lat, zoom) // Y坐标北小南大
    const maxY = latToTileY(bounds.sw.lat, zoom)

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        tilesToDownload.push({ z: zoom, x, y })
      }
    }
  }
  return tilesToDownload
}
