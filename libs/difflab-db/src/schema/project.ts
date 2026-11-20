import { tryValidate } from 'utils/zodx'
import { z } from 'zod'
import { ProjectValidationError } from '../errors.js'
import {
  defineEntity,
  isoTimestampSchema,
  projectKeySchema,
  validateProjectKey,
  workspaceIdSchema,
} from './common.js'
import { gitRemoteSchema, type GitRemote } from './git-remote.js'

// Constants -------------------------------------------------------------------
const projectNameSchema = z
  .string()
  .min(1, 'Project name must be nonempty and at most 100 characters')
  .max(100, 'Project name must be nonempty and at most 100 characters')

/** Zod schema for a persisted snake_case SQL row in the `projects` table (used by Kysely). */
export const projectRowSchema = z.strictObject({
  id: z.string().min(1),
  workspace_id: workspaceIdSchema,
  key: projectKeySchema,
  name: projectNameSchema,
  created_by_user_id: z.string().min(1).nullable(),
  created_at: isoTimestampSchema,
})

/** Zod schema for the camelCase `Project` domain aggregate returned with its linked `gitRemotes`. */
export const projectSchema = z.strictObject({
  id: projectKeySchema,
  name: projectNameSchema,
  workspaceId: workspaceIdSchema,
  createdByUserId: z.string().min(1).nullable(),
  createdAt: isoTimestampSchema,
  gitRemotes: z.array(gitRemoteSchema),
})

// Types -----------------------------------------------------------------------
/** Persisted SQL row shape for the `projects` table (without joined `git_remotes`). */
export type ProjectRow = z.infer<typeof projectRowSchema>

/** Application-facing `Project` domain aggregate including its linked `gitRemotes`. */
export type Project = z.infer<typeof projectSchema>

// API -------------------------------------------------------------------------
/** Entity definition for `projects` rows, key/name validation, and `Project` domain aggregates. */
export const ProjectEntity = defineEntity({
  schema: projectSchema,
  rowSchema: projectRowSchema,
  fromRow(row: ProjectRow, gitRemotes: GitRemote[]): Project {
    return {
      id: row.key,
      name: row.name,
      workspaceId: row.workspace_id,
      createdByUserId: row.created_by_user_id,
      createdAt: row.created_at,
      gitRemotes,
    }
  },
  methods: {
    /** Normalize and validate a project key. */
    validateKey: validateProjectKey,
    /** Trim and validate a project display name (`1..100` chars). */
    validateName(name: string): string {
      return tryValidate(
        projectNameSchema,
        name.trim(),
        (message, cause) => new ProjectValidationError(message, { cause }),
      )
    },
  },
})
