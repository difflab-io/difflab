import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'bun:test'
import { loadDifflabConfig } from 'difflab-config'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { extractCookiePair } from 'utils/netx'
import { createAuthProvider } from './index.js'

// Setup -----------------------------------------------------------------------
const cleanups: Array<() => Promise<void> | void> = []

// Tests -----------------------------------------------------------------------
describe('when authenticating requests in difflab-web', () => {
  describe('given a mock OIDC discovery and JWKS server', () => {
    it('should complete PKCE login, issue an encrypted HttpOnly cookie, resolve the session, and clear on logout', async () => {
      // Arrange
      const idp = await startMockOidcServer()
      const config = loadDifflabConfig({
        env: {
          DIFFLAB_MODE: 'cloud',
          DIFFLAB_AUTH_PROVIDER: 'oidc',
          OIDC_ISSUER_URL: idp.issuerUrl,
          OIDC_CLIENT_ID: 'difflab-web',
          OIDC_CLIENT_SECRET: 'oidc-test-secret',
          SESSION_SECRET: 'test-session-secret-at-least-32-bytes',
        },
      })
      const auth = createAuthProvider(config)

      // Act: begin login via Better Auth native social sign-in route
      const loginResp = await auth.betterAuth!.handler(
        new Request('http://127.0.0.1:3000/api/auth/sign-in/social', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'http://127.0.0.1:3000',
          },
          body: JSON.stringify({ provider: 'oidc', callbackURL: '/', disableRedirect: true }),
        }),
      )
      expect(loginResp.status).toBe(200)
      const loginPayload = (await loginResp.json()) as { url: string }
      const authorizeUrl = new URL(loginPayload.url)
      const txSetCookies = loginResp.headers.getSetCookie()
      expect(txSetCookies.some((c) => c.toLowerCase().includes('httponly'))).toBe(true)
      const txCookieHeader = txSetCookies.map(extractCookiePair).join('; ')

      // Act: simulate IdP redirect back to /api/auth/callback/oidc with code & state
      const code = idp.issueCode({
        nonce: authorizeUrl.searchParams.get('nonce')!,
        codeChallenge: authorizeUrl.searchParams.get('code_challenge')!,
        email: 'alice@example.com',
        name: 'Alice',
        sub: 'user-123',
      })
      const callbackUrl = new URL('http://127.0.0.1:3000/api/auth/callback/oidc')
      callbackUrl.searchParams.set('code', code)
      callbackUrl.searchParams.set('state', authorizeUrl.searchParams.get('state')!)

      const callbackResp = await auth.betterAuth!.handler(
        new Request(callbackUrl, {
          headers: { cookie: txCookieHeader },
        }),
      )

      // Assert: session cookie issued and resolves session with deterministic OIDC sub
      expect(callbackResp.status).toBe(302)
      expect(callbackResp.headers.get('location')).toBe('/')
      const setCookies = callbackResp.headers.getSetCookie()
      expect(setCookies.some((c) => c.includes('better-auth.session_data='))).toBe(true)
      expect(setCookies.every((c) => c.toLowerCase().includes('httponly'))).toBe(true)
      const sessionCookieHeader = setCookies.map(extractCookiePair).join('; ')

      const session = await auth.resolveRequest(
        new Request('http://127.0.0.1:3000/api/health', {
          headers: { cookie: sessionCookieHeader },
        }),
      )
      expect(session).toEqual({
        userId: 'user-123',
        email: 'alice@example.com',
        name: 'Alice',
        workspaceId: 'default',
        via: 'session',
      })

      // Assert: a fresh provider instance (simulating serverless cold start) resolves the same deterministic OIDC sub
      const coldStartAuth = createAuthProvider(config)
      const coldStartSession = await coldStartAuth.resolveRequest(
        new Request('http://127.0.0.1:3000/api/health', {
          headers: { cookie: sessionCookieHeader },
        }),
      )
      expect(coldStartSession).toEqual(session)

      // Act: logout clears Better Auth session cookies
      const logoutResp = await auth.betterAuth!.handler(
        new Request('http://127.0.0.1:3000/api/auth/sign-out', {
          method: 'POST',
          headers: {
            cookie: sessionCookieHeader,
            origin: 'http://127.0.0.1:3000',
          },
        }),
      )
      expect(logoutResp.status).toBe(200)
      const clearedCookies = logoutResp.headers.getSetCookie()
      expect(
        clearedCookies.some(
          (c) => c.includes('better-auth.session_data=') && c.includes('Max-Age=0'),
        ),
      ).toBe(true)
    })

    it('should reject callback when state mismatches without setting a session cookie', async () => {
      // Arrange
      const idp = await startMockOidcServer()
      const config = loadDifflabConfig({
        env: {
          DIFFLAB_MODE: 'cloud',
          DIFFLAB_AUTH_PROVIDER: 'oidc',
          OIDC_ISSUER_URL: idp.issuerUrl,
          OIDC_CLIENT_ID: 'difflab-web',
          OIDC_CLIENT_SECRET: 'oidc-test-secret',
          SESSION_SECRET: 'test-session-secret-at-least-32-bytes',
        },
      })
      const auth = createAuthProvider(config)
      const loginResp = await auth.betterAuth!.handler(
        new Request('http://127.0.0.1:3000/api/auth/sign-in/social', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'http://127.0.0.1:3000',
          },
          body: JSON.stringify({ provider: 'oidc', callbackURL: '/', disableRedirect: true }),
        }),
      )
      const txCookie = loginResp.headers.getSetCookie().map(extractCookiePair).join('; ')

      // Act
      const callbackResp = await auth.betterAuth!.handler(
        new Request('http://127.0.0.1:3000/api/auth/callback/oidc?code=bad&state=wrong-state', {
          headers: { cookie: txCookie },
        }),
      )

      // Assert: redirects to error and sets no session cookie
      expect(callbackResp.status).toBe(302)
      expect(callbackResp.headers.get('location') ?? '').toContain('error=')
      expect(
        callbackResp.headers.getSetCookie().some((c) => c.includes('better-auth.session_data=')),
      ).toBe(false)
    })
  })

  describe('given DIFFLAB_MODE=local on loopback', () => {
    it('should resolve a local session without cookies or tokens', async () => {
      // Arrange
      const config = loadDifflabConfig({ env: { DIFFLAB_MODE: 'local' } })
      const auth = createAuthProvider(config)

      // Act
      const session = await auth.resolveRequest(new Request('http://127.0.0.1:3000/api/health'))

      // Assert
      expect(session).toEqual({
        userId: null,
        email: null,
        name: 'Local Developer',
        workspaceId: 'local',
        via: 'loopback',
      })
    })
  })
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  while (cleanups.length > 0) {
    const fn = cleanups.pop()
    await fn?.()
  }
})

