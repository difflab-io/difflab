import { betterAuth } from 'better-auth'
import { genericOAuth } from 'better-auth/plugins'
import type { OidcAuthConfig } from 'difflab-config'
import { DifflabWebAuthError, type AuthenticatedSession, type AuthProvider } from './types.js'

// Constants -------------------------------------------------------------------
const CALLBACK_PATH = '/api/auth/callback'
const PROVIDER_ID = 'oidc'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

// Types -----------------------------------------------------------------------
type BetterAuthInstance = ReturnType<typeof createBetterAuthForOrigin>

// API -------------------------------------------------------------------------
/** Create a generic OpenID Connect `AuthProvider` backed by Better Auth in stateless JWE cookie mode. */
export function createOidcAuthProvider(config: OidcAuthConfig): AuthProvider {
  const instances = new Map<string, BetterAuthInstance>()

  const getAuth = (origin: string): BetterAuthInstance => {
    let instance = instances.get(origin)
    if (!instance) {
      instance = createBetterAuthForOrigin(origin, config)
      instances.set(origin, instance)
    }
    return instance
  }

  return {
    kind: 'oidc',

    async resolveRequest(request: Request): Promise<AuthenticatedSession | null> {
      const origin = resolveExternalUrl(request).origin
      const auth = getAuth(origin)
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

    async beginLogin(request: Request): Promise<Response> {
      const requestUrl = resolveExternalUrl(request)
      const returnTo = sanitizeReturnTo(requestUrl.searchParams.get('returnTo'))
      const auth = getAuth(requestUrl.origin)

      const response = await auth.api.signInSocial({
        body: {
          provider: PROVIDER_ID,
          callbackURL: new URL(returnTo, requestUrl.origin).toString(),
          disableRedirect: true,
        },
        headers: request.headers,
        asResponse: true,
      })

      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new DifflabWebAuthError(
          `OIDC login initiation failed (${response.status}): ${detail}`,
          502,
        )
      }

      const payload = (await response.json()) as { url?: string }
      if (!payload.url) {
        throw new DifflabWebAuthError('OIDC login did not return an authorization URL', 502)
      }

      const headers = new Headers({ location: payload.url })
      for (const cookie of response.headers.getSetCookie()) {
        headers.append('set-cookie', cookie)
      }
      return new Response(null, { status: 302, headers })
    },

    async handleCallback(request: Request): Promise<Response> {
      const requestUrl = resolveExternalUrl(request)
      const auth = getAuth(requestUrl.origin)
      const rewrittenUrl = new URL(requestUrl.toString())
      rewrittenUrl.pathname = `/api/auth/callback/${PROVIDER_ID}`

      const response = await auth.handler(
        new Request(rewrittenUrl, {
          method: request.method,
          headers: request.headers,
        }),
      )

      const location = response.headers.get('location')
      if (location) {
        const target = new URL(location, requestUrl.origin)
        const errorParam = target.searchParams.get('error')
        if (errorParam) {
          throw new DifflabWebAuthError(`OIDC callback verification failed: ${errorParam}`, 401)
        }
      }

      if (response.status >= 400) {
        throw new DifflabWebAuthError('OIDC callback verification failed', 401)
      }

      return response
    },

    async logout(request: Request): Promise<Response> {
      const requestUrl = resolveExternalUrl(request)
      const postLogoutRedirect = new URL('/', requestUrl.origin).toString()
      const auth = getAuth(requestUrl.origin)

      const response = await auth.api.signOut({
        headers: request.headers,
        asResponse: true,
      })

      let target = postLogoutRedirect
      try {
        const payload = (await response.json()) as { url?: string; redirect?: string }
        if (typeof payload.url === 'string' && payload.url) {
          target = payload.url
        } else if (typeof payload.redirect === 'string' && payload.redirect) {
          target = payload.redirect
        }
      } catch {
        // Use local post-logout redirect if response body is empty.
      }

      const headers = new Headers({ location: target })
      for (const cookie of response.headers.getSetCookie()) {
        headers.append('set-cookie', cookie)
      }
      return new Response(null, { status: 302, headers })
    },
  }
}

// Helpers ---------------------------------------------------------------------
function createBetterAuthForOrigin(origin: string, config: OidcAuthConfig) {
  const discoveryUrl = `${config.issuerUrl.replace(/\/+$/, '')}/.well-known/openid-configuration`
  return betterAuth({
    baseURL: origin,
    basePath: '/api/auth',
    secret: config.sessionSecret,
    trustedOrigins: [origin],
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
            providerId: PROVIDER_ID,
            discoveryUrl,
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            scopes: ['openid', 'profile', 'email'],
            pkce: true,
            requireIdTokenVerification: true,
            redirectURI: `${origin}${CALLBACK_PATH}`,
            postLogoutRedirectURI: `${origin}/`,
            mapProfileToUser: (profile) => ({
              oidcSub: typeof profile.sub === 'string' ? profile.sub : String(profile.sub ?? ''),
            }),
          },
        ],
      }),
    ],
  })
}

function resolveExternalUrl(request: Request): URL {
  const url = new URL(request.url)
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  if (forwardedProto) url.protocol = `${forwardedProto}:`
  if (forwardedHost) url.host = forwardedHost
  return url
}

function sanitizeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/'
  return raw
}
