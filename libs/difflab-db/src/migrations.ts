import { sql, type Kysely } from 'kysely'
import { Migrator, type Migration } from 'kysely/migration'
import { migration0001Initial } from '../migrations/0001_initial.js'
import { migration0002CloudTenancy } from '../migrations/0002_cloud_tenancy.js'
import { connect, resolveDatabaseConfig } from './db.js'
import { DifflabDbError } from './errors.js'
import type { CoreDatabase, DifflabDatabase } from './schema/index.js'
import type { DatabaseConfig, MigrationType } from './types.js'

// Constants -------------------------------------------------------------------
const MIGRATION_TABLE = 'kysely_migration'

// Types -----------------------------------------------------------------------
export type TaggedMigration = {
  name: string
  migrationType: MigrationType
  migration: Migration
}

export class MigrationError extends DifflabDbError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MigrationError'
  }
}

// API -------------------------------------------------------------------------
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

export async function migrateDatabase(config?: DatabaseConfig): Promise<string[]> {
  const resolved = config ?? resolveDatabaseConfig()
  const db = await connect(resolved, { createSqlite: true })
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
function getAllMigrations(): readonly TaggedMigration[] {
  return [migration0001Initial, migration0002CloudTenancy]
}

function getApplicableMigrations(dialect: DatabaseConfig['dialect']): TaggedMigration[] {
  return getAllMigrations().filter(
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
