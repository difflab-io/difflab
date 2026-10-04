import { z } from 'zod'
import { repositorySchema } from './repository.js'

// Constants -------------------------------------------------------------------
export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  repositories: z.array(z.lazy(() => repositorySchema)),
})

// Types -----------------------------------------------------------------------
export type Project = z.infer<typeof projectSchema>

// API -------------------------------------------------------------------------
export const validateProject = (value: unknown): Project => projectSchema.parse(value)
