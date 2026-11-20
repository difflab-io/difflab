import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'bun:test'
import { DifflabDaemon } from 'difflab-daemon'
import { lstatOrNull } from 'utils/fsx'
import { createE2EContext, type E2ETestContext } from '../common/test-harness.js'

// Setup -----------------------------------------------------------------------
let activeCtx: E2ETestContext | null = null

async function openContext(label: string): Promise<E2ETestContext> {
  const ctx = await createE2EContext('cli', 'templates', label)
  activeCtx = ctx
  return ctx
}

// Tests -----------------------------------------------------------------------
describe('when running template commands', () => {
  it('templates list should exit 0 without starting a daemon and install all built-in templates', async () => {
    // Arrange
    const ctx = await openContext('templates-list--exit-0-without-daemon-and-install-templates')

    // Act
    const result = await ctx.runCli(['templates', 'list'])

    // Assert
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('spec-driven-plan —')
    expect(result.stdout).toContain('software-architecture-design —')
    expect(result.stdout).toContain('flow-instance —')
    expect(await DifflabDaemon.status(ctx.difflabHome)).toEqual({ running: false })
    expect(await lstatOrNull(join(ctx.difflabHome, 'local.sqlite'))).toBeNull()
    expect(
      await lstatOrNull(join(ctx.difflabHome, 'templates', 'spec-driven-plan.md')),
    ).not.toBeNull()
  })

  it('templates scaffold should write an inspectable document given a valid template and new destination', async () => {
    // Arrange
    const ctx = await openContext('templates-scaffold--write-inspectable-document')

    // Act
    const result = await ctx.runCli([
      'templates',
      'scaffold',
      'spec-driven-plan',
      'docs/plans',
      'PLAN.md',
      '--cwd',
      ctx.workspaceDir,
    ])

    // Assert
    expect(result.exitCode).toBe(0)
    const targetFile = join(ctx.workspaceDir, 'docs', 'plans', 'PLAN.md')
    expect(result.stdout.trim()).toContain(join('docs', 'plans', 'PLAN.md'))
    expect(await readFile(targetFile, 'utf8')).toContain('## Intent')
  })

  it('templates scaffold should exit 1 without overwriting given an existing destination file', async () => {
    // Arrange
    const ctx = await openContext('templates-scaffold--exit-1-without-overwriting-existing-file')
    const existingPath = join(ctx.workspaceDir, 'PLAN.md')
    await writeFile(existingPath, '# Handcrafted Plan\n', 'utf8')

    // Act
    const result = await ctx.runCli([
      'templates',
      'scaffold',
      'spec-driven-plan',
      '.',
      'PLAN.md',
      '--cwd',
      ctx.workspaceDir,
    ])

    // Assert
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('already exists')
    expect(await readFile(existingPath, 'utf8')).toBe('# Handcrafted Plan\n')
  })

  it('templates scaffold should exit 1 without creating a file given an unknown template or parent-traversal path', async () => {
    // Arrange
    const ctx = await openContext('templates-scaffold--exit-1-given-unknown-or-traversal')

    // Act
    const unknownResult = await ctx.runCli([
      'templates',
      'scaffold',
      'nonexistent-template',
      '.',
      'out.md',
      '--cwd',
      ctx.workspaceDir,
    ])
    const traversalResult = await ctx.runCli([
      'templates',
      'scaffold',
      'spec-driven-plan',
      '../outside',
      'escape.md',
      '--cwd',
      ctx.workspaceDir,
    ])

    // Assert
    expect(unknownResult.exitCode).toBe(1)
    expect(unknownResult.stderr).toContain('Unknown template')
    expect(traversalResult.exitCode).toBe(1)
    expect(traversalResult.stderr).toContain('parent traversal')
    expect(await lstatOrNull(join(ctx.workspaceDir, 'out.md'))).toBeNull()
    expect(await lstatOrNull(join(ctx.rootDir, 'outside', 'escape.md'))).toBeNull()
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
