import { canonicalGitUrl, repositorySlug } from 'utils/gitx'
import { z } from 'zod'
import { ProjectValidationError } from '../errors.js'
import { defineEntity, isoTimestampSchema, projectKeySchema, workspaceIdSchema } from './common.js'

// Constants -------------------------------------------------------------------
/** Zod schema for a persisted snake_case SQL row in the `git_remotes` table (used by Kysely). */
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

/** Zod schema for the camelCase `GitRemote` domain model returned to application callers. */
export const gitRemoteSchema = z.strictObject({
  id: z.string().min(1),
  projectId: projectKeySchema,
  url: z.url(),
  slug: z.string().min(1),
  createdAt: isoTimestampSchema,
})

// Types -----------------------------------------------------------------------
/** Persisted SQL row shape for the `git_remotes` table. */
export type GitRemoteRow = z.infer<typeof gitRemoteRowSchema>

/** Application-facing domain model representing a Git remote linked to a project. */
export type GitRemote = z.infer<typeof gitRemoteSchema>

// API -------------------------------------------------------------------------
/** Entity definition for `git_remotes` rows, canonical URL normalization, and `GitRemote` models. */
export const GitRemoteEntity = defineEntity({
  schema: gitRemoteSchema,
  rowSchema: gitRemoteRowSchema,
  fromRow(row: GitRemoteRow): GitRemote {
    return {
      id: row.id,
      projectId: row.project_key,
      url: row.remote_url,
      slug: row.slug,
      createdAt: row.created_at,
    }
  },
  methods: {
    /** Canonicalize a raw Git remote URL and compute its deterministic directory slug. */
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
  },
})
