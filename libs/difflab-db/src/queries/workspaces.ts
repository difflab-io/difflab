import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import { isUniqueConstraintError, type DatabaseConfig } from '../db.js'
import { DifflabDbError, ProjectConflictError, ProjectValidationError } from '../errors.js'
import {
  WorkspaceMemberModel,
  WorkspaceModel,
  type DifflabDatabase,
  type Workspace,
  type WorkspaceMember,
  type WorkspaceRole,
} from '../schema/index.js'

// API -------------------------------------------------------------------------
/** Create cloud workspace and membership queries bound to a PostgreSQL Kysely instance. */
export function createWorkspaceQueries(
  db: Kysely<DifflabDatabase>,
  dialect: DatabaseConfig['dialect'],
) {
  const assertCloudDialect = () => {
    if (dialect !== 'postgres') {
      throw new DifflabDbError('Workspace queries require a PostgreSQL database')
    }
  }

  return {
    async createWorkspace(input: { id?: string; slug: string; name: string }): Promise<Workspace> {
      assertCloudDialect()
      const validated = WorkspaceModel.validate({
        id: input.id ?? randomUUID(),
        slug: input.slug,
        name: input.name,
        createdAt: new Date().toISOString(),
      })
      if (!validated.ok) {
        throw new ProjectValidationError(validated.error, { cause: validated.cause })
      }
      const workspace = validated.data
      try {
        await db.insertInto('workspaces').values(workspace).execute()
        return workspace
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ProjectConflictError(`Workspace already exists: ${workspace.slug}`, {
            cause: error,
          })
        }
        throw error
      }
    },

    async getWorkspaceBySlug(slug: string): Promise<Workspace | null> {
      assertCloudDialect()
      const row = await db
        .selectFrom('workspaces')
        .selectAll()
        .where('slug', '=', slug.trim().toLowerCase())
        .executeTakeFirst()
      return row ?? null
    },

    async upsertMember(input: {
      workspaceId: string
      userId: string
      role: WorkspaceRole
    }): Promise<WorkspaceMember> {
      assertCloudDialect()
      const validated = WorkspaceMemberModel.validate({
        workspaceId: input.workspaceId,
        userId: input.userId,
        role: input.role,
        createdAt: new Date().toISOString(),
      })
      if (!validated.ok) {
        throw new ProjectValidationError(validated.error, { cause: validated.cause })
      }
      const candidate = validated.data
      return await db
        .insertInto('workspace_members')
        .values(candidate)
        .onConflict((oc) => oc.columns(['workspaceId', 'userId']).doUpdateSet({ role: input.role }))
        .returningAll()
        .executeTakeFirstOrThrow()
    },

    async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
      assertCloudDialect()
      return await db
        .selectFrom('workspace_members')
        .selectAll()
        .where('workspaceId', '=', workspaceId)
        .orderBy('createdAt', 'asc')
        .execute()
    },
  }
}
