import { defineSharedMigration } from '../src/migrations.js'

// API -------------------------------------------------------------------------
export const migration0001Initial = defineSharedMigration({
  name: '0001_initial',
  async up(db) {
    await db.schema
      .createTable('projects')
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('workspace_id', 'text', (col) => col.notNull())
      .addColumn('key', 'text', (col) => col.notNull())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('created_by_user_id', 'text')
      .addColumn('created_at', 'text', (col) => col.notNull())
      .execute()

    await db.schema
      .createIndex('projects_workspace_key_unique')
      .on('projects')
      .columns(['workspace_id', 'key'])
      .unique()
      .execute()

    await db.schema
      .createTable('git_remotes')
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('workspace_id', 'text', (col) => col.notNull())
      .addColumn('project_id', 'text', (col) =>
        col.notNull().references('projects.id').onDelete('cascade'),
      )
      .addColumn('project_key', 'text', (col) => col.notNull())
      .addColumn('remote_url', 'text', (col) => col.notNull())
      .addColumn('slug', 'text', (col) => col.notNull())
      .addColumn('created_by_user_id', 'text')
      .addColumn('created_at', 'text', (col) => col.notNull())
      .execute()

    await db.schema
      .createIndex('git_remotes_workspace_url_unique')
      .on('git_remotes')
      .columns(['workspace_id', 'remote_url'])
      .unique()
      .execute()

    await db.schema
      .createIndex('git_remotes_workspace_project_slug_unique')
      .on('git_remotes')
      .columns(['workspace_id', 'project_id', 'slug'])
      .unique()
      .execute()
  },
  async down(db) {
    await db.schema.dropTable('git_remotes').execute()
    await db.schema.dropTable('projects').execute()
  },
})
