import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import { isUniqueConstraintError } from '../db.js'
import { ProjectConflictError, ProjectNotFoundError } from '../errors.js'
import {
  DEFAULT_ACTOR,
  GitRemoteEntity,
  ProjectEntity,
  validateWorkspaceId,
  type ActorContext,
  type DifflabDatabase,
  type GitRemote,
  type GitRemoteRow,
} from '../schema/index.js'

// API -------------------------------------------------------------------------
/** Create Git remote link queries bound to a Kysely database instance. */
export function createGitRemoteQueries(db: Kysely<DifflabDatabase>) {
  return {
    async linkGitRemoteToProject(
      projectKey: string,
      origin: string,
      actor: ActorContext = DEFAULT_ACTOR,
    ): Promise<GitRemote> {
      const workspaceId = validateWorkspaceId(actor.workspaceId)
      const key = ProjectEntity.validateKey(projectKey)
      const { url, slug } = GitRemoteEntity.normalizeUrl(origin)

      try {
        return await db.transaction().execute(async (tx) => {
          const project = await tx
            .selectFrom('projects')
            .select(['id', 'key'])
            .where('workspaceId', '=', workspaceId)
            .where('key', '=', key)
            .executeTakeFirst()
          if (!project) throw new ProjectNotFoundError(key)

          const candidate: GitRemoteRow = {
            id: randomUUID(),
            workspaceId,
            projectId: project.id,
            projectKey: project.key,
            remoteUrl: url,
            slug,
            createdByUserId: actor.userId,
            createdAt: new Date().toISOString(),
          }

          await tx
            .insertInto('git_remotes')
            .values(candidate)
            .onConflict((oc) => oc.columns(['workspaceId', 'remoteUrl']).doNothing())
            .execute()

          const existing = await tx
            .selectFrom('git_remotes')
            .selectAll()
            .where('workspaceId', '=', workspaceId)
            .where('remoteUrl', '=', url)
            .executeTakeFirst()

          if (!existing || existing.projectId !== project.id) {
            throw new ProjectConflictError(`Git remote already belongs to another project: ${url}`)
          }

          return GitRemoteEntity.fromRow(existing)
        })
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ProjectConflictError(`Git remote already exists: ${url}`, { cause: error })
        }
        throw error
      }
    },
  }
}
