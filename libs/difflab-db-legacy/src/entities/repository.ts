import { z } from 'zod'

// Constants -------------------------------------------------------------------
export const repositorySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  url: z.string().url(),
  slug: z.string(),
})

// Types -----------------------------------------------------------------------
export type Repository = z.infer<typeof repositorySchema>

// API -------------------------------------------------------------------------
export const validateRepository = (value: unknown): Repository => repositorySchema.parse(value)
