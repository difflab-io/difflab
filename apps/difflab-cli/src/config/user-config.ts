import { readFile } from 'node:fs/promises'
import { harnessKindSchema, worktreeRetentionSchema } from 'difflab-db'
import { z } from 'zod'
import { userPaths } from '../store/user-store.js'

// Constants -------------------------------------------------------------------
export const userConfigSchema = z.object({
  appPort: z.number().int().min(0).max(65535).default(4317),
  enginePort: z.number().int().min(0).max(65535).default(4318),
  daemonRigPort: z.number().int().min(0).max(65535).default(4319),
  defaultHarness: harnessKindSchema.default('agy'),
  retention: worktreeRetentionSchema.default('on-success'),
  herdrSession: z.string().min(1).optional(),
  linearApiUrl: z.string().url().default('https://api.linear.app/graphql'),
  linearApiKey: z.string().optional(),
  linearPollIntervalMs: z.number().int().min(0).default(0),
})

// Types -----------------------------------------------------------------------
export type UserConfig = z.infer<typeof userConfigSchema>

// API -------------------------------------------------------------------------
export async function readUserConfig(home?: string): Promise<UserConfig> {
  const { config } = userPaths(home)
  try {
    const raw = await readFile(config, 'utf8')
    const parsed = Bun.TOML.parse(raw)
    return userConfigSchema.parse(parsed)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return userConfigSchema.parse({})
    }
    throw error
  }
}
