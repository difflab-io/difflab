import { betterAuth } from 'better-auth'
import { genericOAuth } from 'better-auth/plugins'
import type { OidcAuthConfig } from 'difflab-config'
import type { AuthenticatedSession, AuthProvider } from './types.js'

// Constants -------------------------------------------------------------------
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

// Types -----------------------------------------------------------------------
/** Configured Better Auth instance for stateless OIDC cookie sessions. */
export type BetterAuthInstance = ReturnType<typeof createBetterAuth>

// API -------------------------------------------------------------------------
/** Create a Better Auth instance configured for stateless JWE cookies and generic OIDC discovery. */
export function createBetterAuth(config: OidcAuthConfig) {
  const discoveryUrl = `${config.issuerUrl.replace(/\/+$/, '')}/.well-known/openid-configuration`
  return betterAuth({
    basePath: '/api/auth',
    secret: config.sessionSecret,
    trustedOrigins: (request) => {
      if (!request) return []
      const url = new URL(request.url)
      const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
      const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
      if (proto) url.protocol = `${proto}:`
      if (host) url.host = host
      return [url.origin]
    },
    user: {
      additionalFields: {
        oidcSub: {
          type: 'string',
          required: false,
        },
      },
    },
    session: {
      expiresIn: SESSION_MAX_AGE_SECONDS,
      cookieCache: {
        enabled: true,
        maxAge: SESSION_MAX_AGE_SECONDS,
        strategy: 'jwe',
        refreshCache: true,
      },
    },
    account: {
      storeStateStrategy: 'cookie',
      storeAccountCookie: false,
    },
    plugins: [
      genericOAuth({
        config: [
          {
            providerId: 'oidc',
            discoveryUrl,
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            scopes: ['openid', 'profile', 'email'],
            pkce: true,
            requireIdTokenVerification: true,
            mapProfileToUser: (profile) => ({
              oidcSub: typeof profile.sub === 'string' ? profile.sub : String(profile.sub ?? ''),
            }),
          },
        ],
      }),
    ],
  })
}

/** Create a generic OpenID Connect `AuthProvider` backed by Better Auth in stateless JWE cookie mode. */
export function createOidcAuthProvider(config: OidcAuthConfig): AuthProvider {
  const auth = createBetterAuth(config)
  return {
    kind: 'oidc',
    betterAuth: auth,
    async resolveRequest(request: Request): Promise<AuthenticatedSession | null> {
      const session = await auth.api.getSession({ headers: request.headers })
      if (!session?.user) return null
      const oidcSub =
        typeof (session.user as { oidcSub?: unknown }).oidcSub === 'string'
          ? (session.user as { oidcSub: string }).oidcSub
          : null
      return {
        userId: oidcSub || session.user.id,
        email: session.user.email ?? null,
        name: session.user.name ?? null,
        workspaceId: 'default',
        via: 'session',
      }
    },
  }
}
