import { afterEach, describe, expect, it } from 'bun:test'
import type { DaemonStatus } from 'utils/daemonx'
import { createE2EContext, type E2ETestContext } from '../common/test-harness.js'

// Setup -----------------------------------------------------------------------
let activeCtx: E2ETestContext | null = null

async function openContext(label: string): Promise<E2ETestContext> {
  const ctx = await createE2EContext('cli', 'daemon', label)
  activeCtx = ctx
  return ctx
}

// Tests -----------------------------------------------------------------------
describe('given a stopped daemon', () => {
  it('status --json should return { running: false }', async () => {
    // Arrange
    const ctx = await openContext('stopped-daemon--status-json')

    // Act
    const result = await ctx.runCli(['status', '--json'])

    // Assert
    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ running: false })
  })

  it('down should exit 0 without error', async () => {
    // Arrange
    const ctx = await openContext('stopped-daemon--down-is-idempotent')

    // Act
    const result = await ctx.runCli(['down'])

    // Assert
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('not running')
  })

  it('up --port 0 --json should start the background server, log to api.log, and return running, pid, server_url, and rpc_url', async () => {
    // Arrange
    const ctx = await openContext('stopped-daemon--up-starts-background-server')

    // Act
    const up = await ctx.runCli(['up', '--port', '0', '--json'])

    // Assert
    expect(up.exitCode).toBe(0)
    const parsed = JSON.parse(up.stdout) as Extract<DaemonStatus, { running: true }>
    expect(parsed.running).toBe(true)
    expect(parsed.pid).toBeGreaterThan(0)
    expect(parsed.server_url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(parsed.rpc_url).toBe(`${parsed.server_url}/rpc`)
    expect(await ctx.readApiLog()).toContain('difflab-api.ready')
  })
})

describe('given a running daemon', () => {
  it('up --port 0 --json should reuse the existing pid, server_url, and rpc_url', async () => {
    // Arrange
    const ctx = await openContext('running-daemon--up-reuses-existing-daemon')
    const first = JSON.parse((await ctx.runCli(['up', '--port', '0', '--json'])).stdout) as Extract<
      DaemonStatus,
      { running: true }
    >

    // Act
    const secondResult = await ctx.runCli(['up', '--port', '0', '--json'])
    const second = JSON.parse(secondResult.stdout) as Extract<DaemonStatus, { running: true }>

    // Assert
    expect(secondResult.exitCode).toBe(0)
    expect(second).toEqual(first)
  })

  it('status --json should return running true with pid, server_url, and rpc_url', async () => {
    // Arrange
    const ctx = await openContext('running-daemon--status-json-returns-metadata')
    const started = JSON.parse(
      (await ctx.runCli(['up', '--port', '0', '--json'])).stdout,
    ) as Extract<DaemonStatus, { running: true }>

    // Act
    const statusResult = await ctx.runCli(['status', '--json'])
    const status = JSON.parse(statusResult.stdout) as DaemonStatus

    // Assert
    expect(statusResult.exitCode).toBe(0)
    expect(status).toEqual(started)
  })

  it('GET /health on server_url should respond with HTTP 200', async () => {
    // Arrange
    const ctx = await openContext('running-daemon--health-endpoint-returns-200')
    const started = JSON.parse(
      (await ctx.runCli(['up', '--port', '0', '--json'])).stdout,
    ) as Extract<DaemonStatus, { running: true }>

    // Act
    const healthResponse = await fetch(`${started.server_url}/health`)
    const body = (await healthResponse.json()) as { ok: boolean }

    // Assert
    expect(healthResponse.status).toBe(200)
    expect(body.ok).toBe(true)
  })

  it('down should terminate the daemon so status returns { running: false }', async () => {
    // Arrange
    const ctx = await openContext('running-daemon--down-terminates-daemon')
    await ctx.runCli(['up', '--port', '0', '--json'])

    // Act
    const downResult = await ctx.runCli(['down'])
    const statusResult = await ctx.runCli(['status', '--json'])

    // Assert
    expect(downResult.exitCode).toBe(0)
    expect(JSON.parse(statusResult.stdout)).toEqual({ running: false })
  })
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  if (activeCtx) {
    const current = activeCtx
    activeCtx = null
    await current.cleanup()
  }
})
