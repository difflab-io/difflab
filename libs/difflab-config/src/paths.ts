import { realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { ConfigurationError } from './errors.js'
import type { DifflabPaths } from './types.js'

// API -------------------------------------------------------------------------
export function resolveDifflabPaths(
  home?: string,
  env: NodeJS.ProcessEnv = process.env,
): DifflabPaths {
  const root = resolveStateRoot(home, env)
  return resolveDifflabPathsFromRoot(root, env)
}

export function resolveDifflabPathsFromRoot(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): DifflabPaths {
  const daemonLog = env.DIFFLAB_DAEMON_LOG_PATH?.trim()
    ? resolve(env.DIFFLAB_DAEMON_LOG_PATH.trim())
    : join(root, 'api.log')
  return {
    root,
    projects: join(root, 'projects'),
    templates: join(root, 'templates'),
    database: join(root, 'local.sqlite'),
    legacyDatabase: join(root, 'difflab.sqlite'),
    daemonLog,
  }
}

export function parsePortValue(raw: string): number {
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new ConfigurationError(`Invalid port value: ${raw} (expected integer 0-65535)`)
  }
  return parsed
}

export function validateProjectKeyFormat(key: string): string {
  const normalized = key.trim().toUpperCase()
  if (!/^[A-Z][A-Z0-9]{2,15}$/.test(normalized)) {
    throw new ConfigurationError('Project key must be 3-16 uppercase letters or digits')
  }
  return normalized
}

// Helpers ---------------------------------------------------------------------
function resolveStateRoot(home: string | undefined, env: NodeJS.ProcessEnv): string {
  if (home !== undefined) {
    return join(realOrResolved(home), '.difflab')
  }
  const configuredHome = env.DIFFLAB_HOME?.trim()
  if (configuredHome) {
    return realOrResolved(configuredHome)
  }
  return join(realOrResolved(env.HOME || homedir()), '.difflab')
}

function realOrResolved(targetPath: string): string {
  const resolved = resolve(targetPath)
  try {
    return realpathSync(resolved)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      try {
        return join(realpathSync(dirname(resolved)), basename(resolved))
      } catch {
        return resolved
      }
    }
    throw error
  }
}
