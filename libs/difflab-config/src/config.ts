import { constants } from 'node:fs'
import { open, readFile, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { hasErrorCode, resolveHomeDirectory } from 'utils/osx'
import { tryValidate } from 'utils/zodx'
import { parse, stringify } from 'yaml'
import { z } from 'zod'
import { DifflabConfigError, InvalidRepoConfig } from './errors.js'

// Constants -------------------------------------------------------------------
const REPO_CONFIG_FILE = 'difflab.yaml'

const optionalTrimmedString = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim()
    return trimmed ? trimmed : undefined
  })

/** Zod schema for canonical uppercase Difflab project keys (`3..16` alphanumeric chars). */
export const projectKeySchema = z
  .string()
  .transform((value) => value.trim().toUpperCase())
  .pipe(
    z
      .string()
      .regex(/^[A-Z][A-Z0-9]{2,15}$/, 'Project key must be 3-16 uppercase letters or digits'),
  )

/** Zod schema for strict canonical project keys stored in `difflab.yaml`. */
const strictProjectKeySchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9]{2,15}$/, 'Project key must be 3-16 uppercase letters or digits')

/** Zod schema for TCP port values (`0..65535`). */
export const portSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() !== '' ? Number(value.trim()) : value),
  z
    .number({ message: 'Port must be an integer between 0 and 65535' })
    .int('Port must be an integer between 0 and 65535')
    .min(0, 'Port must be an integer between 0 and 65535')
    .max(65535, 'Port must be an integer between 0 and 65535'),
)

/** Zod schema validating all Difflab environment variables in one pass. */
export const difflabEnvSchema = z.object({
  DIFFLAB_HOME: optionalTrimmedString,
  DIFFLAB_MODE: optionalTrimmedString.pipe(z.enum(['local', 'cloud']).optional()),
  DATABASE_URL: optionalTrimmedString,
  DIFFLAB_RPC_URL: optionalTrimmedString,
  DIFFLAB_API_TOKEN: optionalTrimmedString,
  DIFFLAB_WORKSPACE: optionalTrimmedString,
  HOST: optionalTrimmedString,
  PORT: optionalTrimmedString
    .transform((value) => (value === undefined ? undefined : Number(value)))
    .pipe(
      z
        .number({ message: 'Port must be an integer between 0 and 65535' })
        .int('Port must be an integer between 0 and 65535')
        .min(0, 'Port must be an integer between 0 and 65535')
        .max(65535, 'Port must be an integer between 0 and 65535')
        .optional(),
    ),
})

/** Zod schema for repository-local `difflab.yaml` manifests. */
export const repoConfigSchema = z.strictObject({
  schemaVersion: z.literal(1),
  project: z.strictObject({
    id: strictProjectKeySchema,
  }),
})

// Types -----------------------------------------------------------------------
/** Deployment mode for `difflab-api` (`local` SQLite daemon or `cloud` PostgreSQL service). */
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

/** Parsed repository-local `difflab.yaml` configuration. */
export type RepoConfig = z.infer<typeof repoConfigSchema>

/** Options for loading a `DifflabConfig` snapshot. */
export type DifflabConfigLoadOptions = {
  home?: string
  root?: string
  env?: NodeJS.ProcessEnv
}

// API -------------------------------------------------------------------------
/** Strongly typed, Zod-validated configuration and path resolver for Difflab apps and libraries. */
export class DifflabConfig {
  readonly mode: ApiMode
  readonly paths: DifflabPaths
  readonly host: string
  readonly port: number
  readonly databaseUrl?: string
  readonly apiToken?: string
  readonly remote: RemoteRpcConfig | null

  private constructor(fields: {
    mode: ApiMode
    paths: DifflabPaths
    host: string
    port: number
    databaseUrl?: string
    apiToken?: string
    remote: RemoteRpcConfig | null
  }) {
    this.mode = fields.mode
    this.paths = fields.paths
    this.host = fields.host
    this.port = fields.port
    this.databaseUrl = fields.databaseUrl
    this.apiToken = fields.apiToken
    this.remote = fields.remote
  }

