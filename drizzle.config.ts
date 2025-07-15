// drizzle.config.ts
import { env } from 'node:process'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './server/database/schema.ts',
  out: './server/database/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.NUXT_DB_URL!,
  },
  verbose: true,
  strict: true,
})
