import { z } from 'zod'

// Constants -------------------------------------------------------------------
export const harnessKindSchema = z.enum(['agy', 'claude', 'codex', 'pi', 'mock'])
export const worktreeRetentionSchema = z.enum(['on-success', 'retain', 'always'])

export const linearReadyTriggerSchema = z.strictObject({
  on: z.literal('linear.issue.ready'),
  team: z.string().trim().min(1).optional(),
  agent: z.string().trim().min(1).optional(),
  labels: z.array(z.string().trim().min(1)).min(1).optional(),
  flow: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, 'must be a safe hyphenated flow name'),
  harness: harnessKindSchema.optional(),
  flags: z.array(z.string().trim().min(1)).optional(),
})

export const repoFlowsConfigSchema = z.strictObject({
  defaultHarness: harnessKindSchema.optional(),
  retention: worktreeRetentionSchema.optional(),
  triggers: z.array(linearReadyTriggerSchema).optional(),
})

export const repoConfigSchema = z.strictObject({
  schemaVersion: z.literal(1),
  project: z.strictObject({
    id: z
      .string()
      .regex(
        /^[A-Z][A-Z0-9]{2,15}$/,
        'must be 3-16 uppercase letters/digits and start with a letter',
      ),
  }),
  flows: repoFlowsConfigSchema.optional(),
})

// Types -----------------------------------------------------------------------
export type HarnessKind = z.infer<typeof harnessKindSchema>
export type WorktreeRetention = z.infer<typeof worktreeRetentionSchema>
export type LinearReadyTrigger = z.infer<typeof linearReadyTriggerSchema>
export type RepoFlowsConfig = z.infer<typeof repoFlowsConfigSchema>
export type RepoConfig = z.infer<typeof repoConfigSchema>
