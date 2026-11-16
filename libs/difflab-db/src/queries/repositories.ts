import { randomUUID } from 'node:crypto'
import { sql, type Kysely, type Transaction } from 'kysely'
import { canonicalGitUrl, repositorySlug } from 'utils/gitx'
import type { Repository } from '../entities/repository.js'
import { validateRepository } from '../entities/repository.js'
import { DifflabDbError, withDatabaseAccess } from '../registry.js'
import { retryDatabaseOperation } from '../retry.js'
import type { ProjectDatabase } from '../schema.js'
import { ProjectConflictError, validateProjectKey } from './projects.js'

// API -------------------------------------------------------------------------
export function createRepositoryQueries(
  db: Kysely<ProjectDatabase>,
  readonly: boolean,
  dbPath: string,
) {
  return {
    async linkRepositoryToProject(
      projectKey: string,
      origin: string,
      localPath?: string,
    ): Promise<Repository> {
      if (readonly) throw new DifflabDbError('Project database is read-only')
      const key = validateProjectKey(projectKey)
      const url = canonicalGitUrl(origin)
      const repository: Repository = {
        id: randomUUID(),
        projectId: key,
        url,
        slug: repositorySlug(url),
        ...(localPath ? { localPath } : {}),
      }
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
              if (localPath && existing.local_path !== localPath) {
                await tx
                  .updateTable('repositories')
                  .set({ local_path: localPath })
                  .where('id', '=', existing.id)
                  .execute()
                return fromDbRepository({ ...existing, local_path: localPath })
              }
              return fromDbRepository(existing)
            }),
          ),
        )
      } catch (error) {
        if (isConstraint(error)) throw new ProjectConflictError(`Repository already exists: ${url}`)
        throw error
      }
    },

    async listRepositories(): Promise<Repository[]> {
      return withDatabaseAccess(dbPath, async () => {
        const rows = await db
          .selectFrom('repositories')
          .selectAll()
          .orderBy(sql`rowid`)
          .execute()
        return rows.map(fromDbRepository)
      })
    },

    async getRepositoryById(id: string): Promise<Repository> {
      return withDatabaseAccess(dbPath, async () => {
        const row = await db
          .selectFrom('repositories')
          .selectAll()
          .where('id', '=', id)
          .executeTakeFirst()
        if (!row) throw new DifflabDbError(`Repository not found: ${id}`)
        return fromDbRepository(row)
      })
    },

    async getRepositoryByOrigin(origin: string): Promise<Repository | null> {
      const url = canonicalGitUrl(origin)
      return withDatabaseAccess(dbPath, async () => {
        const row = await db
          .selectFrom('repositories')
          .selectAll()
          .where('github_url', '=', url)
          .executeTakeFirst()
        return row ? fromDbRepository(row) : null
      })
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
    ...(row.local_path ? { localPath: row.local_path } : {}),
  })
}

function toDbRepository(repository: Repository): ProjectDatabase['repositories'] {
  return {
    id: repository.id,
    project_key: repository.projectId,
    github_url: repository.url,
    slug: repository.slug,
    local_path: repository.localPath ?? null,
  }
}

function isConstraint(error: unknown): boolean {
  return (
    error instanceof Error &&
    /SQLITE_CONSTRAINT|constraint failed|UNIQUE constraint/i.test(error.message)
  )
}
