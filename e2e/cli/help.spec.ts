import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'bun:test'
import { DifflabDaemon } from 'difflab-daemon'
import { lstatOrNull } from 'utils/fsx'
import { createE2EContext, type E2ETestContext } from '../common/test-harness.js'

// Setup -----------------------------------------------------------------------
let activeCtx: E2ETestContext | null = null

async function openContext(label: string): Promise<E2ETestContext> {
  const ctx = await createE2EContext('cli', 'help', label)
  activeCtx = ctx
  return ctx
}

// Tests -----------------------------------------------------------------------
describe('when running help and version commands', () => {
  it('bare difflab and --help should exit 0 without starting a daemon and list up, status, down, project, init, mcp, and templates', async () => {
    // Arrange
    const ctx = await openContext('bare-difflab-and-help')

    // Act
    const bare = await ctx.runCli([])
    const help = await ctx.runCli(['--help'])

    // Assert
    expect(bare.exitCode).toBe(0)
    expect(help.exitCode).toBe(0)
    for (const subcommand of ['up', 'status', 'down', 'project', 'init', 'mcp', 'templates']) {
      expect(bare.stdout).toContain(subcommand)
      expect(help.stdout).toContain(subcommand)
    }
    expect(await DifflabDaemon.status(ctx.difflabHome)).toEqual({ running: false })
    expect(await lstatOrNull(join(ctx.difflabHome, 'local.sqlite'))).toBeNull()
  })

  it('--version should print the CLI version', async () => {
    // Arrange
    const ctx = await openContext('version-flag')

    // Act
    const result = await ctx.runCli(['--version'])

    // Assert
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/)
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
