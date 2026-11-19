import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import { isUniqueConstraintError, type DatabaseConfig } from '../dialects.js'
import { DifflabDbError, ProjectConflictError, ProjectValidationError } from '../errors.js'
import type {
  DifflabDatabase,
  Workspace,
  WorkspaceMember,
  WorkspaceMembersTable,
  WorkspaceRole,
  WorkspacesTable,
} from '../schema.js'

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
      const slug = input.slug.trim().toLowerCase()
      const name = input.name.trim()
      if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) {
        throw new ProjectValidationError(
          'Workspace slug must be 2-63 lowercase letters, digits, or hyphens',
        )
      }
      if (!name) {
        throw new ProjectValidationError('Workspace name must be nonempty')
      }
      const row: WorkspacesTable = {
        id: input.id ?? randomUUID(),
        slug,
        name,
        created_at: new Date().toISOString(),
      }
      try {
        await db.insertInto('workspaces').values(row).execute()
        return toWorkspace(row)
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
      return row ? toWorkspace(row) : null
    },

    async upsertMember(input: {
      workspaceId: string
      userId: string
      role: WorkspaceRole
    }): Promise<WorkspaceMember> {
      assertCloudDialect()
      const candidate: WorkspaceMembersTable = {
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
      return toWorkspaceMember(saved)
    },

    async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
      assertCloudDialect()
      const rows = await db
        .selectFrom('workspace_members')
        .selectAll()
        .where('workspace_id', '=', workspaceId)
        .orderBy('created_at', 'asc')
        .execute()
      return rows.map(toWorkspaceMember)
    },
  }
}

// Helpers ---------------------------------------------------------------------
function toWorkspace(row: WorkspacesTable): Workspace {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    createdAt: row.created_at,
  }
}

function toWorkspaceMember(row: WorkspaceMembersTable): WorkspaceMember {
  return {
    workspaceId: row.workspace_id,
    userId: row.user_id,
    role: row.role,
    createdAt: row.created_at,
  }
}
