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
export const projectRowSchema = z.strictObject({
  id: z.string().min(1),
  workspace_id: workspaceIdSchema,
  key: projectKeySchema,
  name: z.string().min(1).max(100),
  created_by_user_id: z.string().min(1).nullable(),
  created_at: isoTimestampSchema,
})

export const projectSchema = z.strictObject({
  id: projectKeySchema,
  name: z.string().min(1).max(100),
  workspaceId: workspaceIdSchema,
  createdByUserId: z.string().min(1).nullable(),
  createdAt: isoTimestampSchema,
  gitRemotes: z.array(gitRemoteSchema),
})

// Types -----------------------------------------------------------------------
export type ProjectRow = z.infer<typeof projectRowSchema>
export type Project = z.infer<typeof projectSchema>

// API -------------------------------------------------------------------------
export const ProjectEntity = {
  schema: projectSchema,
  rowSchema: projectRowSchema,
  validateKey: validateProjectKey,
  validateName(name: string): string {
    const trimmed = name.trim()
    if (!trimmed || trimmed.length > 100) {
      throw new ProjectValidationError('Project name must be nonempty and at most 100 characters')
    }
    return trimmed
  },
  parse(value: unknown): Project {
    return projectSchema.parse(value)
  },
  fromRow(row: ProjectRow, gitRemotes: GitRemote[]): Project {
    return projectSchema.parse({
      id: row.key,
      name: row.name,
      workspaceId: row.workspace_id,
      createdByUserId: row.created_by_user_id,
      createdAt: row.created_at,
      gitRemotes,
    })
  },
}
