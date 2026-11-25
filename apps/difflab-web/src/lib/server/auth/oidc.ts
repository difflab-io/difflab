import type { OidcAuthConfig } from 'difflab-config'
import * as client from 'openid-client'
import {
  formatCookie,
  OIDC_TX_COOKIE_NAME,
  readCookie,
  sealOidcTransaction,
  sealSession,
  SESSION_COOKIE_NAME,
  unsealOidcTransaction,
  unsealSession,
} from './session.js'
import { DifflabWebAuthError, type AuthenticatedSession, type AuthProvider } from './types.js'

// Constants -------------------------------------------------------------------
const CALLBACK_PATH = '/api/auth/callback'
const DEFAULT_SCOPE = 'openid profile email'

// Types -----------------------------------------------------------------------
/** Optional overrides for testing `createOidcAuthProvider`. */
export type OidcAuthProviderOptions = {
  readonly fetch?: client.CustomFetch
}

// API -------------------------------------------------------------------------
/** Create a generic OpenID Connect `AuthProvider` using standard OIDC discovery and PKCE. */
export function createOidcAuthProvider(
  config: OidcAuthConfig,
  options: OidcAuthProviderOptions = {},
): AuthProvider {
  let discovered: Promise<client.Configuration> | null = null

  const getConfiguration = (): Promise<client.Configuration> => {
    if (!discovered) {
      const issuer = new URL(config.issuerUrl)
      const execute = issuer.protocol === 'http:' ? [client.allowInsecureRequests] : []
      discovered = client
        .discovery(issuer, config.clientId, config.clientSecret, undefined, {
          execute,
          [client.customFetch]: options.fetch,
        })
        .catch((error) => {
          discovered = null
          throw error
        })
    }
    return discovered
  }

  return {
    kind: 'oidc',

    async resolveRequest(request: Request): Promise<AuthenticatedSession | null> {
      const cookie = readCookie(request, SESSION_COOKIE_NAME)
      if (!cookie) return null
      return await unsealSession(cookie, config.sessionSecret)
    },

    async beginLogin(request: Request): Promise<Response> {
      const oidcConfig = await getConfiguration()
      const requestUrl = resolveExternalUrl(request)
      const redirectUri = new URL(CALLBACK_PATH, requestUrl.origin).toString()
      const codeVerifier = client.randomPKCECodeVerifier()
      const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier)
      const state = client.randomState()
      const nonce = client.randomNonce()
      const returnTo = sanitizeReturnTo(requestUrl.searchParams.get('returnTo'))

      const authUrl = client.buildAuthorizationUrl(oidcConfig, {
        redirect_uri: redirectUri,
        scope: DEFAULT_SCOPE,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state,
        nonce,
      })

      const sealedTx = await sealOidcTransaction(
        { state, codeVerifier, nonce, returnTo },
        config.sessionSecret,
      )
      const headers = new Headers({ location: authUrl.toString() })
      headers.append(
        'set-cookie',
        formatCookie(OIDC_TX_COOKIE_NAME, sealedTx, {
          maxAge: 600,
          secure: isSecureRequest(requestUrl),
        }),
      )
      return new Response(null, { status: 302, headers })
    },

    async handleCallback(request: Request): Promise<Response> {
      const requestUrl = resolveExternalUrl(request)
      const txCookie = readCookie(request, OIDC_TX_COOKIE_NAME)
      if (!txCookie) {
        throw new DifflabWebAuthError('Missing OIDC transaction cookie', 400)
      }
      const tx = await unsealOidcTransaction(txCookie, config.sessionSecret)
      if (!tx) {
        throw new DifflabWebAuthError('Invalid or expired OIDC transaction cookie', 400)
      }

      const oidcConfig = await getConfiguration()
      let tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
      try {
        tokens = await client.authorizationCodeGrant(oidcConfig, requestUrl, {
          pkceCodeVerifier: tx.codeVerifier,
          expectedState: tx.state,
          expectedNonce: tx.nonce,
          idTokenExpected: true,
        })
      } catch (error) {
        throw new DifflabWebAuthError('OIDC callback verification failed', 401, { cause: error })
      }

      const claims = tokens.claims()
      if (!claims || typeof claims.sub !== 'string') {
        throw new DifflabWebAuthError('OIDC ID token missing subject claim', 401)
      }

      const session: AuthenticatedSession = {
        userId: claims.sub,
        email: typeof claims.email === 'string' ? claims.email : null,
        name: typeof claims.name === 'string' ? claims.name : null,
        workspaceId: 'default',
        via: 'session',
      }
      const sealedSession = await sealSession(session, config.sessionSecret)
      const secure = isSecureRequest(requestUrl)
      const headers = new Headers({ location: new URL(tx.returnTo, requestUrl.origin).toString() })
      headers.append(
        'set-cookie',
        formatCookie(SESSION_COOKIE_NAME, sealedSession, { maxAge: 60 * 60 * 24 * 7, secure }),
      )
      headers.append('set-cookie', formatCookie(OIDC_TX_COOKIE_NAME, '', { maxAge: 0, secure }))
      return new Response(null, { status: 302, headers })
    },

    async logout(request: Request): Promise<Response> {
      const requestUrl = resolveExternalUrl(request)
      const postLogoutRedirect = new URL('/', requestUrl.origin).toString()
      let target = postLogoutRedirect
      try {
        const oidcConfig = await getConfiguration()
        const endSession = oidcConfig.serverMetadata().end_session_endpoint
        if (endSession) {
          target = client
            .buildEndSessionUrl(oidcConfig, { post_logout_redirect_uri: postLogoutRedirect })
            .toString()
        }
      } catch {
        target = postLogoutRedirect
      }

      const secure = isSecureRequest(requestUrl)
      const headers = new Headers({ location: target })
      headers.append('set-cookie', formatCookie(SESSION_COOKIE_NAME, '', { maxAge: 0, secure }))
      headers.append('set-cookie', formatCookie(OIDC_TX_COOKIE_NAME, '', { maxAge: 0, secure }))
      return new Response(null, { status: 302, headers })
    },
  }
}

// Helpers ---------------------------------------------------------------------
function resolveExternalUrl(request: Request): URL {
  const url = new URL(request.url)
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  if (forwardedProto) url.protocol = `${forwardedProto}:`
  if (forwardedHost) url.host = forwardedHost
  return url
}

function isSecureRequest(url: URL): boolean {
  return url.protocol === 'https:'
}

function sanitizeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/'
  return raw
}
