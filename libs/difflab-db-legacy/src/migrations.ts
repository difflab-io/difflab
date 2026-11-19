import { type Kysely, sql } from 'kysely'
import { Migrator, type Migration, type MigrationProvider } from 'kysely/migration'
import type { ProjectDatabase } from './schema.js'

// Constants -------------------------------------------------------------------
const initialMigration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('projects')
      .addColumn('key', 'text', (column) => column.primaryKey())
      .addColumn('name', 'text', (column) => column.notNull())
      .execute()
    await db.schema
      .createTable('repositories')
      .addColumn('id', 'text', (column) => column.primaryKey())
      .addColumn('project_key', 'text', (column) =>
        column.notNull().references('projects.key').onDelete('cascade'),
      )
      .addColumn('github_url', 'text', (column) => column.notNull().unique())
      .addColumn('slug', 'text', (column) => column.notNull())
      .execute()
    await db.schema
      .createIndex('repositories_project_slug_unique')
      .on('repositories')
      .columns(['project_key', 'slug'])
      .unique()
      .execute()
  },
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('repositories').execute()
    await db.schema.dropTable('projects').execute()
  },
}

const migrations = { '001_initial': initialMigration }
const provider: MigrationProvider = {
  async getMigrations() {
    return migrations
  },
}

// API -------------------------------------------------------------------------
export class MigrationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MigrationError'
  }
}

export async function migrate(db: Kysely<ProjectDatabase>): Promise<void> {
  const { error } = await new Migrator({ db, provider }).migrateToLatest()
  if (error) throw new MigrationError('Could not migrate project database', { cause: error })
}

/** Read-only schema verification: never construct a Migrator, which creates its own tables. */
export async function assertCurrentSchema(db: Kysely<ProjectDatabase>): Promise<void> {
  const { rows: tables } = await sql<{
    name: string
  }>`SELECT name FROM sqlite_master WHERE type = 'table'`.execute(db)
  const names = new Set(tables.map((table) => table.name))
  if (
    !['projects', 'repositories', 'kysely_migration', 'kysely_migration_lock'].every((name) =>
      names.has(name),
    )
  ) {
    throw new MigrationError('Project database schema is not current')
  }
  const { rows } = await sql<{
    name: string
  }>`SELECT name FROM kysely_migration ORDER BY name`.execute(db)
  if (
    rows.length !== Object.keys(migrations).length ||
    rows.some((row, index) => row.name !== Object.keys(migrations)[index])
  ) {
    throw new MigrationError('Project database schema is not current')
  }
}
