import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import { isUniqueConstraintError, type DatabaseConfig } from '../db.js'
import { DifflabDbError, ProjectConflictError } from '../errors.js'
import {
  WorkspaceEntity,
  WorkspaceMemberEntity,
  type DifflabDatabase,
  type Workspace,
  type WorkspaceMember,
  type WorkspaceMemberRow,
  type WorkspaceRole,
  type WorkspaceRow,
} from '../schema/index.js'

// API -------------------------------------------------------------------------
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
      const slug = WorkspaceEntity.validateSlug(input.slug)
      const name = WorkspaceEntity.validateName(input.name)
      const row: WorkspaceRow = {
        id: input.id ?? randomUUID(),
        slug,
        name,
        created_at: new Date().toISOString(),
      }
      try {
        await db.insertInto('workspaces').values(row).execute()
        return WorkspaceEntity.fromRow(row)
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ProjectConflictError(`Workspace already exists: ${slug}`, { cause: error })
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
      return row ? WorkspaceEntity.fromRow(row) : null
    },

    async upsertMember(input: {
      workspaceId: string
      userId: string
      role: WorkspaceRole
    }): Promise<WorkspaceMember> {
      assertCloudDialect()
      const candidate: WorkspaceMemberRow = {
        workspace_id: input.workspaceId,
        user_id: input.userId,
        role: input.role,
        created_at: new Date().toISOString(),
      }
      const saved = await db
        .insertInto('workspace_members')
        .values(candidate)
        .onConflict((oc) =>
          oc.columns(['workspace_id', 'user_id']).doUpdateSet({ role: input.role }),
        )
        .returningAll()
        .executeTakeFirstOrThrow()
      return WorkspaceMemberEntity.fromRow(saved)
    },

    async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
      assertCloudDialect()
      const rows = await db
        .selectFrom('workspace_members')
        .selectAll()
        .where('workspace_id', '=', workspaceId)
        .orderBy('created_at', 'asc')
        .execute()
      return rows.map(WorkspaceMemberEntity.fromRow)
    },
  }
}
