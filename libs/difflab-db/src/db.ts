import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { resolveDifflabPaths, resolveDifflabPathsFromRoot } from 'difflab-config'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { BunSqliteDialect } from 'kysely-bun-worker/normal'
import pg from 'pg'
import { lstatOrNull } from 'utils/fsx'
import { getLogger } from 'utils/logx'
import { DifflabDbError } from './errors.js'
import { seedFromLegacyIfPresent } from './legacy-seed.js'
import { assertSchemaReady, migrateDatabase, MigrationError } from './migrations.js'
import { createGitRemoteQueries } from './queries/git-remotes.js'
import { createProjectQueries } from './queries/projects.js'
import { createUserQueries } from './queries/users.js'
import { createWorkspaceQueries } from './queries/workspaces.js'
import type { DifflabDatabase } from './schema/index.js'
import type { DatabaseConfig } from './types.js'

// Constants -------------------------------------------------------------------
const logger = getLogger('db')

// Types -----------------------------------------------------------------------
export interface DifflabDb {
  projects: ReturnType<typeof createProjectQueries>
  gitRemotes: ReturnType<typeof createGitRemoteQueries>
  workspaces: ReturnType<typeof createWorkspaceQueries>
  users: ReturnType<typeof createUserQueries>
  close: () => Promise<void>
}

// API -------------------------------------------------------------------------
export function resolveDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const connectionString = env.DATABASE_URL?.trim()
  if (connectionString) {
    return { dialect: 'postgres', connectionString }
  }
  return { dialect: 'sqlite', path: resolveDifflabPaths(undefined, env).database }
}

export async function connect(
  config: DatabaseConfig = resolveDatabaseConfig(),
  options: { createSqlite?: boolean } = {},
): Promise<Kysely<DifflabDatabase> | null> {
  if (config.dialect === 'sqlite') {
    return await connectSqlite(config.path, options)
  }
  return connectPg(config.connectionString)
}

export async function createDifflabDb(
  config: DatabaseConfig = resolveDatabaseConfig(),
): Promise<DifflabDb> {
  const db = await connect(config, { createSqlite: false })
  if (!db) {
    throw new MigrationError(
      `SQLite database does not exist: ${config.dialect === 'sqlite' ? config.path : ''}`,
    )
  }
  try {
    await assertSchemaReady(db, config.dialect)
  } catch (error) {
    await db.destroy()
    throw error
  }
  return {
    projects: createProjectQueries(db),
    gitRemotes: createGitRemoteQueries(db),
    workspaces: createWorkspaceQueries(db, config.dialect),
    users: createUserQueries(db, config.dialect),
    close: () => db.destroy(),
  }
}

export async function openLocalDifflabDb(stateDir?: string): Promise<DifflabDb> {
  const paths = stateDir ? resolveDifflabPathsFromRoot(stateDir) : resolveDifflabPaths()
  const existing = await lstatOrNull(paths.database)
  if (!existing) {
    const applied = await migrateDatabase({ dialect: 'sqlite', path: paths.database })
    const db = await createDifflabDb({ dialect: 'sqlite', path: paths.database })
    try {
      const seeded = await seedFromLegacyIfPresent(db, paths.legacyDatabase)
      logger.info('difflab-db.local.initialized', {
        path: paths.database,
        applied,
        seeded_projects: seeded,
      })
      return db
    } catch (error) {
      await db.close()
      throw error
    }
  }

  return await createDifflabDb({ dialect: 'sqlite', path: paths.database })
}

export function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  if ('code' in error && error.code === '23505') return true
  return (
    error instanceof Error &&
    /SQLITE_CONSTRAINT|UNIQUE constraint failed|duplicate key value/i.test(error.message)
  )
}

// Helpers ---------------------------------------------------------------------
async function connectSqlite(
  sqlitePath: string,
  options: { createSqlite?: boolean } = {},
): Promise<Kysely<DifflabDatabase> | null> {
  const createSqlite = options.createSqlite ?? false
  const existing = await lstatOrNull(sqlitePath)
  if (existing && (!existing.isFile() || existing.isSymbolicLink())) {
    throw new DifflabDbError(`Refusing non-regular SQLite database path: ${sqlitePath}`)
  }
  if (!existing && !createSqlite) return null
  if (createSqlite) {
    await mkdir(dirname(sqlitePath), { recursive: true })
  }
  const db = new Kysely<DifflabDatabase>({
    dialect: new BunSqliteDialect({
      url: sqlitePath,
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

function connectPg(connectionString: string): Kysely<DifflabDatabase> {
  const pool = new pg.Pool({ connectionString })
  return new Kysely<DifflabDatabase>({
    dialect: new PostgresDialect({ pool }),
  })
}
