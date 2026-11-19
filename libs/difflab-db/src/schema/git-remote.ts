import { canonicalGitUrl, repositorySlug } from 'utils/gitx'
import { z } from 'zod'
import { ProjectValidationError } from '../errors.js'
import { isoTimestampSchema, projectKeySchema, workspaceIdSchema } from './common.js'

// Constants -------------------------------------------------------------------
export const gitRemoteRowSchema = z.strictObject({
  id: z.string().min(1),
  workspace_id: workspaceIdSchema,
  project_id: z.string().min(1),
  project_key: projectKeySchema,
  remote_url: z.url(),
  slug: z.string().min(1),
  created_by_user_id: z.string().min(1).nullable(),
  created_at: isoTimestampSchema,
})

export const gitRemoteSchema = z.strictObject({
  id: z.string().min(1),
  projectId: projectKeySchema,
  url: z.url(),
  slug: z.string().min(1),
  createdAt: isoTimestampSchema,
})

// Types -----------------------------------------------------------------------
export type GitRemoteRow = z.infer<typeof gitRemoteRowSchema>
export type GitRemote = z.infer<typeof gitRemoteSchema>

// API -------------------------------------------------------------------------
export const GitRemoteEntity = {
  schema: gitRemoteSchema,
  rowSchema: gitRemoteRowSchema,
  parse(value: unknown): GitRemote {
    return gitRemoteSchema.parse(value)
  },
  normalizeUrl(rawOrigin: string): { url: string; slug: string } {
    try {
      const url = canonicalGitUrl(rawOrigin)
      return { url, slug: repositorySlug(url) }
    } catch (error) {
      throw new ProjectValidationError(
        error instanceof Error ? error.message : `Invalid Git URL: ${rawOrigin}`,
        { cause: error },
      )
    }
  },
  fromRow(row: GitRemoteRow): GitRemote {
    return gitRemoteSchema.parse({
      id: row.id,
      projectId: row.project_key,
      url: row.remote_url,
      slug: row.slug,
      createdAt: row.created_at,
    })
  },
}
