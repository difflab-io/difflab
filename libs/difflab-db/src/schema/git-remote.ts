import { canonicalGitUrl, repositorySlug } from 'utils/gitx'
import { defineModel } from 'utils/model'
import { z } from 'zod'
import { ProjectValidationError } from '../errors.js'
import { isoTimestampSchema, projectKeySchema, workspaceIdSchema } from './common.js'

// Constants -------------------------------------------------------------------
/** Zod schema for a `git_remotes` record (mapped directly via Kysely `CamelCasePlugin`). */
export const gitRemoteSchema = z.strictObject({
  id: z.string().min(1),
  workspaceId: workspaceIdSchema,
  projectId: z.string().min(1),
  projectKey: projectKeySchema,
  remoteUrl: z.url(),
  slug: z.string().min(1),
  createdByUserId: z.string().min(1).nullable(),
  createdAt: isoTimestampSchema,
})

// Types -----------------------------------------------------------------------
/** Persisted `GitRemote` model shared directly between Kysely and application callers. */
export type GitRemote = z.infer<typeof gitRemoteSchema>

// API -------------------------------------------------------------------------
/** Model definition for `GitRemote` records and canonical Git remote URL normalization. */
export const GitRemoteModel = defineModel({
  schema: gitRemoteSchema,
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
