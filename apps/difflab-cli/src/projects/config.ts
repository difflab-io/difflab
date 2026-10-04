import { lstat, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
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
})
// Types -----------------------------------------------------------------------
export type RepoConfig = z.infer<typeof repoConfigSchema>
type ParseResult = { config: RepoConfig } | { errors: string[] }

// API -------------------------------------------------------------------------
export function repoConfigPath(root = process.cwd()) {
  return join(root, 'difflab.yaml')
}

export async function readRepoConfig(root = process.cwd()): Promise<RepoConfig | null> {
  const path = repoConfigPath(root)
  let source: string
  try {
    const entry = await lstat(path)
    if (!entry.isFile())
      throw new InvalidRepoConfig(`Repository config is not a regular file: ${path}`)
    source = await readFile(path, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    if (error instanceof InvalidRepoConfig) throw error
    throw new InvalidRepoConfig(
      `Invalid difflab.yaml at ${path}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
  const result = parseRepoDifflabDotYaml(source)
  if ('errors' in result)
    throw new InvalidRepoConfig(`Invalid difflab.yaml at ${path}: ${result.errors.join('; ')}`)
  return result.config
}

export async function createRepoConfig(config: RepoConfig, root = process.cwd()): Promise<void> {
  await writeFile(repoConfigPath(root), stringify(repoConfigSchema.parse(config)), {
    flag: 'wx',
    mode: 0o644,
  })
}

// Helpers ---------------------------------------------------------------------
function parseRepoDifflabDotYaml(source: string): ParseResult {
  const document = parseDocument(source, { uniqueKeys: true, strict: true })
  const errors = document.errors.map((e) => e.message)
  let value: unknown
  try {
    value = document.toJS({ maxAliasCount: 0 })
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }
  const result = repoConfigSchema.safeParse(value)
  if (!result.success)
    errors.push(...result.error.issues.map((i) => `${i.path.join('.')} ${i.message}`))
  if (errors.length || !result.success) return { errors }
  return { config: result.data }
}
