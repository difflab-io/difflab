import { lstat, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { canonicalGithubUrl } from 'difflab-db'
import { parseDocument, stringify } from 'yaml'
import { z } from 'zod'
import { InvalidRepoConfig } from '../errors.js'

// Constants -------------------------------------------------------------------
const repoConfigSchema = z.strictObject({
  schemaVersion: z.literal(1),
  project: z.strictObject({
    id: z
      .string()
      .regex(
        /^[A-Z][A-Z0-9]{2,15}$/,
        'must be 3-16 uppercase letters/digits and start with a letter',
      ),
  }),
  repository: z.strictObject({ github: z.string().url() }),
})

// Types -----------------------------------------------------------------------
/** Repository config stored in a repository working tree. */
export type RepoConfig = z.infer<typeof repoConfigSchema>

// API -------------------------------------------------------------------------
/** Return the repository config path for a repository root. */
export function repoConfigPath(root: string): string {
  return join(root, 'difflab.yaml')
}

/** Read and validate the repository config, returning null when it is absent. */
export async function readRepoConfig(root: string): Promise<RepoConfig | null> {
  const path = repoConfigPath(root)
  try {
    const entry = await lstat(path)
    if (!entry.isFile())
      throw new InvalidRepoConfig(`Repository config is not a regular file: ${path}`)
    const document = parseDocument(await readFile(path, 'utf8'), { uniqueKeys: true, strict: true })
    if (document.errors.length) throw new Error(document.errors.map((e) => e.message).join('; '))
    const config = repoConfigSchema.safeParse(document.toJS({ maxAliasCount: 0 }))
    if (!config.success)
      throw new Error(config.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; '))
    let canonical: string
    try {
      canonical = canonicalGithubUrl(config.data.repository.github)
    } catch {
      throw new Error('repository.github must be a valid GitHub URL')
    }
    if (canonical !== config.data.repository.github)
      throw new Error('repository.github must be canonical')
    return config.data
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    if (error instanceof InvalidRepoConfig) throw error
    throw new InvalidRepoConfig(
      `Invalid difflab.yaml at ${path}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
}

/** Create a repository config without overwriting an existing file. */
export async function ensureRepoConfig(root: string, config: RepoConfig): Promise<void> {
  const parsed = repoConfigSchema.parse(config)
  await writeFile(repoConfigPath(root), stringify(parsed), { flag: 'wx', mode: 0o644 })
}
