import { defineModel } from 'utils/model'
import { z } from 'zod'
import { isoTimestampSchema, workspaceIdSchema, workspaceRoleSchema } from './common.js'

// Constants -------------------------------------------------------------------
/** Zod schema for lowercase URL-safe workspace slugs (`2..63` chars). */
export const workspaceSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9-]{1,62}$/,
    'Workspace slug must be 2-63 lowercase letters, digits, or hyphens',
  )

/** Zod schema for a `workspaces` record (mapped directly via Kysely `CamelCasePlugin`). */
export const workspaceSchema = z.strictObject({
  id: workspaceIdSchema,
  slug: workspaceSlugSchema,
  name: z.string().trim().min(1, 'Workspace name must be nonempty'),
  createdAt: isoTimestampSchema,
})

/** Zod schema for a `workspace_members` record (mapped directly via Kysely `CamelCasePlugin`). */
export const workspaceMemberSchema = z.strictObject({
  workspaceId: workspaceIdSchema,
  userId: z.string().min(1),
  role: workspaceRoleSchema,
  createdAt: isoTimestampSchema,
})

// Types -----------------------------------------------------------------------
/** Supported role values for a workspace member. */
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>

/** Cloud `Workspace` model shared directly between Kysely (`CamelCasePlugin`) and application callers. */
export type Workspace = z.infer<typeof workspaceSchema>

/** Cloud `WorkspaceMember` model shared directly between Kysely (`CamelCasePlugin`) and application callers. */
export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>

// API -------------------------------------------------------------------------
/** Model definition for `Workspace` records with generic `parse` and `validate`. */
export const WorkspaceModel = defineModel({ schema: workspaceSchema })

/** Model definition for `WorkspaceMember` records with generic `parse` and `validate`. */
export const WorkspaceMemberModel = defineModel({ schema: workspaceMemberSchema })