  /** Validate environment variables with Zod in one pass and return a typed `DifflabConfig`. */
  static load(options: DifflabConfigLoadOptions = {}): DifflabConfig {
    const env = options.env ?? process.env
    const parsed = tryValidate(
      difflabEnvSchema,
      env,
      (message, cause) =>
        new DifflabConfigError(`Invalid Difflab configuration: ${message}`, { cause }),
    )
    const root = resolveRoot(options.root, options.home, parsed.DIFFLAB_HOME)
    const mode: ApiMode = parsed.DIFFLAB_MODE ?? (parsed.DATABASE_URL ? 'cloud' : 'local')
    const paths = pathsFromRoot(root)
    const remote: RemoteRpcConfig | null = parsed.DIFFLAB_RPC_URL
      ? {
          rpcUrl: parsed.DIFFLAB_RPC_URL,
          token: parsed.DIFFLAB_API_TOKEN,
          workspaceId: parsed.DIFFLAB_WORKSPACE,
        }
      : null

    return new DifflabConfig({
      mode,
      paths,
      host: parsed.HOST ?? '127.0.0.1',
      port: parsed.PORT ?? (mode === 'local' ? 0 : 8787),
      databaseUrl: parsed.DATABASE_URL,
      apiToken: parsed.DIFFLAB_API_TOKEN,
      remote,
    })
  }

  /** Build a `DifflabConfig` anchored at an explicit state directory `root`. */
  static fromRoot(root: string, env: NodeJS.ProcessEnv = process.env): DifflabConfig {
    return DifflabConfig.load({ root, env })
  }

  /** Resolve Difflab state paths from an optional `home` directory or `DIFFLAB_HOME`. */
  static resolvePaths(home?: string, env: NodeJS.ProcessEnv = process.env): DifflabPaths {
    return DifflabConfig.load({ home, env }).paths
  }

  /** Parse and validate a TCP port value (`0..65535`). */
  static parsePort(raw: string | number): number {
    return tryValidate(
      portSchema,
      raw,
      (message, cause) => new DifflabConfigError(message, { cause }),
    )
  }

  /** Normalize and validate a canonical uppercase Difflab project key. */
  static validateProjectKey(raw: string): string {
    return tryValidate(
      projectKeySchema,
      raw,
      (message, cause) => new DifflabConfigError(message, { cause }),
    )
  }

  /** Return the expected path to `difflab.yaml` inside repository root `dir`. */
  static repoPath(dir: string): string {
    return join(dir, REPO_CONFIG_FILE)
  }

  /** Read and validate `difflab.yaml` from `dir`, returning `null` when absent. */
  static async readRepo(dir: string): Promise<RepoConfig | null> {
    const file = DifflabConfig.repoPath(dir)
    let raw: string
    try {
      raw = await readFile(file, 'utf8')
    } catch (error) {
      if (hasErrorCode(error, 'ENOENT')) return null
      throw new InvalidRepoConfig(`Cannot read ${file}`, { cause: error })
    }
    let parsed: unknown
    try {
      parsed = parse(raw)
    } catch (error) {
      throw new InvalidRepoConfig(`Invalid difflab.yaml (${file}): malformed YAML`, {
        cause: error,
      })
    }
    return tryValidate(
      repoConfigSchema,
      parsed,
      (message, cause) =>
        new InvalidRepoConfig(`Invalid difflab.yaml (${file}): ${message}`, { cause }),
    )
  }

  /** Atomically create `difflab.yaml` in `dir`, failing with `EEXIST` if it already exists. */
  static async writeRepo(config: RepoConfig, dir: string): Promise<string> {
    const valid = tryValidate(
      repoConfigSchema,
      config,
      (message, cause) => new InvalidRepoConfig(`Invalid difflab.yaml: ${message}`, { cause }),
    )
    const file = DifflabConfig.repoPath(dir)
    const handle = await open(
      file,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o644,
    )
    try {
      await handle.writeFile(stringify(valid), 'utf8')
    } catch (error) {
      await handle.close()
      await rm(file, { force: true })
      throw error
    } finally {
      await handle.close()
    }
    return file
  }
}

// Helpers ---------------------------------------------------------------------
function resolveRoot(explicitRoot?: string, home?: string, envDifflabHome?: string): string {
  if (explicitRoot) return resolve(explicitRoot)
  if (home) return join(resolveHomeDirectory(home), '.difflab')
  if (envDifflabHome) return resolve(envDifflabHome)
  return join(homedir(), '.difflab')
}

function pathsFromRoot(root: string): DifflabPaths {
  return {
    root,
    projects: join(root, 'projects'),
    templates: join(root, 'templates'),
    database: join(root, 'local.sqlite'),
    legacyDatabase: join(root, 'difflab.sqlite'),
  }
}
