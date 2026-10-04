import { randomUUID } from 'node:crypto'
import { sql, type Kysely, type Transaction } from 'kysely'
import { canonicalGithubUrl, repositorySlug } from './repositories.js'
import { ProjectStoreError, withDatabaseAccess } from './registry.js'
import { retryDatabaseOperation } from './retry.js'
import type { ProjectDatabase, RepositoryRow } from './schema.js'

// Types -----------------------------------------------------------------------
export type Repository = { id: string; projectId: string; githubUrl: string; slug: string }
export type Project = { id: string; name: string; repositories: Repository[] }

// API -------------------------------------------------------------------------
export class ProjectConflictError extends ProjectStoreError {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectConflictError'
  }
}

export function validateProjectKey(key: string): string {
  const normalized = key.trim().toUpperCase()
  if (!/^[A-Z][A-Z0-9]{2,15}$/.test(normalized))
    throw new ProjectStoreError('Project key must be 3-16 uppercase letters or digits')
  return normalized
}

export class ProjectStore {
  constructor(
    private readonly db: Kysely<ProjectDatabase>,
    private readonly readonly: boolean,
    private readonly dbPath: string,
  ) {}

  async createProject(key: string, name: string, initialOrigins: string[] = []): Promise<Project> {
    this.assertWritable()
    const trimmed = name.trim()
    if (!trimmed || trimmed.length > 100)
      throw new ProjectStoreError('Project name must be nonempty and at most 100 characters')
    const projectKey = validateProjectKey(key)
    const urls = initialOrigins.map(canonicalGithubUrl)
    if (new Set(urls).size !== urls.length)
      throw new ProjectConflictError('Duplicate GitHub repository origins')
    try {
      return await withDatabaseAccess(this.dbPath, () =>
        retryDatabaseOperation(() =>
          this.db.transaction().execute(async (tx) => {
            await tx.insertInto('projects').values({ key: projectKey, name: trimmed }).execute()
            const repositories: Repository[] = []
            for (const githubUrl of urls) {
              const repository = makeRepository(projectKey, githubUrl)
              await tx.insertInto('repositories').values(toRow(repository)).execute()
              repositories.push(repository)
            }
            return { id: projectKey, name: trimmed, repositories }
          }),
        ),
      )
    } catch (error) {
      if (isConstraint(error))
        throw new ProjectConflictError(`Project key or repository already exists: ${projectKey}`)
      throw error
    }
  }

  async listProjects(): Promise<Project[]> {
    return withDatabaseAccess(this.dbPath, () =>
      this.db.transaction().execute(async (tx) => {
        const rows = await tx.selectFrom('projects').selectAll().orderBy('key').execute()
        const repositories = await tx
          .selectFrom('repositories')
          .selectAll()
          .orderBy(sql`rowid`)
          .execute()
        return rows.map((row) => ({
          id: row.key,
          name: row.name,
          repositories: repositories.filter((repo) => repo.project_key === row.key).map(fromRow),
        }))
      }),
    )
  }

  async getProjectById(key: string): Promise<Project> {
    const projectKey = validateProjectKey(key)
    return withDatabaseAccess(this.dbPath, () =>
      this.db.transaction().execute(async (tx) => {
        const row = await tx
          .selectFrom('projects')
          .selectAll()
          .where('key', '=', projectKey)
          .executeTakeFirst()
        if (!row) throw new ProjectStoreError(`Project not found: ${projectKey}`)
        const repositories = await tx
          .selectFrom('repositories')
          .selectAll()
          .where('project_key', '=', projectKey)
          .orderBy(sql`rowid`)
          .execute()
        return { id: row.key, name: row.name, repositories: repositories.map(fromRow) }
      }),
    )
  }

  async inspectProject(key: string): Promise<Project> {
    return this.getProjectById(key)
  }

  async linkRepository(projectKey: string, origin: string): Promise<Repository> {
    this.assertWritable()
    const key = validateProjectKey(projectKey)
    const githubUrl = canonicalGithubUrl(origin)
    const repository = makeRepository(key, githubUrl)
    try {
      return await withDatabaseAccess(this.dbPath, () =>
        retryDatabaseOperation(() =>
          this.db.transaction().execute(async (tx) => {
            await requireProject(tx, key)
            await tx
              .insertInto('repositories')
              .values(toRow(repository))
              .onConflict((conflict) => conflict.doNothing())
              .execute()
            const existing = await tx
              .selectFrom('repositories')
              .selectAll()
              .where('github_url', '=', githubUrl)
              .executeTakeFirst()
            if (!existing || existing.project_key !== key)
              throw new ProjectConflictError(
                `GitHub repository already belongs to another project: ${githubUrl}`,
              )
            return fromRow(existing)
          }),
        ),
      )
    } catch (error) {
      if (isConstraint(error))
        throw new ProjectConflictError(`Repository already exists: ${githubUrl}`)
      throw error
    }
  }

  async close(): Promise<void> {
    await this.db.destroy()
  }

  // Helpers -------------------------------------------------------------------
  private assertWritable(): void {
    if (this.readonly) throw new ProjectStoreError('Project database is read-only')
  }
}

// Helpers ---------------------------------------------------------------------
async function requireProject(tx: Transaction<ProjectDatabase>, key: string): Promise<void> {
  const project = await tx
    .selectFrom('projects')
    .select('key')
    .where('key', '=', key)
    .executeTakeFirst()
  if (!project) throw new ProjectStoreError(`Project not found: ${key}`)
}

function makeRepository(projectId: string, githubUrl: string): Repository {
  return { id: randomUUID(), projectId, githubUrl, slug: repositorySlug(githubUrl) }
}

function fromRow(row: RepositoryRow): Repository {
  return { id: row.id, projectId: row.project_key, githubUrl: row.github_url, slug: row.slug }
}

function toRow(repository: Repository): RepositoryRow {
  return {
    id: repository.id,
    project_key: repository.projectId,
    github_url: repository.githubUrl,
    slug: repository.slug,
  }
}

function isConstraint(error: unknown): boolean {
  return (
    error instanceof Error &&
    /SQLITE_CONSTRAINT|constraint failed|UNIQUE constraint/i.test(error.message)
  )
}
