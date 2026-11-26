import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'bun:test'
import { createE2EContext, REPO_ROOT, type E2ETestContext } from '../common/test-harness.js'

// Setup -----------------------------------------------------------------------
const contexts: E2ETestContext[] = []
const composeProjects: string[] = []

// Tests -----------------------------------------------------------------------
describe('given docker-compose.yml + e2e/web/docker-compose.test.yml (postgres -> migrate -> Dex OIDC + web)', () => {
  it('when compose starts and completes Dex OIDC login and logout, then health transitions false -> true -> false and saves artifacts', async () => {
    // Arrange
    const ctx = await createE2EContext('web', 'compose-oidc', 'dex-oidc-roundtrip')
    contexts.push(ctx)
    const project = `difflab-e2e-${Date.now().toString(36)}`
    composeProjects.push(project)

    // Act: bring up compose stack (postgres -> migrate -> dex + web)
    const up = await runCompose(project, ['up', '-d', '--build', '--wait'])
    expect(up.exitCode).toBe(0)

    const migrateLogs = await runCompose(project, ['logs', 'migrate'])
    await writeFile(
      join(ctx.rootDir, 'compose-migrate.log'),
      migrateLogs.stdout + migrateLogs.stderr,
    )

    const baseUrl = 'http://127.0.0.1:3000'
    await waitForUrl(`${baseUrl}/api/health`, 30000)

    // Assert 1: signed out before login
    const beforeRes = await fetch(`${baseUrl}/api/health`)
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
    expect(beforeRes.status).toBe(200)
    expect(beforeJson.ok).toBe(true)
    expect(beforeJson.authProvider).toBe('oidc')
    expect(beforeJson.auth.authenticated).toBe(false)

    // Act 2: /api/auth/login -> Dex OIDC -> password submit -> /api/auth/callback
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, { redirect: 'manual' })
    expect(loginRes.status).toBe(302)
    const txCookie = extractCookiePair(loginRes.headers.get('set-cookie')!)
    const dexAuthUrl = loginRes.headers
      .get('location')!
      .replace('http://dex:5556', 'http://127.0.0.1:5556')

    const dexLoginPage = await fetch(dexAuthUrl, { redirect: 'follow' })
    const dexHtml = await dexLoginPage.text()
    const dexCookies = dexLoginPage.headers.getSetCookie().map(extractCookiePair).join('; ')
    const formActionMatch = dexHtml.match(/action="([^"]+)"/)
    expect(formActionMatch).not.toBeNull()
    const decodedAction = formActionMatch![1]!.replace(/&amp;/g, '&')
    const formUrl = new URL(decodedAction, dexLoginPage.url)

    const submitHeaders: Record<string, string> = {
      'content-type': 'application/x-www-form-urlencoded',
    }
    if (dexCookies) submitHeaders.cookie = dexCookies

    const submitRes = await fetch(formUrl, {
      method: 'POST',
      headers: submitHeaders,
      body: new URLSearchParams({ login: 'admin@example.com', password: 'password' }),
      redirect: 'manual',
    })
    if (submitRes.status !== 303) {
      throw new Error(
        `Dex login submit failed (${submitRes.status}) at ${formUrl}: ${await submitRes.text()}`,
      )
    }
    expect(submitRes.status).toBe(303)
    const approvalOrCallback = new URL(submitRes.headers.get('location')!, formUrl)
    const finalRedirect = await followUntilCallback(approvalOrCallback)
    expect(finalRedirect.startsWith(`${baseUrl}/api/auth/callback`)).toBe(true)

    const callbackRes = await fetch(finalRedirect, {
      headers: { cookie: txCookie },
      redirect: 'manual',
    })
    expect(callbackRes.status).toBe(302)
    const sessionSetCookie = callbackRes.headers
      .getSetCookie()
      .find((c) => c.startsWith('difflab_session='))!
    expect(sessionSetCookie).toContain('HttpOnly')
    const sessionCookie = extractCookiePair(sessionSetCookie)

    // Assert 2: signed in with Dex user email
    const afterLoginRes = await fetch(`${baseUrl}/api/health`, {
      headers: { cookie: sessionCookie },
    })
    const afterLoginJson = (await afterLoginRes.json()) as HealthPayload
    await writeFile(
      join(ctx.rootDir, 'health-after-login.json'),
      JSON.stringify({ status: afterLoginRes.status, body: afterLoginJson }, null, 2),
    )
    expect(afterLoginJson.auth.authenticated).toBe(true)
    expect(afterLoginJson.auth.user?.email).toBe('admin@example.com')

    // Act 3: logout clears cookie
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { cookie: sessionCookie },
      redirect: 'manual',
    })
    expect(logoutRes.status).toBe(302)
    const cleared = logoutRes.headers.getSetCookie().find((c) => c.startsWith('difflab_session='))!
    expect(cleared).toContain('Max-Age=0')

    const afterLogoutRes = await fetch(`${baseUrl}/api/health`)
    const afterLogoutJson = (await afterLogoutRes.json()) as HealthPayload
    await writeFile(
      join(ctx.rootDir, 'health-after-logout.json'),
      JSON.stringify({ status: afterLogoutRes.status, body: afterLogoutJson }, null, 2),
    )
    expect(afterLogoutJson.auth.authenticated).toBe(false)

    const webLogs = await runCompose(project, ['logs', 'web'])
    await writeFile(join(ctx.rootDir, 'compose-web.jsonl'), webLogs.stdout + webLogs.stderr)
  }, 180000)
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  while (composeProjects.length > 0) {
    const project = composeProjects.pop()!
    await runCompose(project, ['down', '-v', '--remove-orphans'])
  }
  while (contexts.length > 0) {
    await contexts.pop()?.cleanup()
  }
})

// Helpers ---------------------------------------------------------------------
type HealthPayload = {
  ok: boolean
  mode: string
  authProvider: string
  auth: { authenticated: boolean; user: { email: string | null } | null }
}

async function runCompose(project: string, args: string[]) {
  const proc = Bun.spawn(
    [
      'docker',
      'compose',
      '-p',
      project,
      '-f',
      'docker-compose.yml',
      '-f',
      'e2e/web/docker-compose.test.yml',
      ...args,
    ],
    { cwd: REPO_ROOT, stdout: 'pipe', stderr: 'pipe' },
  )
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { exitCode, stdout, stderr }
}

async function waitForUrl(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function followUntilCallback(startUrl: URL): Promise<string> {
  let current = startUrl
  for (let i = 0; i < 6; i += 1) {
    if (current.pathname === '/api/auth/callback') return current.toString()
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

function extractCookiePair(setCookie: string): string {
  return setCookie.split(';')[0]!.trim()
}
