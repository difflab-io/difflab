import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

// API -------------------------------------------------------------------------
export const projectInfo = sqliteTable(
  'project_info',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    singleton: integer('singleton').notNull().default(1),
  },
  (table) => [
    uniqueIndex('project_info_one_row').on(table.singleton),
    check('project_info_singleton', sql`${table.singleton} = 1`),
  ],
)

export const repositories = sqliteTable(
  'repositories',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projectInfo.id),
    githubUrl: text('github_url').notNull().unique(),
    slug: text('slug').notNull(),
  },
  (table) => [uniqueIndex('repositories_project_slug_unique').on(table.projectId, table.slug)],
)
