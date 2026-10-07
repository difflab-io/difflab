import { migrate, assertCurrentSchema } from './migrations.js'
import { openDatabase } from './registry.js'
import { createProjectQueries } from './queries/projects.js'
import { createRepositoryQueries } from './queries/repositories.js'
import type { Project, Repository } from './queries/projects.js'

// Types -----------------------------------------------------------------------
export interface DifflabDb {
  projects: ReturnType<typeof createProjectQueries>
  repositories: ReturnType<typeof createRepositoryQueries>
  migrate: () => Promise<void>
  assertCurrentSchema: () => Promise<void>
  close: () => Promise<void>
}

// API -------------------------------------------------------------------------
export async function createDifflabDb(
  dbPath: string,
  options: { readonly?: boolean } = {},
): Promise<DifflabDb> {
  const readonly = options.readonly ?? false
  const db = await openDatabase(dbPath, readonly)
  const projects = createProjectQueries(db, readonly, dbPath)
  const repositories = createRepositoryQueries(db, readonly, dbPath)
  return {
    projects,
    repositories,
    migrate: () => migrate(db),
    assertCurrentSchema: () => assertCurrentSchema(db),
    close: () => db.destroy(),
  }
}

export type { Project, Repository }
export { ProjectConflictError, validateProjectKey } from './queries/projects.js'
export { canonicalGitUrl, repositorySlug } from 'utils/gitx'
export { DifflabDbError } from './registry.js'
export { MigrationError } from './migrations.js'
export { projectSchema, validateProject } from './entities/project.js'
export { repositorySchema, validateRepository } from './entities/repository.js'
