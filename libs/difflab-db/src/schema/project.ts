import { defineEntity } from 'utils/entity'
import { tryValidate } from 'utils/zodx'
import { z } from 'zod'
import { ProjectValidationError } from '../errors.js'
import {
  isoTimestampSchema,
  projectKeySchema,
  validateProjectKey,
  workspaceIdSchema,
} from './common.js'
import { gitRemoteSchema, type GitRemote } from './git-remote.js'

// Constants -------------------------------------------------------------------
const projectNameSchema = z
  .string()
  .trim()
  .min(1, 'Project name must be nonempty and at most 100 characters')
  .max(100, 'Project name must be nonempty and at most 100 characters')

/** Zod schema for a `projects` table row (camelCase via Kysely `CamelCasePlugin`). */
export const projectRowSchema = z.strictObject({
  id: z.string().min(1),
  workspaceId: workspaceIdSchema,
  key: projectKeySchema,
  name: projectNameSchema,
  createdByUserId: z.string().min(1).nullable(),
  createdAt: isoTimestampSchema,
})

/** Zod schema for the `Project` domain aggregate returned with its linked `gitRemotes`. */
export const projectSchema = z.strictObject({
  id: projectKeySchema,
  name: projectNameSchema,
  workspaceId: workspaceIdSchema,
  createdByUserId: z.string().min(1).nullable(),
  createdAt: isoTimestampSchema,
  gitRemotes: z.array(gitRemoteSchema),
})

// Types -----------------------------------------------------------------------
/** Persisted table shape for `projects` (without joined `git_remotes`). */
export type ProjectRow = z.infer<typeof projectRowSchema>

/** Application-facing `Project` domain aggregate including its linked `gitRemotes`. */
export type Project = z.infer<typeof projectSchema>

// API -------------------------------------------------------------------------
/** Entity definition for `projects` rows, key/name validation, and `Project` domain aggregates. */
export const ProjectEntity = defineEntity({
  schema: projectSchema,
  methods: {
    /** Compose a `projects` row with its linked `gitRemotes` into a `Project` aggregate. */
    fromRow(row: ProjectRow, gitRemotes: GitRemote[]): Project {
      return projectSchema.parse({
        id: row.key,
        name: row.name,
        workspaceId: row.workspaceId,
        createdByUserId: row.createdByUserId,
        createdAt: row.createdAt,
        gitRemotes,
      })
    },
    /** Normalize and validate a project key. */
    validateKey: validateProjectKey,
    /** Trim and validate a project display name (`1..100` chars). */
    validateName(name: string): string {
      return tryValidate(
        projectNameSchema,
        name,
        (message, cause) => new ProjectValidationError(message, { cause }),
      )
    },
  },
})
