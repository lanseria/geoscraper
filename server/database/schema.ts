// server/database/schema.ts
import { jsonb, pgSchema, real, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core'

// 使用 'geoscraper' 作为 schema 名称
export const geoscraperSchema = pgSchema('geoscraper')

export const tasks = geoscraperSchema.table('tasks', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 256 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).default('queued').notNull(), // queued, running, completed, failed
  mapType: varchar('map_type', { length: 50 }).notNull(), // google-satellite, osm-standard, etc.

  // 地理范围，使用 jsonb 存储西南角和东北角
  bounds: jsonb('bounds').$type<{ sw: { lat: number, lng: number }, ne: { lat: number, lng: number } }>().notNull(),
  // 缩放级别，使用 jsonb 存储数组
  zoomLevels: jsonb('zoom_levels').$type<number[]>().notNull(),

  // 高级设置
  concurrency: real('concurrency').default(5).notNull(),
  downloadDelay: real('download_delay').default(0.2).notNull(), // in seconds

  // 统计信息
  progress: real('progress').default(0),
  totalTiles: real('total_tiles').default(0),
  completedTiles: real('completed_tiles').default(0),

  // --- 校验相关字段 ---
  verificationStatus: varchar('verification_status', { length: 50 }).default('none').notNull(), // none, running, completed
  verificationProgress: real('verification_progress').default(0),
  verifiedTiles: real('verified_tiles').default(0),
  missingTiles: real('missing_tiles').default(0),
  missingTileList: jsonb('missing_tile_list').$type<{ z: number, x: number, y: number }[]>(),

  // 时间戳
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
