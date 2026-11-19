import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import { isUniqueConstraintError } from '../db.js'
import { ProjectConflictError, ProjectNotFoundError } from '../errors.js'
import {
  GitRemoteEntity,
  ProjectEntity,
  validateWorkspaceId,
  type DifflabDatabase,
  type GitRemote,
  type GitRemoteRow,
  type Project,
  type ProjectRow,
} from '../schema/index.js'
import { DEFAULT_ACTOR, type ActorContext } from '../types.js'

// API -------------------------------------------------------------------------
export function createProjectQueries(db: Kysely<DifflabDatabase>) {
  return {
    async createProject(
      key: string,
      name: string,
      initialOrigins: string[] = [],
      actor: ActorContext = DEFAULT_ACTOR,
    ): Promise<Project> {
      const workspaceId = validateWorkspaceId(actor.workspaceId)
      const projectKey = ProjectEntity.validateKey(key)
      const trimmedName = ProjectEntity.validateName(name)
      const normalizedRemotes = initialOrigins.map(GitRemoteEntity.normalizeUrl)
      const uniqueUrls = new Set(normalizedRemotes.map((item) => item.url))
      if (uniqueUrls.size !== normalizedRemotes.length) {
        throw new ProjectConflictError('Duplicate Git remote URLs')
      }

      const now = new Date().toISOString()
      const projectRow: ProjectRow = {
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
          const gitRemotes: GitRemote[] = []
          for (const remote of normalizedRemotes) {
            const remoteRow: GitRemoteRow = {
              id: randomUUID(),
              workspace_id: workspaceId,
              project_id: projectRow.id,
              project_key: projectKey,
              remote_url: remote.url,
              slug: remote.slug,
              created_by_user_id: actor.userId,
              created_at: new Date().toISOString(),
            }
            await tx.insertInto('git_remotes').values(remoteRow).execute()
            gitRemotes.push(GitRemoteEntity.fromRow(remoteRow))
          }
          return ProjectEntity.fromRow(projectRow, gitRemotes)
        })
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ProjectConflictError(
            `Project key or Git remote already exists: ${projectKey}`,
            { cause: error },
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

        const remoteRows = await tx
          .selectFrom('git_remotes')
          .selectAll()
          .where('workspace_id', '=', workspaceId)
          .orderBy('created_at', 'asc')
          .orderBy('id', 'asc')
          .execute()

        return projectRows.map((row) =>
          ProjectEntity.fromRow(
            row,
            remoteRows
              .filter((remote) => remote.project_id === row.id)
              .map(GitRemoteEntity.fromRow),
          ),
        )
      })
    },

    async getProjectById(key: string, actor: ActorContext = DEFAULT_ACTOR): Promise<Project> {
      const workspaceId = validateWorkspaceId(actor.workspaceId)
      const projectKey = ProjectEntity.validateKey(key)
      return db.transaction().execute(async (tx) => {
        const row = await tx
          .selectFrom('projects')
          .selectAll()
          .where('workspace_id', '=', workspaceId)
          .where('key', '=', projectKey)
          .executeTakeFirst()
        if (!row) throw new ProjectNotFoundError(projectKey)

        const remoteRows = await tx
          .selectFrom('git_remotes')
          .selectAll()
          .where('workspace_id', '=', workspaceId)
          .where('project_id', '=', row.id)
          .orderBy('created_at', 'asc')
          .orderBy('id', 'asc')
          .execute()

        return ProjectEntity.fromRow(row, remoteRows.map(GitRemoteEntity.fromRow))
      })
    },
  }
}
