import { spawn } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DaemonStartOptions } from 'utils/daemonx'
import { ConfigurationError } from '../errors.js'

// Constants -------------------------------------------------------------------
const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

// Types -----------------------------------------------------------------------
export type DifflabPaths = {
  root: string
  projects: string
  templates: string
  database: string
  daemonLog: string
}

// API -------------------------------------------------------------------------
export function resolveDifflabPaths(home?: string): DifflabPaths {
  const root = resolveStateRoot(home)
  const daemonLog = process.env.DIFFLAB_DAEMON_LOG_PATH?.trim()
    ? resolve(process.env.DIFFLAB_DAEMON_LOG_PATH.trim())
    : join(root, 'api.log')
  return {
    root,
    projects: join(root, 'projects'),
    templates: join(root, 'templates'),
    database: join(root, 'local.sqlite'),
    daemonLog,
  }
}

export function buildDaemonStartOptions(options: {
  stateDir: string
  port?: number
  logPath?: string
}): DaemonStartOptions {
  const port = options.port ?? 0
  const apiEntry = resolveApiEntrypoint()
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DIFFLAB_HOME: options.stateDir,
    DIFFLAB_MODE: 'local',
  }
  delete env.DATABASE_URL

  return {
    stateDir: options.stateDir,
    command: process.execPath,
    args: [apiEntry, '--port', String(port), '--state-dir', options.stateDir],
    env,
    logPath: options.logPath ?? resolveDifflabPathsFromRoot(options.stateDir).daemonLog,
  }
}

export async function runDaemonForeground(options: {
  stateDir: string
  port: number
}): Promise<void> {
  const start = buildDaemonStartOptions(options)
  await new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn(start.command, start.args, {
      env: start.env,
      stdio: 'inherit',
    })
    const forwardSigint = () => child.kill('SIGINT')
    const forwardSigterm = () => child.kill('SIGTERM')
    process.on('SIGINT', forwardSigint)
    process.on('SIGTERM', forwardSigterm)
    child.on('error', (error) => {
      process.off('SIGINT', forwardSigint)
      process.off('SIGTERM', forwardSigterm)
      rejectRun(error)
    })
    child.on('exit', (code) => {
      process.off('SIGINT', forwardSigint)
      process.off('SIGTERM', forwardSigterm)
      if (code && code !== 0) {
        process.exitCode = code
      }
      resolveRun()
    })
  })
}

export function parseDaemonPort(raw: string): number {
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new ConfigurationError(`Invalid --port value: ${raw} (expected integer 0-65535)`)
  }
  return parsed
}

export function validateProjectKey(key: string): string {
  const normalized = key.trim().toUpperCase()
  if (!/^[A-Z][A-Z0-9]{2,15}$/.test(normalized)) {
    throw new ConfigurationError('Project key must be 3-16 uppercase letters or digits')
  }
  return normalized
}

// Helpers ---------------------------------------------------------------------
function resolveStateRoot(home?: string): string {
  if (home !== undefined) {
    return join(realOrResolved(home), '.difflab')
  }
  const configuredHome = process.env.DIFFLAB_HOME?.trim()
  if (configuredHome) {
    return realOrResolved(configuredHome)
  }
  return join(realOrResolved(process.env.HOME || homedir()), '.difflab')
}

function resolveDifflabPathsFromRoot(root: string): DifflabPaths {
  const daemonLog = process.env.DIFFLAB_DAEMON_LOG_PATH?.trim()
    ? resolve(process.env.DIFFLAB_DAEMON_LOG_PATH.trim())
    : join(root, 'api.log')
  return {
    root,
    projects: join(root, 'projects'),
    templates: join(root, 'templates'),
    database: join(root, 'local.sqlite'),
    daemonLog,
  }
}

function realOrResolved(targetPath: string): string {
  try {
    return realpathSync(targetPath)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      const parent = dirname(resolve(targetPath))
      try {
        return join(
          realpathSync(parent),
          resolve(targetPath).slice(dirname(resolve(targetPath)).length + 1),
        )
      } catch {
        return resolve(targetPath)
      }
    }
    throw error
  }
}

function resolveApiEntrypoint(): string {
  const explicit = process.env.DIFFLAB_API_ENTRY?.trim()
  if (explicit) return resolve(explicit)

  const candidates = [
    resolve(MODULE_DIR, '../../../difflab-api/src/index.ts'),
    resolve(MODULE_DIR, './api.js'),
    resolve(MODULE_DIR, '../../difflab-api/dist/index.js'),
    resolve(MODULE_DIR, '../../difflab-api/src/index.ts'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new ConfigurationError('Unable to locate difflab-api server entrypoint')
}