// Helpers ---------------------------------------------------------------------
async function startMockOidcServer() {
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  const jwk = await exportJWK(publicKey)
  jwk.kid = 'test-key-1'
  jwk.alg = 'RS256'
  jwk.use = 'sig'

  const issuedCodes = new Map<
    string,
    { nonce: string; codeChallenge: string; email: string; name: string; sub: string }
  >()

  let issuerUrl = ''
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)
      if (url.pathname === '/.well-known/openid-configuration') {
        return Response.json({
          issuer: issuerUrl,
          authorization_endpoint: `${issuerUrl}/authorize`,
          token_endpoint: `${issuerUrl}/token`,
          jwks_uri: `${issuerUrl}/jwks`,
          end_session_endpoint: `${issuerUrl}/logout`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
          code_challenge_methods_supported: ['S256'],
        })
      }
      if (url.pathname === '/jwks') {
        return Response.json({ keys: [jwk] })
      }
      if (url.pathname === '/token' && req.method === 'POST') {
        const body = new URLSearchParams(await req.text())
        const code = body.get('code') ?? ''
        const verifier = body.get('code_verifier') ?? ''
        const record = issuedCodes.get(code)
        if (!record) {
          return Response.json({ error: 'invalid_grant' }, { status: 400 })
        }
        const computedChallenge = createHash('sha256').update(verifier).digest('base64url')
        if (computedChallenge !== record.codeChallenge) {
          return Response.json({ error: 'invalid_grant' }, { status: 400 })
        }
        issuedCodes.delete(code)
        const idToken = await new SignJWT({
          sub: record.sub,
          email: record.email,
          name: record.name,
          nonce: record.nonce,
        })
          .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
          .setIssuer(issuerUrl)
          .setAudience('difflab-web')
          .setIssuedAt()
          .setExpirationTime('5m')
          .sign(privateKey)
        return Response.json({
          access_token: 'mock-access-token',
          token_type: 'Bearer',
          id_token: idToken,
          expires_in: 300,
        })
      }
      return new Response('Not found', { status: 404 })
    },
  })
  issuerUrl = `http://127.0.0.1:${server.port}`
  cleanups.push(() => server.stop(true))

  return {
    issuerUrl,
    issueCode(entry: {
      nonce: string
      codeChallenge: string
      email: string
      name: string
      sub: string
    }): string {
      const code = `code-${crypto.randomUUID()}`
      issuedCodes.set(code, entry)
      return code
    },
  }
}
