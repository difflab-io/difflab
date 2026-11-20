import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import { isUniqueConstraintError } from '../db.js'
import { ProjectConflictError, ProjectNotFoundError, ProjectValidationError } from '../errors.js'
import {
  DEFAULT_ACTOR,
  GitRemoteModel,
  ProjectModel,
  validateWorkspaceId,
  type ActorContext,
  type DifflabDatabase,
  type GitRemote,
  type ProjectWithRemotes,
} from '../schema/index.js'

// API -------------------------------------------------------------------------
/** Create project CRUD queries bound to a Kysely database instance. */
export function createProjectQueries(db: Kysely<DifflabDatabase>) {
  return {
    async createProject(
      key: string,
      name: string,
      initialOrigins: string[] = [],
      actor: ActorContext = DEFAULT_ACTOR,
    ): Promise<ProjectWithRemotes> {
      const workspaceId = validateWorkspaceId(actor.workspaceId)
      const validated = ProjectModel.validate({
        id: randomUUID(),
        workspaceId,
        key,
        name,
        createdByUserId: actor.userId,
        createdAt: new Date().toISOString(),
      })
      if (!validated.ok) {
        throw new ProjectValidationError(validated.error, { cause: validated.cause })
      }
      const project = validated.data
      const normalizedRemotes = initialOrigins.map(GitRemoteModel.normalizeUrl)
      const uniqueUrls = new Set(normalizedRemotes.map((item) => item.url))
      if (uniqueUrls.size !== normalizedRemotes.length) {
        throw new ProjectConflictError('Duplicate Git remote URLs')
      }

      try {
        return await db.transaction().execute(async (tx) => {
          await tx.insertInto('projects').values(project).execute()
          const gitRemotes: GitRemote[] = []
          for (const remote of normalizedRemotes) {
            const record: GitRemote = {
              id: randomUUID(),
              workspaceId,
              projectId: project.id,
              projectKey: project.key,
              remoteUrl: remote.url,
              slug: remote.slug,
              createdByUserId: actor.userId,
              createdAt: new Date().toISOString(),
            }
            await tx.insertInto('git_remotes').values(record).execute()
            gitRemotes.push(record)
          }
          return { ...project, gitRemotes }
        })
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ProjectConflictError(
            `Project key or Git remote already exists: ${project.key}`,
            { cause: error },
          )
        }
        throw error
      }
    },

    async listProjects(actor: ActorContext = DEFAULT_ACTOR): Promise<ProjectWithRemotes[]> {
      const workspaceId = validateWorkspaceId(actor.workspaceId)
      return db.transaction().execute(async (tx) => {
        const projects = await tx
          .selectFrom('projects')
          .selectAll()
          .where('workspaceId', '=', workspaceId)
          .orderBy('key', 'asc')
          .execute()

        const remotes = await tx
          .selectFrom('git_remotes')
          .selectAll()
          .where('workspaceId', '=', workspaceId)
          .orderBy('createdAt', 'asc')
          .orderBy('id', 'asc')
          .execute()

        return projects.map((project) => ({
          ...project,
          gitRemotes: remotes.filter((remote) => remote.projectId === project.id),
        }))
      })
    },

    async getProjectById(
      key: string,
      actor: ActorContext = DEFAULT_ACTOR,
    ): Promise<ProjectWithRemotes> {
      const workspaceId = validateWorkspaceId(actor.workspaceId)
      const projectKey = ProjectModel.validateKey(key)
      return db.transaction().execute(async (tx) => {
        const project = await tx
          .selectFrom('projects')
          .selectAll()
          .where('workspaceId', '=', workspaceId)
          .where('key', '=', projectKey)
          .executeTakeFirst()
        if (!project) throw new ProjectNotFoundError(projectKey)

        const gitRemotes = await tx
          .selectFrom('git_remotes')
          .selectAll()
          .where('workspaceId', '=', workspaceId)
          .where('projectId', '=', project.id)
          .orderBy('createdAt', 'asc')
          .orderBy('id', 'asc')
          .execute()

        return { ...project, gitRemotes }
      })
    },
  }
}
