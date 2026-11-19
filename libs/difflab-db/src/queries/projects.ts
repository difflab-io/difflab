import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import { canonicalGitUrl, repositorySlug } from 'utils/gitx'
import { isUniqueConstraintError } from '../dialects.js'
import { ProjectConflictError, ProjectNotFoundError, ProjectValidationError } from '../errors.js'
import {
  DEFAULT_ACTOR,
  type ActorContext,
  type DifflabDatabase,
  type Project,
  type ProjectsTable,
  type RepositoriesTable,
  type Repository,
} from '../schema.js'

// API -------------------------------------------------------------------------
export function validateProjectKey(key: string): string {
  const normalized = key.trim().toUpperCase()
  if (!/^[A-Z][A-Z0-9]{2,15}$/.test(normalized)) {
    throw new ProjectValidationError('Project key must be 3-16 uppercase letters or digits')
  }
  return normalized
}

export function validateWorkspaceId(workspaceId: string): string {
  const trimmed = workspaceId.trim()
  if (!trimmed || trimmed.length > 64) {
    throw new ProjectValidationError('Workspace ID must be nonempty and at most 64 characters')
  }
  return trimmed
}

export function createProjectQueries(db: Kysely<DifflabDatabase>) {
  return {
    async createProject(
      key: string,
      name: string,
      initialOrigins: string[] = [],
      actor: ActorContext = DEFAULT_ACTOR,
    ): Promise<Project> {
      const workspaceId = validateWorkspaceId(actor.workspaceId)
      const projectKey = validateProjectKey(key)
      const trimmedName = name.trim()
      if (!trimmedName || trimmedName.length > 100) {
        throw new ProjectValidationError('Project name must be nonempty and at most 100 characters')
      }
      const urls = initialOrigins.map((origin) => {
        try {
          return canonicalGitUrl(origin)
        } catch (error) {
          throw new ProjectValidationError(
            error instanceof Error ? error.message : `Invalid Git URL: ${origin}`,
            { cause: error },
          )
        }
      })
      if (new Set(urls).size !== urls.length) {
        throw new ProjectConflictError('Duplicate Git repository origins')
      }

      const now = new Date().toISOString()
      const projectRow: ProjectsTable = {
        id: randomUUID(),
        workspace_id: workspaceId,
        key: projectKey,
        name: trimmedName,
        created_by_user_id: actor.userId,
        created_at: now,
      }

      try {
        return await db.transaction().execute(async (tx) => {
          await tx.insertInto('projects').values(projectRow).execute()
          const repositories: Repository[] = []
          for (const url of urls) {
            const repoRow: RepositoriesTable = {
              id: randomUUID(),
              workspace_id: workspaceId,
              project_id: projectRow.id,
              project_key: projectKey,
              github_url: url,
              slug: repositorySlug(url),
              created_by_user_id: actor.userId,
              created_at: new Date().toISOString(),
            }
            await tx.insertInto('repositories').values(repoRow).execute()
            repositories.push(toRepository(repoRow))
          }
          return toProject(projectRow, repositories)
        })
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ProjectConflictError(
            `Project key or repository already exists: ${projectKey}`,
            {
              cause: error,
            },
          )
        }
        throw error
      }
    },

    async listProjects(actor: ActorContext = DEFAULT_ACTOR): Promise<Project[]> {
      const workspaceId = validateWorkspaceId(actor.workspaceId)
      return db.transaction().execute(async (tx) => {
        const projectRows = await tx
          .selectFrom('projects')
          .selectAll()
          .where('workspace_id', '=', workspaceId)
          .orderBy('key', 'asc')
          .execute()

        const repositoryRows = await tx
          .selectFrom('repositories')
          .selectAll()
          .where('workspace_id', '=', workspaceId)
          .orderBy('created_at', 'asc')
          .orderBy('id', 'asc')
          .execute()

        return projectRows.map((row) =>
          toProject(
            row,
            repositoryRows.filter((repo) => repo.project_id === row.id).map(toRepository),
          ),
        )
      })
    },

    async getProjectById(key: string, actor: ActorContext = DEFAULT_ACTOR): Promise<Project> {
      const workspaceId = validateWorkspaceId(actor.workspaceId)
      const projectKey = validateProjectKey(key)
      return db.transaction().execute(async (tx) => {
        const row = await tx
          .selectFrom('projects')
          .selectAll()
          .where('workspace_id', '=', workspaceId)
          .where('key', '=', projectKey)
          .executeTakeFirst()
        if (!row) throw new ProjectNotFoundError(projectKey)

        const repositories = await tx
          .selectFrom('repositories')
          .selectAll()
          .where('workspace_id', '=', workspaceId)
          .where('project_id', '=', row.id)
          .orderBy('created_at', 'asc')
          .orderBy('id', 'asc')
          .execute()

        return toProject(row, repositories.map(toRepository))
      })
    },
  }
}

// Helpers ---------------------------------------------------------------------
export function toRepository(row: RepositoriesTable): Repository {
  return {
    id: row.id,
    projectId: row.project_key,
    url: row.github_url,
    slug: row.slug,
    createdAt: row.created_at,
  }
}

function toProject(row: ProjectsTable, repositories: Repository[]): Project {
  return {
    id: row.key,
    name: row.name,
    workspaceId: row.workspace_id,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    repositories,
  }
}
