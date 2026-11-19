import { configureLogging, getLogger } from 'utils/logx'
import { migrateDatabase } from './migrations.js'

// Constants -------------------------------------------------------------------
const logger = getLogger(['db', 'migrate'])

// API -------------------------------------------------------------------------
export async function runPostgresMigrations(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  configureLogging({ level: 'info', format: 'jsonl' })
  const connectionString = env.DATABASE_URL?.trim()
  if (!connectionString) {
    throw new Error('DATABASE_URL must be set to run PostgreSQL migrations')
  }
  const applied = await migrateDatabase({
    dialect: 'postgres',
    connectionString,
  })
  logger.info('difflab-db.migrate.completed', {
    dialect: 'postgres',
    applied,
  })
}

if (import.meta.main) {
  runPostgresMigrations().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('difflab-db.migrate.error', { message })
    process.exit(1)
  })
}
