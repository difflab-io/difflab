import { randomUUID } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import { canonicalGitUrl, repositorySlug } from 'utils/gitx'
import { validateProject } from '../entities/project.js'
import type { Project } from '../entities/project.js'
import { validateRepository } from '../entities/repository.js'
import type { Repository } from '../entities/repository.js'
import { DifflabDbError, withDatabaseAccess } from '../registry.js'
import { retryDatabaseOperation } from '../retry.js'
import type { ProjectDatabase } from '../schema.js'

// Types -----------------------------------------------------------------------
export type { Project, Repository }

export class ProjectConflictError extends DifflabDbError {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectConflictError'
  }
}

// API -------------------------------------------------------------------------
export function validateProjectKey(key: string): string {
  const normalized = key.trim().toUpperCase()
  if (!/^[A-Z][A-Z0-9]{2,15}$/.test(normalized))
    throw new DifflabDbError('Project key must be 3-16 uppercase letters or digits')
  return normalized
}

export function createProjectQueries(
  db: Kysely<ProjectDatabase>,
  readonly: boolean,
  dbPath: string,
) {
  const assertWritable = () => {
    if (readonly) throw new DifflabDbError('Project database is read-only')
  }
  return {
    async createProject(
      key: string,
      name: string,
      initialOrigins: string[] = [],
    ): Promise<Project> {
      assertWritable()
      const trimmed = name.trim()
      const projectKey = validateProjectKey(key)
      if (!trimmed || trimmed.length > 100)
        throw new DifflabDbError('Project name must be nonempty and at most 100 characters')
      const urls = initialOrigins.map(canonicalGitUrl)
      if (new Set(urls).size !== urls.length)
        throw new ProjectConflictError('Duplicate Git repository origins')
      try {
        return await withDatabaseAccess(dbPath, () =>
          retryDatabaseOperation(() =>
            db.transaction().execute(async (tx) => {
              await tx.insertInto('projects').values({ key: projectKey, name: trimmed }).execute()
              const repositories: Repository[] = []
              for (const url of urls) {
                const repository = makeRepository(projectKey, url)
                await tx.insertInto('repositories').values(toDbRepository(repository)).execute()
                repositories.push(repository)
              }
              return validateProject({ id: projectKey, name: trimmed, repositories })
            }),
          ),
        )
      } catch (error) {
        if (isConstraint(error))
          throw new ProjectConflictError(`Project key or repository already exists: ${projectKey}`)
        throw error
      }
    },
    async listProjects(): Promise<Project[]> {
      return withDatabaseAccess(dbPath, () =>
        db.transaction().execute(async (tx) => {
          const rows = await tx.selectFrom('projects').selectAll().orderBy('key').execute()
          const repositories = await tx
            .selectFrom('repositories')
            .selectAll()
            .orderBy(sql`rowid`)
            .execute()
          return rows.map((row) =>
            validateProject({
              id: row.key,
              name: row.name,
              repositories: repositories
                .filter((repo) => repo.project_key === row.key)
                .map(fromDbRepository),
            }),
          )
        }),
      )
    },
    async getProjectById(key: string): Promise<Project> {
      const projectKey = validateProjectKey(key)
      return withDatabaseAccess(dbPath, () =>
        db.transaction().execute(async (tx) => {
          const row = await tx
            .selectFrom('projects')
            .selectAll()
            .where('key', '=', projectKey)
            .executeTakeFirst()
          if (!row) throw new DifflabDbError(`Project not found: ${projectKey}`)
          const repositories = await tx
            .selectFrom('repositories')
            .selectAll()
            .where('project_key', '=', projectKey)
            .orderBy(sql`rowid`)
            .execute()
          return validateProject({
            id: row.key,
            name: row.name,
            repositories: repositories.map(fromDbRepository),
          })
        }),
      )
    },
  }
}

// Helpers ---------------------------------------------------------------------
function makeRepository(projectId: string, url: string): Repository {
  return { id: randomUUID(), projectId, url, slug: repositorySlug(url) }
}

function isConstraint(error: unknown): boolean {
  return (
    error instanceof Error &&
    /SQLITE_CONSTRAINT|constraint failed|UNIQUE constraint/i.test(error.message)
  )
}

function fromDbRepository(row: ProjectDatabase['repositories']): Repository {
  return validateRepository({
    id: row.id,
    projectId: row.project_key,
    url: row.github_url,
    slug: row.slug,
  })
}

function toDbRepository(repository: Repository): ProjectDatabase['repositories'] {
  return {
    id: repository.id,
    project_key: repository.projectId,
    github_url: repository.url,
    slug: repository.slug,
  }
}
