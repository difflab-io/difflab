import { parsePortValue } from './paths.js'
import type { ApiMode, RemoteClientEnv } from './types.js'

// API -------------------------------------------------------------------------
export function resolveApiMode(env: NodeJS.ProcessEnv = process.env): ApiMode {
  const explicit = env.DIFFLAB_MODE?.trim().toLowerCase()
  if (explicit === 'cloud') return 'cloud'
  if (explicit === 'local') return 'local'
  return env.DATABASE_URL?.trim() ? 'cloud' : 'local'
}

export function resolveRemoteTargetFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RemoteClientEnv | null {
  const rpcUrl = env.DIFFLAB_RPC_URL?.trim()
  if (!rpcUrl) return null
  return {
    rpcUrl,
    token: env.DIFFLAB_API_TOKEN?.trim() || undefined,
    workspaceId: env.DIFFLAB_WORKSPACE?.trim() || undefined,
  }
}

export function parsePortEnv(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined
  return parsePortValue(value.trim())
}
