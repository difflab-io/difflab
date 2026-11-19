import { openKysely, type DatabaseConfig } from './dialects.js'
import { assertSchemaReady, migrateDatabase, MigrationError } from './migrations/index.js'
import {
  createProjectQueries,
  validateProjectKey,
  validateWorkspaceId,
} from './queries/projects.js'
import { createRepositoryQueries } from './queries/repositories.js'
import { createUserQueries } from './queries/users.js'
import { createWorkspaceQueries } from './queries/workspaces.js'

// Types -----------------------------------------------------------------------
export interface DifflabDb {
  projects: ReturnType<typeof createProjectQueries>
  repositories: ReturnType<typeof createRepositoryQueries>
  workspaces: ReturnType<typeof createWorkspaceQueries>
  users: ReturnType<typeof createUserQueries>
  close: () => Promise<void>
}

// API -------------------------------------------------------------------------
export async function createDifflabDb(config: DatabaseConfig): Promise<DifflabDb> {
  const db = await openKysely(config, { createSqlite: false })
  if (!db) {
    throw new MigrationError(
      `SQLite database does not exist: ${config.dialect === 'sqlite' ? config.path : ''}`,
    )
  }
  try {
    await assertSchemaReady(db, config.dialect)
  } catch (error) {
    await db.destroy()
    throw error
  }
  return {
    projects: createProjectQueries(db),
    repositories: createRepositoryQueries(db),
    workspaces: createWorkspaceQueries(db, config.dialect),
    users: createUserQueries(db, config.dialect),
    close: () => db.destroy(),
  }
}

export { migrateDatabase, MigrationError, validateProjectKey, validateWorkspaceId }
export type { DatabaseConfig } from './dialects.js'
export {
  DifflabDbError,
  ProjectConflictError,
  ProjectNotFoundError,
  ProjectValidationError,
} from './errors.js'
export {
  DEFAULT_ACTOR,
  LOCAL_WORKSPACE_ID,
  type ActorContext,
  type CloudDatabase,
  type CoreDatabase,
  type DifflabDatabase,
  type MigrationType,
  type Project,
  type Repository,
  type User,
  type Workspace,
  type WorkspaceMember,
  type WorkspaceRole,
} from './schema.js'
