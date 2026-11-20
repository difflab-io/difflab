import { defineEntity } from 'utils/entity'
import { canonicalGitUrl, repositorySlug } from 'utils/gitx'
import { z } from 'zod'
import { ProjectValidationError } from '../errors.js'
import { isoTimestampSchema, projectKeySchema, workspaceIdSchema } from './common.js'

// Constants -------------------------------------------------------------------
/** Zod schema for a `git_remotes` table row (camelCase via Kysely `CamelCasePlugin`). */
export const gitRemoteRowSchema = z.strictObject({
  id: z.string().min(1),
  workspaceId: workspaceIdSchema,
  projectId: z.string().min(1),
  projectKey: projectKeySchema,
  remoteUrl: z.url(),
  slug: z.string().min(1),
  createdByUserId: z.string().min(1).nullable(),
  createdAt: isoTimestampSchema,
})

/** Zod schema for the `GitRemote` domain model projected for application callers. */
export const gitRemoteSchema = z.strictObject({
  id: z.string().min(1),
  projectId: projectKeySchema,
  url: z.url(),
  slug: z.string().min(1),
  createdAt: isoTimestampSchema,
})

// Types -----------------------------------------------------------------------
/** Persisted table shape for `git_remotes` (camelCase via Kysely `CamelCasePlugin`). */
export type GitRemoteRow = z.infer<typeof gitRemoteRowSchema>

/** Application-facing domain model representing a Git remote linked to a project. */
export type GitRemote = z.infer<typeof gitRemoteSchema>

// API -------------------------------------------------------------------------
/** Entity definition for `git_remotes` rows, canonical URL normalization, and `GitRemote` models. */
export const GitRemoteEntity = defineEntity({
  schema: gitRemoteSchema,
  methods: {
    /** Project a persisted `git_remotes` row into its public `GitRemote` domain shape. */
    fromRow(row: GitRemoteRow): GitRemote {
      return gitRemoteSchema.parse({
        id: row.id,
        projectId: row.projectKey,
        url: row.remoteUrl,
        slug: row.slug,
        createdAt: row.createdAt,
      })
    },
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
