import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'bun:test'
import {
  CLI_ENTRYPOINT,
  createE2EContext,
  REPO_ROOT,
  type E2ETestContext,
} from '../common/test-harness.js'

// Setup -----------------------------------------------------------------------
const contexts: E2ETestContext[] = []
const stoppers: Array<() => void> = []

// Tests -----------------------------------------------------------------------
describe('given a local workspace with local.sqlite', () => {
  it('when running difflab ui --no-open, then it launches difflab-web on 127.0.0.1 and serves /api/health', async () => {
    // Arrange
    const ctx = await createE2EContext('cli', 'ui', 'local-loopback-health')
    contexts.push(ctx)
    const webEntrypoint = join(REPO_ROOT, 'apps', 'difflab-web', 'build', 'index.js')

    // Act
    const child = spawn('bun', [CLI_ENTRYPOINT, 'ui', '--no-open'], {
      cwd: ctx.workspaceDir,
      env: {
        ...process.env,
        DIFFLAB_HOME: ctx.difflabHome,
        DIFFLAB_WEB_ENTRYPOINT: webEntrypoint,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    stoppers.push(() => child.kill('SIGTERM'))

    const readyLine = await new Promise<string>((resolve, reject) => {
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => reject(new Error(`Timed out. stderr=${stderr}`)), 15000)
      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8')
        void ctx.appendCliLog(chunk.toString('utf8'))
        const match = stdout.match(/Difflab UI ready at (http:\/\/127\.0\.0\.1:\d+)/)
        if (match) {
          clearTimeout(timer)
          resolve(match[1]!)
        }
      })
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8')
        void ctx.appendApiLog(chunk.toString('utf8'))
      })
      child.once('exit', (code) => {
        clearTimeout(timer)
        reject(new Error(`CLI exited early (${code}). stderr=${stderr}`))
      })
    })

    const healthRes = await fetch(`${readyLine}/api/health`)
    const healthJson = (await healthRes.json()) as {
      ok: boolean
      mode: string
      authProvider: string
      auth: { authenticated: boolean; user: { workspaceId: string; via: string } | null }
    }
    await writeFile(join(ctx.rootDir, 'health-local.json'), JSON.stringify(healthJson, null, 2))

    // Assert
    expect(healthRes.status).toBe(200)
    expect(healthJson.ok).toBe(true)
    expect(healthJson.mode).toBe('local')
    expect(healthJson.authProvider).toBe('local')
    expect(healthJson.auth.authenticated).toBe(true)
    expect(healthJson.auth.user?.workspaceId).toBe('local')
    expect(healthJson.auth.user?.via).toBe('loopback')
  }, 20000)
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  while (stoppers.length > 0) {
    stoppers.pop()?.()
  }
  while (contexts.length > 0) {
    await contexts.pop()?.cleanup()
  }
})
