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
} from '../schema/index.js'
import { DEFAULT_ACTOR, type ActorContext } from '../types.js'

// API -------------------------------------------------------------------------
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
            .where('workspace_id', '=', workspaceId)
            .where('key', '=', key)
            .executeTakeFirst()
          if (!project) throw new ProjectNotFoundError(key)

          const candidate: GitRemoteRow = {
            id: randomUUID(),
            workspace_id: workspaceId,
            project_id: project.id,
            project_key: project.key,
            remote_url: url,
            slug,
            created_by_user_id: actor.userId,
            created_at: new Date().toISOString(),
          }

          await tx
            .insertInto('git_remotes')
            .values(candidate)
            .onConflict((oc) => oc.columns(['workspace_id', 'remote_url']).doNothing())
            .execute()

          const existing = await tx
            .selectFrom('git_remotes')
            .selectAll()
            .where('workspace_id', '=', workspaceId)
            .where('remote_url', '=', url)
            .executeTakeFirst()

          if (!existing || existing.project_id !== project.id) {
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
