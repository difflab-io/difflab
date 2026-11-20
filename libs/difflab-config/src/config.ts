import { constants } from 'node:fs'
import { open, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { loadConfig } from 'c12'
import { lstatOrNull } from 'utils/fsx'
import { resolveHomeDirectory } from 'utils/osx'
import { tryValidate } from 'utils/zodx'
import { stringify } from 'yaml'
import { z } from 'zod'
import { DifflabConfigError, InvalidRepoConfig } from './errors.js'

// Constants -------------------------------------------------------------------
const REPO_CONFIG_FILE = 'difflab.yaml'

const optionalText = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined)

const strictProjectKeySchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9]{2,15}$/, 'Project key must be 3-16 uppercase letters or digits')

const portNumberSchema = z
  .number({ message: 'Port must be an integer between 0 and 65535' })
  .int('Port must be an integer between 0 and 65535')
  .min(0, 'Port must be an integer between 0 and 65535')
  .max(65535, 'Port must be an integer between 0 and 65535')

/** Zod schema for canonical uppercase Difflab project keys (`3..16` alphanumeric chars). */
export const projectKeySchema = z
  .string()
  .transform((value) => value.trim().toUpperCase())
  .pipe(strictProjectKeySchema)

/** Zod schema validating all Difflab environment variables in one pass. */
export const difflabEnvSchema = z.object({
  DIFFLAB_HOME: optionalText,
  DIFFLAB_MODE: optionalText.pipe(z.enum(['local', 'cloud']).optional()),
  DATABASE_URL: optionalText,
  DIFFLAB_RPC_URL: optionalText,
  DIFFLAB_API_TOKEN: optionalText,
  DIFFLAB_WORKSPACE: optionalText,
  HOST: optionalText,
  PORT: optionalText
    .transform((value) => (value === undefined ? undefined : Number(value)))
    .pipe(portNumberSchema.optional()),
})

/** Zod schema for repository-local `difflab.yaml` manifests. */
export const repoConfigSchema = z.strictObject({
  schemaVersion: z.literal(1),
  project: z.strictObject({
    id: strictProjectKeySchema,
  }),
})

// Types -----------------------------------------------------------------------
/** Deployment mode for `difflab-api` (`local` SQLite or `cloud` PostgreSQL). */
export type ApiMode = 'local' | 'cloud'

/** Resolved filesystem paths under a Difflab state root directory. */
export type DifflabPaths = {
  root: string
  projects: string
  templates: string
  database: string
  legacyDatabase: string
}

/** Remote Connect RPC target derived from environment variables. */
export type RemoteRpcConfig = {
  rpcUrl: string
  token?: string
  workspaceId?: string
}

/** Strongly typed Difflab runtime configuration loaded from environment variables. */
export type DifflabConfig = {
  readonly mode: ApiMode
  readonly paths: DifflabPaths
  readonly host: string
  readonly port: number
  readonly databaseUrl?: string
  readonly apiToken?: string
  readonly remote: RemoteRpcConfig | null
}

/** Parsed repository-local `difflab.yaml` configuration. */
export type RepoConfig = z.infer<typeof repoConfigSchema>

/** Options for loading a `DifflabConfig` snapshot. */
export type DifflabConfigLoadOptions = {
  home?: string
  root?: string
  env?: NodeJS.ProcessEnv
}

// API -------------------------------------------------------------------------
/** Validate environment variables with Zod in one pass and return a typed `DifflabConfig`. */
export function loadDifflabConfig(options: DifflabConfigLoadOptions = {}): DifflabConfig {
  const result = tryValidate(difflabEnvSchema, options.env ?? process.env)
  if (!result.ok) {
    throw new DifflabConfigError(`Invalid Difflab configuration: ${result.error}`, {
      cause: result.cause,
    })
  }
  const parsed = result.data
  const root = resolveRoot(options.root, options.home, parsed.DIFFLAB_HOME)
  const mode: ApiMode = parsed.DIFFLAB_MODE ?? (parsed.DATABASE_URL ? 'cloud' : 'local')

  return {
    mode,
    paths: {
      root,
      projects: join(root, 'projects'),
      templates: join(root, 'templates'),
      database: join(root, 'local.sqlite'),
      legacyDatabase: join(root, 'difflab.sqlite'),
    },
    host: parsed.HOST ?? '127.0.0.1',
    port: parsed.PORT ?? (mode === 'local' ? 0 : 8787),
    databaseUrl: parsed.DATABASE_URL,
    apiToken: parsed.DIFFLAB_API_TOKEN,
    remote: parsed.DIFFLAB_RPC_URL
      ? {
          rpcUrl: parsed.DIFFLAB_RPC_URL,
          token: parsed.DIFFLAB_API_TOKEN,
          workspaceId: parsed.DIFFLAB_WORKSPACE,
        }
      : null,
  }
}

/** Resolve Difflab state paths from an optional `home` directory or `DIFFLAB_HOME`. */
export function resolveDifflabPaths(
  home?: string,
  env: NodeJS.ProcessEnv = process.env,
): DifflabPaths {
  return loadDifflabConfig({ home, env }).paths
}

/** Normalize and validate a canonical uppercase Difflab project key. */
export function validateProjectKey(raw: string): string {
  const result = tryValidate(projectKeySchema, raw)
  if (!result.ok) throw new DifflabConfigError(result.error, { cause: result.cause })
  return result.data
}

/** Return the expected path to `difflab.yaml` inside repository root `dir`. */
export function repoConfigPath(dir: string): string {
  return join(dir, REPO_CONFIG_FILE)
}

/** Load and validate `difflab.yaml` from `dir` via `c12`, returning `null` when absent. */
export async function readRepoConfig(dir: string): Promise<RepoConfig | null> {
  const file = repoConfigPath(dir)
  if (!(await lstatOrNull(file))) return null
  let raw: unknown
  try {
    const loaded = await loadConfig({
      cwd: dir,
      configFile: REPO_CONFIG_FILE,
      rcFile: false,
      globalRc: false,
      packageJson: false,
      dotenv: false,
    })
    raw = loaded.config
  } catch (error) {
    throw new InvalidRepoConfig(`Invalid difflab.yaml (${file}): malformed YAML`, {
      cause: error,
    })
  }
  const result = tryValidate(repoConfigSchema, raw)
  if (!result.ok) {
    throw new InvalidRepoConfig(`Invalid difflab.yaml (${file}): ${result.error}`, {
      cause: result.cause,
    })
  }
  return result.data
}

/** Atomically create `difflab.yaml` in `dir`, failing with `EEXIST` if it already exists. */
export async function writeRepoConfig(config: RepoConfig, dir: string): Promise<string> {
  const result = tryValidate(repoConfigSchema, config)
  if (!result.ok) {
    throw new InvalidRepoConfig(`Invalid difflab.yaml: ${result.error}`, { cause: result.cause })
  }
  const file = repoConfigPath(dir)
  const handle = await open(
    file,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o644,
  )
  try {
    await handle.writeFile(stringify(result.data), 'utf8')
  } catch (error) {
    await handle.close()
    await rm(file, { force: true })
    throw error
  } finally {
    await handle.close()
  }
  return file
}

// Helpers ---------------------------------------------------------------------
function resolveRoot(explicitRoot?: string, home?: string, envDifflabHome?: string): string {
  if (explicitRoot) return resolve(explicitRoot)
  if (home) return join(resolveHomeDirectory(home), '.difflab')
  if (envDifflabHome) return resolve(envDifflabHome)
  return join(homedir(), '.difflab')
}
