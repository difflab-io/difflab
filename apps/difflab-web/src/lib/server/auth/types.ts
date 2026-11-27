import type { AuthProviderKind } from 'difflab-config'
import type { BetterAuthInstance } from './oidc.js'

// Types -----------------------------------------------------------------------
/** Authenticated caller identity attached to SvelteKit `event.locals`. */
export type AuthenticatedSession = {
  readonly userId: string | null
  readonly email?: string | null
  readonly name?: string | null
  readonly workspaceId: string
  readonly via: 'loopback' | 'bearer' | 'session'
}

/** Pluggable server authentication provider for local, token, and generic OIDC modes. */
export type AuthProvider = {
  readonly kind: AuthProviderKind
  readonly betterAuth?: BetterAuthInstance
  resolveRequest(request: Request): Promise<AuthenticatedSession | null>
}

/** Semantic authentication error carrying an HTTP status code. */
export class DifflabWebAuthError extends Error {
  readonly status: number

  constructor(message: string, status: number, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DifflabWebAuthError'
    this.status = status
  }
}
