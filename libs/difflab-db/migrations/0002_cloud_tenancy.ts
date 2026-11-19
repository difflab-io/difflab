import { sql } from 'kysely'
import { defineCloudMigration } from '../src/migrations.js'

// API -------------------------------------------------------------------------
export const migration0002CloudTenancy = defineCloudMigration({
  name: '0002_cloud_tenancy',
  async up(db) {
    await db.schema
      .createTable('workspaces')
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('slug', 'text', (col) => col.notNull().unique())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('created_at', 'text', (col) => col.notNull())
      .execute()

    await db.schema
      .createTable('users')
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('email', 'text', (col) => col.notNull().unique())
      .addColumn('display_name', 'text', (col) => col.notNull())
      .addColumn('created_at', 'text', (col) => col.notNull())
      .execute()

    await db.schema
      .createTable('workspace_members')
      .addColumn('workspace_id', 'text', (col) =>
        col.notNull().references('workspaces.id').onDelete('cascade'),
      )
      .addColumn('user_id', 'text', (col) =>
        col.notNull().references('users.id').onDelete('cascade'),
      )
      .addColumn('role', 'text', (col) => col.notNull())
      .addColumn('created_at', 'text', (col) => col.notNull())
      .addPrimaryKeyConstraint('workspace_members_pk', ['workspace_id', 'user_id'])
      .execute()

    await sql`ALTER TABLE projects ENABLE ROW LEVEL SECURITY`.execute(db)
    await sql`ALTER TABLE git_remotes ENABLE ROW LEVEL SECURITY`.execute(db)
    await sql`ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY`.execute(db)

    await sql`
      CREATE POLICY workspace_isolation_projects ON projects
      USING (workspace_id = current_setting('difflab.workspace_id', true))
      WITH CHECK (workspace_id = current_setting('difflab.workspace_id', true))
    `.execute(db)

    await sql`
      CREATE POLICY workspace_isolation_git_remotes ON git_remotes
      USING (workspace_id = current_setting('difflab.workspace_id', true))
      WITH CHECK (workspace_id = current_setting('difflab.workspace_id', true))
    `.execute(db)

    await sql`
      CREATE POLICY workspace_isolation_members ON workspace_members
      USING (workspace_id = current_setting('difflab.workspace_id', true))
      WITH CHECK (workspace_id = current_setting('difflab.workspace_id', true))
    `.execute(db)
  },
  async down(db) {
    await sql`DROP POLICY IF EXISTS workspace_isolation_members ON workspace_members`.execute(db)
    await sql`DROP POLICY IF EXISTS workspace_isolation_git_remotes ON git_remotes`.execute(db)
    await sql`DROP POLICY IF EXISTS workspace_isolation_projects ON projects`.execute(db)
    await sql`ALTER TABLE projects DISABLE ROW LEVEL SECURITY`.execute(db)
    await sql`ALTER TABLE git_remotes DISABLE ROW LEVEL SECURITY`.execute(db)
    await db.schema.dropTable('workspace_members').execute()
    await db.schema.dropTable('users').execute()
    await db.schema.dropTable('workspaces').execute()
  },
})
