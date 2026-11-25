import { timingSafeEqual } from 'node:crypto'
import type { DifflabConfig } from 'difflab-config'
import { createOidcAuthProvider, type OidcAuthProviderOptions } from './oidc.js'
import { DifflabWebAuthError, type AuthenticatedSession, type AuthProvider } from './types.js'

// Constants -------------------------------------------------------------------
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

// API -------------------------------------------------------------------------
/** Create the configured `AuthProvider` (`local`, `token`, or generic `oidc`). */
export function createAuthProvider(
  config: DifflabConfig,
  options: OidcAuthProviderOptions = {},
): AuthProvider {
  if (config.authProvider === 'local') {
    return createLocalAuthProvider()
  }
  if (config.authProvider === 'oidc') {
    if (!config.oidc) {
      throw new DifflabWebAuthError('OIDC configuration missing for oidc auth provider', 500)
    }
    const oidcProvider = createOidcAuthProvider(config.oidc, options)
    return {
      ...oidcProvider,
      async resolveRequest(request: Request): Promise<AuthenticatedSession | null> {
        const bearer = resolveBearerToken(request, config.apiToken)
        if (bearer) return bearer
        return await oidcProvider.resolveRequest(request)
      },
    }
  }
  return createTokenAuthProvider(config.apiToken)
}

// Helpers ---------------------------------------------------------------------
function createLocalAuthProvider(): AuthProvider {
  return {
    kind: 'local',
    async resolveRequest(request: Request): Promise<AuthenticatedSession | null> {
      const host = new URL(request.url).hostname.toLowerCase()
      if (!LOOPBACK_HOSTS.has(host)) return null
      return {
        userId: null,
        email: null,
        name: 'Local Developer',
        workspaceId: 'local',
        via: 'loopback',
      }
    },
  }
}

function createTokenAuthProvider(apiToken?: string): AuthProvider {
  return {
    kind: 'token',
    async resolveRequest(request: Request): Promise<AuthenticatedSession | null> {
      return resolveBearerToken(request, apiToken)
    },
  }
}

function resolveBearerToken(request: Request, expectedToken?: string): AuthenticatedSession | null {
  if (!expectedToken) return null
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  const presented = header.slice('Bearer '.length).trim()
  if (!constantTimeEquals(presented, expectedToken)) return null
  const workspaceId = request.headers.get('x-difflab-workspace')?.trim()
  if (!workspaceId || workspaceId.length > 64) {
    throw new DifflabWebAuthError('Missing or invalid x-difflab-workspace header', 400)
  }
  return {
    userId: null,
    email: null,
    name: null,
    workspaceId,
    via: 'bearer',
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
