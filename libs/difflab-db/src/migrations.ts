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

const loopsMvpMigration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('repositories').addColumn('local_path', 'text').execute()

    await db.schema
      .createTable('runs')
      .addColumn('id', 'text', (column) => column.primaryKey())
      .addColumn('repo_id', 'text', (column) =>
        column.notNull().references('repositories.id').onDelete('cascade'),
      )
      .addColumn('flow_name', 'text', (column) => column.notNull())
      .addColumn('trigger_key', 'text')
      .addColumn('status', 'text', (column) => column.notNull())
      .addColumn('harness', 'text', (column) => column.notNull())
      .addColumn('worktree_path', 'text')
      .addColumn('store_flow_dir', 'text', (column) => column.notNull())
      .addColumn('herdr_session', 'text')
      .addColumn('herdr_pane_id', 'text')
      .addColumn('herdr_agent_name', 'text')
      .addColumn('commit_sha', 'text')
      .addColumn('created_at', 'text', (column) => column.notNull())
      .addColumn('updated_at', 'text', (column) => column.notNull())
      .execute()

    await sql`CREATE UNIQUE INDEX runs_trigger_key_unique ON runs(trigger_key) WHERE trigger_key IS NOT NULL`.execute(
      db,
    )

    await db.schema
      .createTable('steps')
      .addColumn('id', 'text', (column) => column.primaryKey())
      .addColumn('run_id', 'text', (column) =>
        column.notNull().references('runs.id').onDelete('cascade'),
      )
      .addColumn('step_id', 'text', (column) => column.notNull())
      .addColumn('seq', 'integer', (column) => column.notNull())
      .addColumn('status', 'text', (column) => column.notNull())
      .addColumn('harness', 'text')
      .addColumn('handoff', 'text')
      .addColumn('summary', 'text')
      .addColumn('started_at', 'text')
      .addColumn('finished_at', 'text')
      .execute()

    await db.schema
      .createIndex('steps_run_seq_unique')
      .on('steps')
      .columns(['run_id', 'seq'])
      .unique()
      .execute()

    await db.schema
      .createTable('worker_messages')
      .addColumn('id', 'text', (column) => column.primaryKey())
      .addColumn('run_id', 'text', (column) =>
        column.notNull().references('runs.id').onDelete('cascade'),
      )
      .addColumn('step_id', 'text')
      .addColumn('level', 'text', (column) => column.notNull())
      .addColumn('message', 'text', (column) => column.notNull())
      .addColumn('created_at', 'text', (column) => column.notNull())
      .execute()

    await db.schema
      .createIndex('worker_messages_run_created_idx')
      .on('worker_messages')
      .columns(['run_id', 'created_at'])
      .execute()
  },
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('worker_messages').execute()
    await db.schema.dropTable('steps').execute()
    await db.schema.dropTable('runs').execute()
  },
}

const migrations = {
  '001_initial': initialMigration,
  '002_loops_mvp': loopsMvpMigration,
}
const provider: MigrationProvider = {
  async getMigrations() {
    return migrations
  },
}

const REQUIRED_TABLES = [
  'projects',
  'repositories',
  'runs',
  'steps',
  'worker_messages',
  'kysely_migration',
  'kysely_migration_lock',
] as const

// Types -----------------------------------------------------------------------
export class MigrationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MigrationError'
  }
}

// API -------------------------------------------------------------------------
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
  if (!REQUIRED_TABLES.every((name) => names.has(name))) {
    throw new MigrationError('Project database schema is not current')
  }
  const { rows } = await sql<{
    name: string
  }>`SELECT name FROM kysely_migration ORDER BY name`.execute(db)
  const expected = Object.keys(migrations)
  if (rows.length !== expected.length || rows.some((row, index) => row.name !== expected[index])) {
    throw new MigrationError('Project database schema is not current')
  }
}
