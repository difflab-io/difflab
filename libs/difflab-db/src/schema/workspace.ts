import { tryValidate } from 'utils/zodx'
import { z } from 'zod'
import { ProjectValidationError } from '../errors.js'
import {
  defineEntity,
  isoTimestampSchema,
  workspaceIdSchema,
  workspaceRoleSchema,
} from './common.js'

// Constants -------------------------------------------------------------------
const workspaceNameSchema = z.string().min(1, 'Workspace name must be nonempty')

/** Zod schema for lowercase URL-safe workspace slugs (`2..63` chars). */
export const workspaceSlugSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9-]{1,62}$/,
    'Workspace slug must be 2-63 lowercase letters, digits, or hyphens',
  )

/** Zod schema for a persisted snake_case SQL row in the `workspaces` table. */
export const workspaceRowSchema = z.strictObject({
  id: workspaceIdSchema,
  slug: workspaceSlugSchema,
  name: workspaceNameSchema,
  created_at: isoTimestampSchema,
})

/** Zod schema for the camelCase `Workspace` domain model. */
export const workspaceSchema = z.strictObject({
  id: workspaceIdSchema,
  slug: workspaceSlugSchema,
  name: workspaceNameSchema,
  createdAt: isoTimestampSchema,
})

/** Zod schema for a persisted snake_case SQL row in the `workspace_members` table. */
export const workspaceMemberRowSchema = z.strictObject({
  workspace_id: workspaceIdSchema,
  user_id: z.string().min(1),
  role: workspaceRoleSchema,
  created_at: isoTimestampSchema,
})

/** Zod schema for the camelCase `WorkspaceMember` domain model. */
export const workspaceMemberSchema = z.strictObject({
  workspaceId: workspaceIdSchema,
  userId: z.string().min(1),
  role: workspaceRoleSchema,
  createdAt: isoTimestampSchema,
})

// Types -----------------------------------------------------------------------
/** Supported role values for a workspace member. */
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>

/** Persisted SQL row shape for the `workspaces` table. */
export type WorkspaceRow = z.infer<typeof workspaceRowSchema>

/** Application-facing cloud `Workspace` domain model. */
export type Workspace = z.infer<typeof workspaceSchema>

/** Persisted SQL row shape for the `workspace_members` table. */
export type WorkspaceMemberRow = z.infer<typeof workspaceMemberRowSchema>

/** Application-facing `WorkspaceMember` domain model. */
export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>

// API -------------------------------------------------------------------------
/** Entity definition for `workspaces` rows, slug/name validation, and `Workspace` models. */
export const WorkspaceEntity = defineEntity({
  schema: workspaceSchema,
  rowSchema: workspaceRowSchema,
  fromRow(row: WorkspaceRow): Workspace {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      createdAt: row.created_at,
    }
  },
  methods: {
    /** Normalize and validate a workspace slug. */
    validateSlug(rawSlug: string): string {
      return tryValidate(
        workspaceSlugSchema,
        rawSlug.trim().toLowerCase(),
        (message, cause) => new ProjectValidationError(message, { cause }),
      )
    },
    /** Trim and validate a workspace display name. */
    validateName(rawName: string): string {
      return tryValidate(
        workspaceNameSchema,
        rawName.trim(),
        (message, cause) => new ProjectValidationError(message, { cause }),
      )
    },
  },
})

/** Entity definition for `workspace_members` rows and `WorkspaceMember` models. */
export const WorkspaceMemberEntity = defineEntity({
  schema: workspaceMemberSchema,
  rowSchema: workspaceMemberRowSchema,
  fromRow(row: WorkspaceMemberRow): WorkspaceMember {
    return {
      workspaceId: row.workspace_id,
      userId: row.user_id,
      role: row.role,
      createdAt: row.created_at,
    }
  },
})
