import { sql, type Kysely } from 'kysely'
import { Migrator, type Migration } from 'kysely/migration'
import { openKysely, type DatabaseConfig } from '../dialects.js'
import { DifflabDbError } from '../errors.js'
import type { DifflabDatabase } from '../schema.js'
import { migration0001Initial } from './0001_initial.js'
import { migration0002CloudTenancy } from './0002_cloud_tenancy.js'
import type { TaggedMigration } from './define.js'

// Constants -------------------------------------------------------------------
const MIGRATION_TABLE = 'kysely_migration'

export const ALL_MIGRATIONS: readonly TaggedMigration[] = [
  migration0001Initial,
  migration0002CloudTenancy,
]

// Types -----------------------------------------------------------------------
export class MigrationError extends DifflabDbError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MigrationError'
  }
}

// API -------------------------------------------------------------------------
export { defineCloudMigration, defineSharedMigration, type TaggedMigration } from './define.js'

export async function migrateDatabase(config: DatabaseConfig): Promise<string[]> {
  const db = await openKysely(config, { createSqlite: true })
  if (!db) {
    throw new MigrationError('Could not open database for migration')
  }
  try {
    const migrator = createMigrator(db, config.dialect)
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
