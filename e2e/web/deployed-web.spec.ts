import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'
import { createE2EContext } from '../common/test-harness.js'

// Setup -----------------------------------------------------------------------
const BASE_URL = process.env.DIFFLAB_E2E_BASE_URL?.trim().replace(/\/+$/, '') ?? ''
const EXPECTED_AUTH_PROVIDER = process.env.DIFFLAB_E2E_AUTH_PROVIDER?.trim() || 'oidc'
const BYPASS_HEADER_NAME = process.env.DIFFLAB_E2E_BYPASS_HEADER?.trim() || ''
const BYPASS_HEADER_VALUE = process.env.DIFFLAB_E2E_BYPASS_VALUE?.trim() || ''

function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra }
  if (BYPASS_HEADER_NAME && BYPASS_HEADER_VALUE) {
    headers[BYPASS_HEADER_NAME] = BYPASS_HEADER_VALUE
  }
  return headers
}

// Tests -----------------------------------------------------------------------
const describeDeployed = BASE_URL ? describe : describe.skip

describeDeployed('given a deployed difflab-web instance (DIFFLAB_E2E_BASE_URL)', () => {
  it('when requesting /, /api/health, and /api/auth/login, then health is 200 and OIDC redirects cleanly with PKCE', async () => {
    // Arrange
    const ctx = await createE2EContext('web', 'deployed-web', 'health-and-oidc-redirect')

    // Act 1: GET /api/health
    const healthRes = await fetch(`${BASE_URL}/api/health`, {
      headers: buildHeaders(),
    })
    const healthJson = (await healthRes.json()) as {
      ok: boolean
      mode: string
      authProvider: string
      apiVersion: string
      auth: { authenticated: boolean; user: unknown }
    }
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

    // Assert 1
    expect(healthRes.status).toBe(200)
    expect(healthRes.headers.get('x-difflab-api-version')).toBeTruthy()
    expect(healthJson.ok).toBe(true)
    expect(healthJson.authProvider).toBe(EXPECTED_AUTH_PROVIDER)
    expect(healthJson.auth.authenticated).toBe(false)

    // Act 2: GET /
    const homeRes = await fetch(`${BASE_URL}/`, {
      headers: buildHeaders(),
    })
    const homeHtml = await homeRes.text()
    await writeFile(join(ctx.rootDir, 'home.html'), homeHtml)

    // Assert 2
    expect(homeRes.status).toBe(200)
    expect(homeRes.headers.get('content-type') ?? '').toContain('text/html')

    // Act 3: GET /api/auth/login (when OIDC is active)
    if (EXPECTED_AUTH_PROVIDER === 'oidc') {
      const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
        headers: buildHeaders(),
        redirect: 'manual',
      })
      const location = loginRes.headers.get('location') ?? ''
      const setCookie = loginRes.headers.get('set-cookie') ?? ''
      await writeFile(
        join(ctx.rootDir, 'login-redirect.json'),
        JSON.stringify(
          {
            status: loginRes.status,
            location,
            hasTxCookie: setCookie.includes('difflab_oidc_tx='),
          },
          null,
          2,
        ),
      )

      // Assert 3: valid PKCE redirect to external OIDC provider
      expect(loginRes.status).toBe(302)
      const redirectUrl = new URL(location)
      expect(redirectUrl.searchParams.get('response_type')).toBe('code')
      expect(redirectUrl.searchParams.get('code_challenge_method')).toBe('S256')
      expect(redirectUrl.searchParams.get('redirect_uri')).toBe(`${BASE_URL}/api/auth/callback`)
      expect(setCookie).toContain('difflab_oidc_tx=')
      expect(setCookie.toLowerCase()).toContain('httponly')
    }
  })
})
