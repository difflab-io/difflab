import { lstat, mkdir, readFile, realpath, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'bun:test'
import { lstatOrNull } from 'utils/fsx'
import { readProjectContext } from '../../apps/difflab-cli/src/context.js'
import { createGitRepository, createGitWorktree } from '../common/fixtures.js'
import { createE2EContext, type E2ETestContext } from '../common/test-harness.js'

// Setup -----------------------------------------------------------------------
let activeCtx: E2ETestContext | null = null

async function openContext(label: string): Promise<E2ETestContext> {
  const ctx = await createE2EContext('cli', 'init', label)
  activeCtx = ctx
  return ctx
}

// Tests -----------------------------------------------------------------------
describe('when running difflab init', () => {
  it('should exit 1 without mutating workspace/ or difflab-home/ given a directory outside any Git repository', async () => {
    // Arrange
    const ctx = await openContext('init--exit-1-given-non-git-directory')

    // Act
    const result = await ctx.runCli(['init', 'DEMO'])

    // Assert
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('Cannot inspect Git repository')
    expect(await readdir(ctx.workspaceDir)).toEqual([])
    expect(await readdir(ctx.difflabHome)).toEqual([])
  })

  it('should exit 1 without creating difflab.yaml, .difflab, or a project directory given an unknown project key', async () => {
    // Arrange
    const ctx = await openContext('init--exit-1-given-unknown-project-key')
    const repoDir = await createGitRepository(ctx.workspaceDir, {
      subpath: 'repo',
      originUrl: 'https://github.com/acme/unknown-project.git',
    })

    // Act
    const result = await ctx.runCli(['init', 'MISSING'], { cwd: repoDir })

    // Assert
    expect(result.exitCode).toBe(1)
    expect(await lstatOrNull(join(repoDir, 'difflab.yaml'))).toBeNull()
    expect(await lstatOrNull(join(repoDir, '.difflab'))).toBeNull()
    expect(await lstatOrNull(join(ctx.difflabHome, 'projects', 'MISSING'))).toBeNull()
  })

  it('should exit 1 before mutating ProjectService given malformed difflab.yaml or a conflicting .difflab path', async () => {
    // Arrange
    const ctx = await openContext('init--exit-1-given-malformed-yaml-or-conflicting-symlink')
    const repoDir = await createGitRepository(ctx.workspaceDir, {
      subpath: 'repo',
      originUrl: 'https://github.com/acme/preflight-repo.git',
    })
    await ctx.runCli([
      'project',
      'add',
      'SAFE',
      '--name',
      'Safe Project',
      '--repo',
      'https://github.com/acme/other-repo.git',
    ])
    await writeFile(join(repoDir, 'difflab.yaml'), 'schemaVersion: [broken\n', 'utf8')

    // Act
    const malformedResult = await ctx.runCli(['init', 'SAFE'], { cwd: repoDir })
    await rm(join(repoDir, 'difflab.yaml'))
    await symlink(ctx.workspaceDir, join(repoDir, '.difflab'))
    const symlinkConflictResult = await ctx.runCli(['init', 'SAFE'], { cwd: repoDir })
    const listed = await ctx.runCli(['project', 'list'])

    // Assert
    expect(malformedResult.exitCode).toBe(1)
    expect(malformedResult.stderr).toContain('Invalid difflab.yaml')
    expect(symlinkConflictResult.exitCode).toBe(1)
    expect(symlinkConflictResult.stderr).toContain('links elsewhere')
    expect(listed.stdout).not.toContain('preflight-repo')
  })

  it('should write difflab.yaml at the Git root, symlink .difflab, update .git/info/exclude, and link the origin given root or nested cwd', async () => {
    // Arrange
    const ctx = await openContext('init--write-config-symlink-exclude-and-link-origin')
    const repoDir = await createGitRepository(ctx.workspaceDir, {
      subpath: 'repo',
      originUrl: 'git@github.com:acme/nested-init.git',
    })
    const nestedDir = join(repoDir, 'packages', 'sub')
    await mkdir(nestedDir, { recursive: true })
    await ctx.runCli([
      'project',
      'add',
      'NEST',
      '--name',
      'Nested Project',
      '--repo',
      'https://github.com/acme/seed-repo.git',
    ])

    // Act
    const initResult = await ctx.runCli(['init', 'nest'], { cwd: nestedDir })
    const scaffoldResult = await ctx.runCli(
      ['templates', 'scaffold', 'spec-driven-plan', '.difflab/plans/261119-demo', 'PLAN.md'],
      { cwd: repoDir },
    )
    const listed = await ctx.runCli(['project', 'list'])

    // Assert
    expect(initResult.exitCode).toBe(0)
    expect(initResult.stdout).toContain(
      'Initialized https://github.com/acme/nested-init in project Nested Project (NEST)',
    )
    expect(scaffoldResult.exitCode).toBe(0)
    expect(await readFile(join(repoDir, 'difflab.yaml'), 'utf8')).toContain('id: NEST')
    expect(await lstatOrNull(join(nestedDir, 'difflab.yaml'))).toBeNull()
    expect((await lstat(join(repoDir, '.difflab'))).isSymbolicLink()).toBe(true)
    expect(await readFile(join(repoDir, '.git', 'info', 'exclude'), 'utf8')).toContain('/.difflab')
    expect(
      await readFile(join(repoDir, '.difflab', 'plans', '261119-demo', 'PLAN.md'), 'utf8'),
    ).toContain('## Intent')
    expect(listed.stdout).toContain('  https://github.com/acme/nested-init')
  })

  it('should succeed idempotently with one exclude line and one repository link given a repository already initialized for the same project', async () => {
    // Arrange
    const ctx = await openContext('init--idempotent-for-same-project')
    const repoDir = await createGitRepository(ctx.workspaceDir, {
      subpath: 'repo',
      originUrl: 'https://github.com/acme/idempotent-repo.git',
    })
    await ctx.runCli([
      'project',
      'add',
      'IDEM',
      '--name',
      'Idempotent Project',
      '--repo',
      'https://github.com/acme/idempotent-repo.git',
    ])

    // Act
    const first = await ctx.runCli(['init', 'IDEM'], { cwd: repoDir })
    const second = await ctx.runCli(['init', 'IDEM'], { cwd: repoDir })
    const listed = await ctx.runCli(['project', 'list'])

    // Assert
    expect(first.exitCode).toBe(0)
    expect(second.exitCode).toBe(0)
    const exclude = await readFile(join(repoDir, '.git', 'info', 'exclude'), 'utf8')
    expect(exclude.match(/\/\.difflab/g)).toHaveLength(1)
    expect(listed.stdout.match(/https:\/\/github\.com\/acme\/idempotent-repo/g)).toHaveLength(1)
  })

  it('should exit 1 and preserve difflab.yaml given a repository already initialized for a different project', async () => {
    // Arrange
    const ctx = await openContext('init--exit-1-given-already-initialized-for-different-project')
    const repoDir = await createGitRepository(ctx.workspaceDir, {
      subpath: 'repo',
      originUrl: 'https://github.com/acme/owned-repo.git',
    })
    await ctx.runCli([
      'project',
      'add',
      'FIRST',
      '--name',
      'First',
      '--repo',
      'https://github.com/acme/owned-repo.git',
    ])
    await ctx.runCli([
      'project',
      'add',
      'SECOND',
      '--name',
      'Second',
      '--repo',
      'https://github.com/acme/second-repo.git',
    ])
    await ctx.runCli(['init', 'FIRST'], { cwd: repoDir })
    const originalYaml = await readFile(join(repoDir, 'difflab.yaml'), 'utf8')

    // Act
    const conflict = await ctx.runCli(['init', 'SECOND'], { cwd: repoDir })

    // Assert
    expect(conflict.exitCode).toBe(1)
    expect(conflict.stderr).toContain('already belongs to project FIRST')
    expect(await readFile(join(repoDir, 'difflab.yaml'), 'utf8')).toBe(originalYaml)
  })

  it("should share the project store and repository link while reporting each worktree's own localPath given a linked Git worktree", async () => {
    // Arrange
    const ctx = await openContext('init--share-store-across-linked-git-worktrees')
    const mainRepoDir = await createGitRepository(ctx.workspaceDir, {
      subpath: 'main-repo',
      originUrl: 'https://github.com/acme/worktree-repo.git',
    })
    const worktreeDir = createGitWorktree(
      mainRepoDir,
      join(ctx.workspaceDir, 'feature-worktree'),
      'feature/test-branch',
    )
    await ctx.runCli([
      'project',
      'add',
      'WKTR',
      '--name',
      'Worktree Project',
      '--repo',
      'https://github.com/acme/worktree-repo.git',
    ])

    // Act
    const firstInit = await ctx.runCli(['init', 'WKTR'], { cwd: mainRepoDir })
    const secondInit = await ctx.runCli(['init', 'WKTR'], { cwd: worktreeDir })
    await ctx.runCli(
      ['templates', 'scaffold', 'spec-driven-plan', '.difflab/plans/261119-shared', 'PLAN.md'],
      { cwd: mainRepoDir },
    )
    const listed = await ctx.runCli(['project', 'list'])

    // Assert
    expect(firstInit.exitCode).toBe(0)
    expect(secondInit.exitCode).toBe(0)
    expect(listed.stdout.match(/https:\/\/github\.com\/acme\/worktree-repo/g)).toHaveLength(1)
    expect(
      await readFile(join(worktreeDir, '.difflab', 'plans', '261119-shared', 'PLAN.md'), 'utf8'),
    ).toContain('## Phases')

    const previousHome = process.env.DIFFLAB_HOME
    process.env.DIFFLAB_HOME = ctx.difflabHome
    try {
      const mainCtx = await readProjectContext(mainRepoDir)
      const wtCtx = await readProjectContext(worktreeDir)
      expect(mainCtx.repository.localPath).toBe(await realpath(mainRepoDir))
      expect(wtCtx.repository.localPath).toBe(await realpath(worktreeDir))
      expect(mainCtx.repository.id).toBe(wtCtx.repository.id)
    } finally {
      if (previousHome === undefined) delete process.env.DIFFLAB_HOME
      else process.env.DIFFLAB_HOME = previousHome
    }
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
