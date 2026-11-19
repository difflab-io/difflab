import { z } from 'zod'
import { ProjectValidationError } from '../errors.js'
import { isoTimestampSchema, workspaceIdSchema, workspaceRoleSchema } from './common.js'

// Constants -------------------------------------------------------------------
export const workspaceSlugSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9-]{1,62}$/,
    'Workspace slug must be 2-63 lowercase letters, digits, or hyphens',
  )

export const workspaceRowSchema = z.strictObject({
  id: workspaceIdSchema,
  slug: workspaceSlugSchema,
  name: z.string().min(1),
  created_at: isoTimestampSchema,
})

export const workspaceSchema = z.strictObject({
  id: workspaceIdSchema,
  slug: workspaceSlugSchema,
  name: z.string().min(1),
  createdAt: isoTimestampSchema,
})

export const workspaceMemberRowSchema = z.strictObject({
  workspace_id: workspaceIdSchema,
  user_id: z.string().min(1),
  role: workspaceRoleSchema,
  created_at: isoTimestampSchema,
})

export const workspaceMemberSchema = z.strictObject({
  workspaceId: workspaceIdSchema,
  userId: z.string().min(1),
  role: workspaceRoleSchema,
  createdAt: isoTimestampSchema,
})

// Types -----------------------------------------------------------------------
export type WorkspaceRow = z.infer<typeof workspaceRowSchema>
export type Workspace = z.infer<typeof workspaceSchema>
export type WorkspaceMemberRow = z.infer<typeof workspaceMemberRowSchema>
export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>

// API -------------------------------------------------------------------------
export const WorkspaceEntity = {
  schema: workspaceSchema,
  rowSchema: workspaceRowSchema,
  validateSlug(rawSlug: string): string {
    const normalized = rawSlug.trim().toLowerCase()
    if (!workspaceSlugSchema.safeParse(normalized).success) {
      throw new ProjectValidationError(
        'Workspace slug must be 2-63 lowercase letters, digits, or hyphens',
      )
    }
    return normalized
  },
  validateName(rawName: string): string {
    const trimmed = rawName.trim()
    if (!trimmed) {
      throw new ProjectValidationError('Workspace name must be nonempty')
    }
    return trimmed
  },
  parse(value: unknown): Workspace {
    return workspaceSchema.parse(value)
  },
  fromRow(row: WorkspaceRow): Workspace {
    return workspaceSchema.parse({
      id: row.id,
      slug: row.slug,
      name: row.name,
      createdAt: row.created_at,
    })
  },
}

export const WorkspaceMemberEntity = {
  schema: workspaceMemberSchema,
  rowSchema: workspaceMemberRowSchema,
  parse(value: unknown): WorkspaceMember {
    return workspaceMemberSchema.parse(value)
  },
  fromRow(row: WorkspaceMemberRow): WorkspaceMember {
    return workspaceMemberSchema.parse({
      workspaceId: row.workspace_id,
      userId: row.user_id,
      role: row.role,
      createdAt: row.created_at,
    })
  },
}
