// server/database/schema.ts
import { relations } from 'drizzle-orm'
import { integer, jsonb, pgEnum, pgSchema, real, serial, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'

export const geoscraperSchema = pgSchema('geoscraper')

// --- 定义瓦片类型的枚举 ---
export const tileTypeEnum = pgEnum('tile_type', ['missing', 'non-existent'])

// --- 创建新的 task_tiles 表 ---

export const tasks = geoscraperSchema.table('tasks', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 256 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).default('queued').notNull(),
  mapType: varchar('map_type', { length: 50 }).notNull(),
  bounds: jsonb('bounds').$type<{ sw: { lat: number, lng: number }, ne: { lat: number, lng: number } }>().notNull(),
  zoomLevels: jsonb('zoom_levels').$type<number[]>().notNull(),
  concurrency: real('concurrency').default(5).notNull(),
  downloadDelay: real('download_delay').default(0.2).notNull(),
  progress: real('progress').default(0),
  totalTiles: real('total_tiles').default(0),
  completedTiles: real('completed_tiles').default(0),
  verificationStatus: varchar('verification_status', { length: 50 }).default('none').notNull(),
  verificationProgress: real('verification_progress').default(0),
  verifiedTiles: real('verified_tiles').default(0),
  missingTiles: real('missing_tiles').default(0),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const taskTiles = geoscraperSchema.table('task_tiles', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  z: integer('z').notNull(),
  x: integer('x').notNull(),
  y: integer('y').notNull(),
  type: tileTypeEnum('type').notNull(),
},
// --- 核心修改 [2]: 添加复合唯一约束 ---
(table) => {
  return {
    uniqueTilePerTask: uniqueIndex('unique_tile_per_task').on(table.taskId, table.z, table.x, table.y),
  }
})

// --- 定义两个表之间的关系 ---
export const tasksRelations = relations(tasks, ({ many }) => ({
  tiles: many(taskTiles),
}))

export const taskTilesRelations = relations(taskTiles, ({ one }) => ({
  task: one(tasks, {
    fields: [taskTiles.taskId],
    references: [tasks.id],
  }),
}))
