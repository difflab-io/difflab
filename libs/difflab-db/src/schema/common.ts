import { tryValidate } from 'utils/zodx'
import { z } from 'zod'
import { ProjectValidationError } from '../errors.js'

// Constants -------------------------------------------------------------------
/** Default workspace identifier used in local SQLite mode. */
export const LOCAL_WORKSPACE_ID = 'local'

/** Default actor used for local single-owner SQLite queries. */
export const DEFAULT_ACTOR: ActorContext = {
  workspaceId: LOCAL_WORKSPACE_ID,
  userId: null,
}

/** Zod schema for canonical uppercase project keys (`3..16` alphanumeric characters). */
export const projectKeySchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(
    z
      .string()
      .regex(/^[A-Z][A-Z0-9]{2,15}$/, 'Project key must be 3-16 uppercase letters or digits'),
  )

/** Zod schema for workspace identifiers (`1..64` characters). */
export const workspaceIdSchema = z
  .string()
  .trim()
  .min(1, 'Workspace ID must be nonempty and at most 64 characters')
  .max(64, 'Workspace ID must be nonempty and at most 64 characters')

/** Zod schema for role values on `workspace_members`. */
export const workspaceRoleSchema = z.enum(['owner', 'admin', 'member'])

/** Zod schema for ISO-8601 UTC timestamps stored as text. */
export const isoTimestampSchema = z.string().min(1)

// Types -----------------------------------------------------------------------
/** Workspace and optional user identity scoping every database operation. */
export type ActorContext = {
  workspaceId: string
  userId: string | null
}

// API -------------------------------------------------------------------------
/** Normalize and validate a project key, throwing `ProjectValidationError` on failure. */
export function validateProjectKey(key: string): string {
  return tryValidate(
    projectKeySchema,
    key,
    (message, cause) => new ProjectValidationError(message, { cause }),
  )
}

/** Trim and validate a workspace ID, throwing `ProjectValidationError` on failure. */
export function validateWorkspaceId(workspaceId: string): string {
  return tryValidate(
    workspaceIdSchema,
    workspaceId,
    (message, cause) => new ProjectValidationError(message, { cause }),
  )
}
