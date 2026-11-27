import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { extractCookiePair, waitForHttpOk } from 'utils/netx'
import { execCommand } from 'utils/processx'
import { createE2EContext, REPO_ROOT, type E2ETestContext } from '../common/test-harness.js'

// Setup -----------------------------------------------------------------------
const BASE_URL = 'http://127.0.0.1:3000'
let ctx: E2ETestContext
let composeProject = ''
let signedInCookie = ''

beforeAll(async () => {
  ctx = await createE2EContext('web', 'compose-oidc', 'dex-oidc-roundtrip')
  composeProject = `difflab-e2e-${Date.now().toString(36)}`

  const up = await runCompose(composeProject, ['up', '-d', '--build', '--wait'])
  if (up.exitCode !== 0) {
    throw new Error(`docker compose up failed (${up.exitCode}):\n${up.stdout}\n${up.stderr}`)
  }

  const migrateLogs = await runCompose(composeProject, ['logs', 'migrate'])
  await writeFile(join(ctx.rootDir, 'compose-migrate.log'), migrateLogs.stdout + migrateLogs.stderr)

  await waitForHttpOk(`${BASE_URL}/api/health`, { timeoutMs: 30000, intervalMs: 300 })
}, 180000)

// Tests -----------------------------------------------------------------------
describe('given docker-compose.yml with postgres, migrate, Dex OIDC, and difflab-web', () => {
  it('when the stack starts, then GET /api/health returns 200 in unauthenticated oidc mode', async () => {
    // Act
    const beforeRes = await fetch(`${BASE_URL}/api/health`)
    const beforeJson = (await beforeRes.json()) as HealthPayload
    await writeFile(
      join(ctx.rootDir, 'health-before-login.json'),
      JSON.stringify(
        {
          status: beforeRes.status,
          apiVersionHeader: beforeRes.headers.get('x-difflab-api-version'),
          body: beforeJson,
        },
        null,
        2,
      ),
    )

    // Assert
    expect(beforeRes.status).toBe(200)
    expect(beforeJson.ok).toBe(true)
    expect(beforeJson.authProvider).toBe('oidc')
    expect(beforeJson.auth.authenticated).toBe(false)
  })

  it('when a user completes Dex OIDC login, then difflab-web issues an HttpOnly JWE cookie and resolves admin@example.com', async () => {
    // Arrange: initiate Better Auth social OIDC sign-in
    const loginRes = await fetch(`${BASE_URL}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE_URL },
      body: JSON.stringify({ provider: 'oidc', callbackURL: '/', disableRedirect: true }),
    })
    expect(loginRes.status).toBe(200)
    const loginPayload = (await loginRes.json()) as { url: string }
    const txCookie = loginRes.headers.getSetCookie().map(extractCookiePair).join('; ')
    const dexAuthUrl = loginPayload.url.replace('http://dex:5556', 'http://127.0.0.1:5556')

    // Act: submit Dex credentials and follow redirect to /api/auth/callback/oidc
    const finalRedirect = await authenticateWithDex(dexAuthUrl, 'admin@example.com', 'password')
    expect(finalRedirect.startsWith(`${BASE_URL}/api/auth/callback/oidc`)).toBe(true)

    const callbackRes = await fetch(finalRedirect, {
      headers: { cookie: txCookie },
      redirect: 'manual',
    })
    const callbackSetCookies = callbackRes.headers.getSetCookie()
    const sessionSetCookie = callbackSetCookies.find((c) => c.includes('better-auth.session_data='))
    signedInCookie = callbackSetCookies.map(extractCookiePair).join('; ')

    const afterLoginRes = await fetch(`${BASE_URL}/api/health`, {
      headers: { cookie: signedInCookie },
    })
    const afterLoginJson = (await afterLoginRes.json()) as HealthPayload
    await writeFile(
      join(ctx.rootDir, 'health-after-login.json'),
      JSON.stringify({ status: afterLoginRes.status, body: afterLoginJson }, null, 2),
    )

    // Assert
    expect(callbackRes.status).toBe(302)
    expect(sessionSetCookie).toContain('HttpOnly')
    expect(afterLoginJson.auth.authenticated).toBe(true)
    expect(afterLoginJson.auth.user?.email).toBe('admin@example.com')
  }, 60000)

  describe('given a signed-in OIDC session', () => {
    it('when requesting POST /api/auth/sign-out, then the session cookie is cleared and /api/health returns unauthenticated', async () => {
      // Arrange
      expect(signedInCookie).toBeTruthy()

      // Act
      const logoutRes = await fetch(`${BASE_URL}/api/auth/sign-out`, {
        method: 'POST',
        headers: { cookie: signedInCookie, origin: BASE_URL },
      })
      const cleared = logoutRes.headers
        .getSetCookie()
        .find((c) => c.includes('better-auth.session_data='))

      const afterLogoutRes = await fetch(`${BASE_URL}/api/health`)
      const afterLogoutJson = (await afterLogoutRes.json()) as HealthPayload
      await writeFile(
        join(ctx.rootDir, 'health-after-logout.json'),
        JSON.stringify({ status: afterLogoutRes.status, body: afterLogoutJson }, null, 2),
      )

      // Assert
      expect(logoutRes.status).toBe(200)
      expect(cleared).toContain('Max-Age=0')
      expect(afterLogoutJson.auth.authenticated).toBe(false)
    })
  })
})

// Cleanup ---------------------------------------------------------------------
afterAll(async () => {
  if (composeProject) {
    const webLogs = await runCompose(composeProject, ['logs', 'web'])
    if (ctx) {
      await writeFile(join(ctx.rootDir, 'compose-web.jsonl'), webLogs.stdout + webLogs.stderr)
    }
    await runCompose(composeProject, ['down', '-v', '--remove-orphans'])
  }
  await ctx?.cleanup()
})

// Helpers ---------------------------------------------------------------------
type HealthPayload = {
  ok: boolean
  mode: string
  authProvider: string
  auth: { authenticated: boolean; user: { email: string | null } | null }
}

async function runCompose(project: string, args: string[]) {
  return await execCommand(
    'docker',
    [
      'compose',
      '-p',
      project,
      '-f',
      'docker-compose.yml',
      '-f',
      'e2e/web/docker-compose.test.yml',
      ...args,
    ],
    { cwd: REPO_ROOT },
  )
}

async function authenticateWithDex(
  dexAuthUrl: string,
  email: string,
  password: string,
): Promise<string> {
  const dexLoginPage = await fetch(dexAuthUrl, { redirect: 'follow' })
  const dexHtml = await dexLoginPage.text()
  const dexCookies = dexLoginPage.headers.getSetCookie().map(extractCookiePair).join('; ')
  const formActionMatch = dexHtml.match(/action="([^"]+)"/)
  if (!formActionMatch) {
    throw new Error(`Dex login page did not render a form action at ${dexLoginPage.url}`)
  }
  const decodedAction = formActionMatch[1]!.replace(/&amp;/g, '&')
  const formUrl = new URL(decodedAction, dexLoginPage.url)

  const submitHeaders: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
  }
  if (dexCookies) submitHeaders.cookie = dexCookies

  const submitRes = await fetch(formUrl, {
    method: 'POST',
    headers: submitHeaders,
    body: new URLSearchParams({ login: email, password }),
    redirect: 'manual',
  })
  if (submitRes.status !== 303) {
    throw new Error(
      `Dex login submit failed (${submitRes.status}) at ${formUrl}: ${await submitRes.text()}`,
    )
  }
  const approvalOrCallback = new URL(submitRes.headers.get('location')!, formUrl)
  return await followUntilCallback(approvalOrCallback)
}

async function followUntilCallback(startUrl: URL): Promise<string> {
  let current = startUrl
  for (let i = 0; i < 6; i += 1) {
    if (current.pathname === '/api/auth/callback/oidc') return current.toString()
    const normalized = new URL(
      current.toString().replace('http://dex:5556', 'http://127.0.0.1:5556'),
    )
    const res = await fetch(normalized, { redirect: 'manual' })
    const loc = res.headers.get('location')
    if (loc) {
      current = new URL(loc, normalized)
      continue
    }
    const html = await res.text()
    const reqMatch = html.match(/name="req" value="([^"]+)"/)
    if (reqMatch) {
      const approveRes = await fetch(normalized, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ req: reqMatch[1]!, approval: 'approve' }),
        redirect: 'manual',
      })
      const nextLoc = approveRes.headers.get('location')
      if (!nextLoc) throw new Error(`Dex approval did not redirect: ${approveRes.status}`)
      current = new URL(nextLoc, normalized)
      continue
    }
    throw new Error(`Unexpected Dex response at ${normalized}: ${res.status}`)
  }
  throw new Error(`Exceeded redirect limit ending at ${current.toString()}`)
}
