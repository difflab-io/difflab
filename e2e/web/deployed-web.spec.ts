import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'
import { createE2EContext } from '../common/test-harness.js'

// Setup -----------------------------------------------------------------------
const BASE_URL = process.env.DIFFLAB_E2E_BASE_URL?.trim().replace(/\/+$/, '') ?? ''
const EXPECTED_AUTH_PROVIDER = process.env.DIFFLAB_E2E_AUTH_PROVIDER?.trim() || 'oidc'
const BYPASS_HEADER_NAME = process.env.DIFFLAB_E2E_BYPASS_HEADER?.trim() || ''
const BYPASS_HEADER_VALUE = process.env.DIFFLAB_E2E_BYPASS_VALUE?.trim() || ''

const describeDeployed = BASE_URL ? describe : describe.skip
const describeOidc = EXPECTED_AUTH_PROVIDER === 'oidc' ? describe : describe.skip

// Tests -----------------------------------------------------------------------
describeDeployed('given a deployed difflab-web instance (DIFFLAB_E2E_BASE_URL)', () => {
  it('when requesting GET /api/health, then it returns 200 with the expected auth provider and unauthenticated state', async () => {
    // Arrange
    const ctx = await createE2EContext('web', 'deployed-web', 'health')

    // Act
    const healthRes = await fetch(`${BASE_URL}/api/health`, {
      headers: buildHeaders(),
    })
    const healthJson = (await healthRes.json()) as HealthPayload
    await writeFile(
      join(ctx.rootDir, 'health.json'),
      JSON.stringify(
        {
          url: `${BASE_URL}/api/health`,
          status: healthRes.status,
          apiVersionHeader: healthRes.headers.get('x-difflab-api-version'),
          body: healthJson,
        },
        null,
        2,
      ),
    )

    // Assert
    expect(healthRes.status).toBe(200)
    expect(healthRes.headers.get('x-difflab-api-version')).toBeTruthy()
    expect(healthJson.ok).toBe(true)
    expect(healthJson.authProvider).toBe(EXPECTED_AUTH_PROVIDER)
    expect(healthJson.auth.authenticated).toBe(false)
  })

  it('when requesting GET /, then it renders HTML with status 200', async () => {
    // Arrange
    const ctx = await createE2EContext('web', 'deployed-web', 'home')

    // Act
    const homeRes = await fetch(`${BASE_URL}/`, {
      headers: buildHeaders(),
    })
    const homeHtml = await homeRes.text()
    await writeFile(join(ctx.rootDir, 'home.html'), homeHtml)

    // Assert
    expect(homeRes.status).toBe(200)
    expect(homeRes.headers.get('content-type') ?? '').toContain('text/html')
  })

  describeOidc('given OIDC authentication is configured', () => {
    it('when requesting POST /api/auth/sign-in/social, then it returns a PKCE S256 authorize URL and sets an HttpOnly state cookie', async () => {
      // Arrange
      const ctx = await createE2EContext('web', 'deployed-web', 'oidc-login-redirect')

      // Act
      const loginRes = await fetch(`${BASE_URL}/api/auth/sign-in/social`, {
        method: 'POST',
        headers: buildHeaders({
          'content-type': 'application/json',
          origin: BASE_URL,
        }),
        body: JSON.stringify({ provider: 'oidc', callbackURL: '/', disableRedirect: true }),
      })
      const payload = (await loginRes.json()) as { url?: string }
      const location = payload.url ?? ''
      const setCookies = loginRes.headers.getSetCookie()
      const combinedSetCookie = setCookies.join('\n')
      const hasStateCookie = setCookies.some((c) => /better-auth\.(?:oauth_)?state=/.test(c))
      await writeFile(
        join(ctx.rootDir, 'login-redirect.json'),
        JSON.stringify(
          {
            status: loginRes.status,
            location,
            hasStateCookie,
          },
          null,
          2,
        ),
      )

      // Assert
      expect(loginRes.status).toBe(200)
      const redirectUrl = new URL(location)
      expect(redirectUrl.searchParams.get('response_type')).toBe('code')
      expect(redirectUrl.searchParams.get('code_challenge_method')).toBe('S256')
      expect(redirectUrl.searchParams.get('redirect_uri')).toBe(
        `${BASE_URL}/api/auth/callback/oidc`,
      )
      expect(hasStateCookie).toBe(true)
      expect(combinedSetCookie.toLowerCase()).toContain('httponly')
    })
  })
})

// Helpers ---------------------------------------------------------------------
type HealthPayload = {
  ok: boolean
  mode: string
  authProvider: string
  apiVersion: string
  auth: { authenticated: boolean; user: unknown }
}

function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra }
  if (BYPASS_HEADER_NAME && BYPASS_HEADER_VALUE) {
    headers[BYPASS_HEADER_NAME] = BYPASS_HEADER_VALUE
  }
  return headers
}
