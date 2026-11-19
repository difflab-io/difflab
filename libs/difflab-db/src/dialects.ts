import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { BunSqliteDialect } from 'kysely-bun-worker/normal'
import pg from 'pg'
import { lstatOrNull } from 'utils/fsx'
import { DifflabDbError } from './errors.js'
import type { DifflabDatabase } from './schema.js'

// Types -----------------------------------------------------------------------
export type DatabaseConfig =
  { dialect: 'sqlite'; path: string } | { dialect: 'postgres'; connectionString: string }

// API -------------------------------------------------------------------------
export async function openKysely(
  config: DatabaseConfig,
  options: { createSqlite?: boolean } = {},
): Promise<Kysely<DifflabDatabase> | null> {
  if (config.dialect === 'sqlite') {
    const createSqlite = options.createSqlite ?? false
    const existing = await lstatOrNull(config.path)
    if (existing && (!existing.isFile() || existing.isSymbolicLink())) {
      throw new DifflabDbError(`Refusing non-regular SQLite database path: ${config.path}`)
    }
    if (!existing && !createSqlite) return null
    if (createSqlite) {
      await mkdir(dirname(config.path), { recursive: true })
    }
    const db = new Kysely<DifflabDatabase>({
      dialect: new BunSqliteDialect({
        url: config.path,
        dbOptions: { create: createSqlite, strict: true },
      }),
    })
    try {
      await sql`PRAGMA journal_mode = WAL`.execute(db)
      await sql`PRAGMA foreign_keys = ON`.execute(db)
      await sql`PRAGMA busy_timeout = 5000`.execute(db)
      return db
    } catch (error) {
      await db.destroy()
      throw error
    }
  }

  const pool = new pg.Pool({ connectionString: config.connectionString })
  return new Kysely<DifflabDatabase>({
    dialect: new PostgresDialect({ pool }),
  })
}

export function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  if ('code' in error && error.code === '23505') return true
  return (
    error instanceof Error &&
    /SQLITE_CONSTRAINT|UNIQUE constraint failed|duplicate key value/i.test(error.message)
  )
}
