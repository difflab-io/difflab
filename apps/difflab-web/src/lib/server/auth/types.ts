import type { AuthProviderKind } from 'difflab-config'

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
  resolveRequest(request: Request): Promise<AuthenticatedSession | null>
  beginLogin?(request: Request): Promise<Response>
  handleCallback?(request: Request): Promise<Response>
  logout?(request: Request): Promise<Response>
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
