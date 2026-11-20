import { sql, type Kysely } from 'kysely'
import { Migrator, type Migration } from 'kysely/migration'
import { migration0001Initial } from '../migrations/0001_initial.js'
import { migration0002CloudTenancy } from '../migrations/0002_cloud_tenancy.js'
import { DifflabDb, type DatabaseConfig } from './db.js'
import { DifflabDbError } from './errors.js'
import type { CoreDatabase, DifflabDatabase } from './schema/index.js'

// Constants -------------------------------------------------------------------
const MIGRATION_TABLE = 'kysely_migration'
const ALL_MIGRATIONS: readonly TaggedMigration[] = [migration0001Initial, migration0002CloudTenancy]

// Types -----------------------------------------------------------------------
/** Scope tag indicating whether a migration runs on both dialects (`shared`) or PostgreSQL only (`cloud`). */
export type MigrationType = 'shared' | 'cloud'

/** Chronological migration entry tagged with its target dialect scope. */
export type TaggedMigration = {
  name: string
  migrationType: MigrationType
  migration: Migration
}

/** Error thrown when schema initialization, migration execution, or readiness checks fail. */
export class MigrationError extends DifflabDbError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MigrationError'
  }
}

// API -------------------------------------------------------------------------
/** Define a `shared` migration typed strictly against `CoreDatabase` tables. */
export function defineSharedMigration(spec: {
  name: string
  up: (db: Kysely<CoreDatabase>) => Promise<void>
  down?: (db: Kysely<CoreDatabase>) => Promise<void>
}): TaggedMigration {
  return {
    name: spec.name,
    migrationType: 'shared',
    migration: {
      up: (db) => spec.up(db as Kysely<CoreDatabase>),
      down: spec.down ? (db) => spec.down!(db as Kysely<CoreDatabase>) : undefined,
    },
  }
}

/** Define a `cloud`-only PostgreSQL migration typed against the full `DifflabDatabase`. */
export function defineCloudMigration(spec: {
  name: string
  up: (db: Kysely<DifflabDatabase>) => Promise<void>
  down?: (db: Kysely<DifflabDatabase>) => Promise<void>
}): TaggedMigration {
  return {
    name: spec.name,
    migrationType: 'cloud',
    migration: {
      up: (db) => spec.up(db as Kysely<DifflabDatabase>),
      down: spec.down ? (db) => spec.down!(db as Kysely<DifflabDatabase>) : undefined,
    },
  }
}

/** Apply all pending dialect-applicable migrations to `config` and return newly applied names. */
export async function migrateDatabase(config?: DatabaseConfig): Promise<string[]> {
  const resolved = config ?? DifflabDb.resolveConfig()
  const db = await DifflabDb.connect(resolved, { createSqlite: true })
  if (!db) {
    throw new MigrationError('Could not open database for migration')
  }
  try {
    const migrator = createMigrator(db, resolved.dialect)
    const { error, results } = await migrator.migrateToLatest()
    if (error) {
      throw new MigrationError(
        error instanceof Error ? error.message : `Migration failed: ${String(error)}`,
        { cause: error },
      )
    }
    return (results ?? []).filter((r) => r.status === 'Success').map((r) => r.migrationName)
  } finally {
    await db.destroy()
  }
}

/** Verify that `kysely_migration` exists and contains every applicable migration without mutating schema. */
export async function assertSchemaReady(
  db: Kysely<DifflabDatabase>,
  dialect: DatabaseConfig['dialect'],
): Promise<void> {
  const tables = await db.introspection.getTables({ withInternalKyselyTables: true })
  if (!tables.some((table) => table.name === MIGRATION_TABLE)) {
    throw new MigrationError('Database schema is not initialized; run migrations first')
  }
  const { rows } = await sql<{ name: string }>`SELECT name FROM kysely_migration`.execute(db)
  const applied = new Set(rows.map((row) => row.name))
  const pending = getApplicableMigrations(dialect)
    .filter((entry) => !applied.has(entry.name))
    .map((entry) => entry.name)
  if (pending.length > 0) {
    throw new MigrationError(`Database has unapplied migrations: ${pending.join(', ')}`)
  }
}

// Helpers ---------------------------------------------------------------------
function getApplicableMigrations(dialect: DatabaseConfig['dialect']): TaggedMigration[] {
  return ALL_MIGRATIONS.filter(
    (entry) => dialect === 'postgres' || entry.migrationType === 'shared',
  )
}

function createMigrator(db: Kysely<DifflabDatabase>, dialect: DatabaseConfig['dialect']): Migrator {
  const applicable = getApplicableMigrations(dialect)
  return new Migrator({
    db,
    provider: {
      async getMigrations(): Promise<Record<string, Migration>> {
        return Object.fromEntries(applicable.map((entry) => [entry.name, entry.migration]))
      },
    },
  })
}
