import { defineModel } from 'utils/model'
import { tryValidate } from 'utils/zodx'
import { z } from 'zod'
import { ProjectValidationError } from '../errors.js'
import {
  isoTimestampSchema,
  projectKeySchema,
  validateProjectKey,
  workspaceIdSchema,
} from './common.js'
import type { GitRemote } from './git-remote.js'

// Constants -------------------------------------------------------------------
const projectNameSchema = z
  .string()
  .trim()
  .min(1, 'Project name must be nonempty and at most 100 characters')
  .max(100, 'Project name must be nonempty and at most 100 characters')

/** Zod schema for a `projects` record (mapped directly via Kysely `CamelCasePlugin`). */
export const projectSchema = z.strictObject({
  id: z.string().min(1),
  workspaceId: workspaceIdSchema,
  key: projectKeySchema,
  name: projectNameSchema,
  createdByUserId: z.string().min(1).nullable(),
  createdAt: isoTimestampSchema,
})

// Types -----------------------------------------------------------------------
/** Persisted `Project` table model shared directly between Kysely and application callers. */
export type Project = z.infer<typeof projectSchema>

/** `Project` model hydrated with its linked `gitRemotes`. */
export type ProjectWithRemotes = Project & { gitRemotes: GitRemote[] }

// API -------------------------------------------------------------------------
/** Model definition for `Project` records and key/name validation. */
export const ProjectModel = defineModel({
  schema: projectSchema,
  methods: {
    /** Normalize and validate a project key. */
    validateKey: validateProjectKey,
    /** Trim and validate a project display name (`1..100` chars). */
    validateName(name: string): string {
      const result = tryValidate(projectNameSchema, name)
      if (!result.ok) throw new ProjectValidationError(result.error, { cause: result.cause })
      return result.data
    },
  },
})
