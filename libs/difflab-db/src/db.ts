import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { DifflabConfig, type ApiMode } from 'difflab-config'
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

// Constants -------------------------------------------------------------------
const logger = getLogger('db')

// Types -----------------------------------------------------------------------
/** Connection target for opening or migrating a SQLite or PostgreSQL Difflab database. */
export type DatabaseConfig =
  { dialect: 'sqlite'; path: string } | { dialect: 'postgres'; connectionString: string }

/** Options for opening a `DifflabDb` according to local or cloud runtime mode. */
export type OpenDifflabDbOptions = {
  mode?: ApiMode
  stateDir?: string
  env?: NodeJS.ProcessEnv
}

// API -------------------------------------------------------------------------
/** Dual-dialect Difflab database client grouping projects, Git remotes, workspaces, and users queries. */
export class DifflabDb {
  readonly projects: ReturnType<typeof createProjectQueries>
  readonly gitRemotes: ReturnType<typeof createGitRemoteQueries>
  readonly workspaces: ReturnType<typeof createWorkspaceQueries>
  readonly users: ReturnType<typeof createUserQueries>
  private readonly kysely: Kysely<DifflabDatabase>

  private constructor(kysely: Kysely<DifflabDatabase>, dialect: DatabaseConfig['dialect']) {
    this.kysely = kysely
    this.projects = createProjectQueries(kysely)
    this.gitRemotes = createGitRemoteQueries(kysely)
    this.workspaces = createWorkspaceQueries(kysely, dialect)
    this.users = createUserQueries(kysely, dialect)
  }

  /** Resolve a `DatabaseConfig` from `DATABASE_URL` or `DIFFLAB_HOME`. */
  static resolveConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
    const config = DifflabConfig.load({ env })
    if (config.databaseUrl) {
      return { dialect: 'postgres', connectionString: config.databaseUrl }
    }
    return { dialect: 'sqlite', path: config.paths.database }
  }

  /** Open a raw Kysely handle for SQLite or PostgreSQL without running migrations. */
  static async connect(
    config: DatabaseConfig = DifflabDb.resolveConfig(),
    options: { createSqlite?: boolean } = {},
  ): Promise<Kysely<DifflabDatabase> | null> {
    if (config.dialect === 'sqlite') {
      return await connectSqlite(config.path, options)
    }
    return connectPg(config.connectionString)
  }

  /** Apply all pending dialect-applicable migrations to `config`. */
  static migrate(config?: DatabaseConfig): Promise<string[]> {
    return migrateDatabase(config)
  }

  /** Open an already-migrated `DifflabDb` for `config`, failing if schema migrations are missing. */
  static async fromConfig(config: DatabaseConfig = DifflabDb.resolveConfig()): Promise<DifflabDb> {
    const kysely = await DifflabDb.connect(config, { createSqlite: false })
    if (!kysely) {
      throw new MigrationError(
        `SQLite database does not exist: ${config.dialect === 'sqlite' ? config.path : ''}`,
      )
    }
    try {
      await assertSchemaReady(kysely, config.dialect)
    } catch (error) {
      await kysely.destroy()
      throw error
    }
    return new DifflabDb(kysely, config.dialect)
  }

  /** Open local SQLite in `stateDir`, creating and migrating on first boot with one-shot legacy import. */
  static async openLocal(stateDir?: string): Promise<DifflabDb> {
    const paths = stateDir ? DifflabConfig.fromRoot(stateDir).paths : DifflabConfig.resolvePaths()
    const existing = await lstatOrNull(paths.database)
    if (!existing) {
      const applied = await DifflabDb.migrate({ dialect: 'sqlite', path: paths.database })
      const db = await DifflabDb.fromConfig({ dialect: 'sqlite', path: paths.database })
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
    return await DifflabDb.fromConfig({ dialect: 'sqlite', path: paths.database })
  }

  /** Open a `DifflabDb` for either `cloud` (PostgreSQL) or `local` (SQLite) mode. */
  static async open(options: OpenDifflabDbOptions = {}): Promise<DifflabDb> {
    const env = options.env ?? process.env
    const config = DifflabConfig.load({ env })
    const mode = options.mode ?? config.mode
    if (mode === 'cloud') {
      if (!config.databaseUrl) {
        throw new DifflabDbError('DATABASE_URL must be set when starting difflab-api in cloud mode')
      }
      return await DifflabDb.fromConfig({
        dialect: 'postgres',
        connectionString: config.databaseUrl,
      })
    }
    return await DifflabDb.openLocal(options.stateDir)
  }

  /** Close the underlying SQLite handle or PostgreSQL connection pool. */
  close(): Promise<void> {
    return this.kysely.destroy()
  }
}

/** Return true if `error` represents a SQLite or PostgreSQL (`23505`) unique-constraint violation. */
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
