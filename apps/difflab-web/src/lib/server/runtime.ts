import { loadDifflabConfig, type DifflabConfig } from 'difflab-config'
import { configureAppLogger, createAppLogger, resolveLogLevel } from 'utils/logx'
import { createAuthProvider, type AuthProvider } from './auth/index.js'

// Constants -------------------------------------------------------------------
export const API_VERSION = '2026-11-01'
export const SUPPORTED_API_VERSIONS = [API_VERSION] as const
export const MIN_CLIENT_VERSION = '0.1.0'
export const LATEST_CLIENT_VERSION = process.env.DIFFLAB_LATEST_CLIENT_VERSION ?? '0.1.0'

export const webLogger = createAppLogger(['web', 'http'])

// Types -----------------------------------------------------------------------
/** Singleton runtime services shared across SvelteKit request handlers. */
export type WebRuntime = {
  readonly config: DifflabConfig
  readonly authProvider: AuthProvider
}

// API -------------------------------------------------------------------------
let cachedRuntime: WebRuntime | null = null
let loggerConfigured = false

/** Lazily initialize and return the `WebRuntime` for the current process environment. */
export function getWebRuntime(env: NodeJS.ProcessEnv = process.env): WebRuntime {
  if (!loggerConfigured) {
    configureAppLogger({
      level: resolveLogLevel(env, 'info'),
      format: 'jsonl',
    })
    loggerConfigured = true
  }
  if (!cachedRuntime) {
    const config = loadDifflabConfig({ env })
    const authProvider = createAuthProvider(config)
    cachedRuntime = { config, authProvider }
  }
  return cachedRuntime
}

/** Reset cached runtime state (intended for tests). */
export function resetWebRuntime(): void {
  cachedRuntime = null
}
