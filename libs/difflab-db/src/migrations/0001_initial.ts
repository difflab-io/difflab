import type { Kysely } from 'kysely'
import type { CoreDatabase } from '../schema.js'
import { defineSharedMigration } from './define.js'

// API -------------------------------------------------------------------------
export const migration0001Initial = defineSharedMigration({
  name: '0001_initial',
  async up(db: Kysely<CoreDatabase>) {
    await db.schema
      .createTable('projects')
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('workspace_id', 'text', (col) => col.notNull().defaultTo('local'))
      .addColumn('key', 'text', (col) => col.notNull())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('created_by_user_id', 'text')
      .addColumn('created_at', 'text', (col) => col.notNull())
      .execute()

    await db.schema
      .createIndex('projects_workspace_key_idx')
      .on('projects')
      .columns(['workspace_id', 'key'])
      .unique()
      .execute()

    await db.schema
      .createTable('repositories')
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('workspace_id', 'text', (col) => col.notNull().defaultTo('local'))
      .addColumn('project_id', 'text', (col) =>
        col.notNull().references('projects.id').onDelete('cascade'),
      )
      .addColumn('project_key', 'text', (col) => col.notNull())
      .addColumn('github_url', 'text', (col) => col.notNull())
      .addColumn('slug', 'text', (col) => col.notNull())
      .addColumn('created_by_user_id', 'text')
      .addColumn('created_at', 'text', (col) => col.notNull())
      .execute()

    await db.schema
      .createIndex('repositories_workspace_url_idx')
      .on('repositories')
      .columns(['workspace_id', 'github_url'])
      .unique()
      .execute()

    await db.schema
      .createIndex('repositories_workspace_project_idx')
      .on('repositories')
      .columns(['workspace_id', 'project_id'])
      .execute()
  },
  async down(db: Kysely<CoreDatabase>) {
    await db.schema.dropTable('repositories').ifExists().execute()
    await db.schema.dropTable('projects').ifExists().execute()
  },
})
