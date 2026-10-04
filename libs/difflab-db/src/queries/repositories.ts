import { randomUUID } from 'node:crypto'
import type { Kysely, Transaction } from 'kysely'
import { canonicalGitUrl, repositorySlug } from 'difflab-ts/gitx'
import type { Repository } from '../entities/repository.js'
import { validateRepository } from '../entities/repository.js'
import { DifflabDbError, withDatabaseAccess } from '../registry.js'
import { retryDatabaseOperation } from '../retry.js'
import type { ProjectDatabase } from '../schema.js'
import { ProjectConflictError, validateProjectKey } from './projects.js'

// Types -----------------------------------------------------------------------

// API -------------------------------------------------------------------------
export function createRepositoryQueries(
  db: Kysely<ProjectDatabase>,
  readonly: boolean,
  dbPath: string,
) {
  return {
    async linkRepositoryToProject(projectKey: string, origin: string): Promise<Repository> {
      if (readonly) throw new DifflabDbError('Project database is read-only')
      const key = validateProjectKey(projectKey)
      const url = canonicalGitUrl(origin)
      const repository = { id: randomUUID(), projectId: key, url, slug: repositorySlug(url) }
      try {
        return await withDatabaseAccess(dbPath, () =>
          retryDatabaseOperation(() =>
            db.transaction().execute(async (tx) => {
              await requireProject(tx, key)
              await tx
                .insertInto('repositories')
                .values(toDbRepository(repository))
                .onConflict((c) => c.doNothing())
                .execute()
              const existing = await tx
                .selectFrom('repositories')
                .selectAll()
                .where('github_url', '=', url)
                .executeTakeFirst()
              if (!existing || existing.project_key !== key)
                throw new ProjectConflictError(
                  `Git repository already belongs to another project: ${url}`,
                )
              return fromDbRepository(existing)
            }),
          ),
        )
      } catch (error) {
        if (isConstraint(error)) throw new ProjectConflictError(`Repository already exists: ${url}`)
        throw error
      }
    },
  }
}

// Helpers ---------------------------------------------------------------------
async function requireProject(tx: Transaction<ProjectDatabase>, key: string) {
  if (!(await tx.selectFrom('projects').select('key').where('key', '=', key).executeTakeFirst()))
    throw new DifflabDbError(`Project not found: ${key}`)
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

function isConstraint(error: unknown): boolean {
  return (
    error instanceof Error &&
    /SQLITE_CONSTRAINT|constraint failed|UNIQUE constraint/i.test(error.message)
  )
}
