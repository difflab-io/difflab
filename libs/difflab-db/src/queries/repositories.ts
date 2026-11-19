import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import { canonicalGitUrl, repositorySlug } from 'utils/gitx'
import { isUniqueConstraintError } from '../dialects.js'
import { ProjectConflictError, ProjectNotFoundError, ProjectValidationError } from '../errors.js'
import {
  DEFAULT_ACTOR,
  type ActorContext,
  type DifflabDatabase,
  type RepositoriesTable,
  type Repository,
} from '../schema.js'
import { toRepository, validateProjectKey, validateWorkspaceId } from './projects.js'

// API -------------------------------------------------------------------------
export function createRepositoryQueries(db: Kysely<DifflabDatabase>) {
  return {
    async linkRepositoryToProject(
      projectKey: string,
      origin: string,
      actor: ActorContext = DEFAULT_ACTOR,
    ): Promise<Repository> {
      const workspaceId = validateWorkspaceId(actor.workspaceId)
      const key = validateProjectKey(projectKey)
      let url: string
      try {
        url = canonicalGitUrl(origin)
      } catch (error) {
        throw new ProjectValidationError(
          error instanceof Error ? error.message : `Invalid Git URL: ${origin}`,
          { cause: error },
        )
      }

      try {
        return await db.transaction().execute(async (tx) => {
          const project = await tx
            .selectFrom('projects')
            .select(['id', 'key'])
            .where('workspace_id', '=', workspaceId)
            .where('key', '=', key)
            .executeTakeFirst()
          if (!project) throw new ProjectNotFoundError(key)

          const candidate: RepositoriesTable = {
            id: randomUUID(),
            workspace_id: workspaceId,
            project_id: project.id,
            project_key: project.key,
            github_url: url,
            slug: repositorySlug(url),
            created_by_user_id: actor.userId,
            created_at: new Date().toISOString(),
          }

          await tx
            .insertInto('repositories')
            .values(candidate)
            .onConflict((oc) => oc.columns(['workspace_id', 'github_url']).doNothing())
            .execute()

          const existing = await tx
            .selectFrom('repositories')
            .selectAll()
            .where('workspace_id', '=', workspaceId)
            .where('github_url', '=', url)
            .executeTakeFirst()

          if (!existing || existing.project_id !== project.id) {
            throw new ProjectConflictError(
              `Git repository already belongs to another project: ${url}`,
            )
          }

          return toRepository(existing)
        })
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ProjectConflictError(`Repository already exists: ${url}`, { cause: error })
        }
        throw error
      }
    },
  }
}
