import { defineConfig } from 'drizzle-kit'

// API -------------------------------------------------------------------------
export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
})
