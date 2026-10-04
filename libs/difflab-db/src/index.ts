import { ProjectStore } from './projects.js'
import { openDatabase } from './registry.js'

// API -------------------------------------------------------------------------
export async function openProjectStore(
  dbPath: string,
  options: { readonly?: boolean } = {},
): Promise<ProjectStore> {
  return new ProjectStore(
    await openDatabase(dbPath, options.readonly ?? false),
    options.readonly ?? false,
    dbPath,
  )
}

export { ProjectStore, ProjectConflictError, validateProjectKey } from './projects.js'
export type { Project, Repository } from './projects.js'
export { canonicalGithubUrl, repositorySlug } from './repositories.js'
export { ProjectStoreError } from './registry.js'
export { MigrationError } from './migrations.js'
