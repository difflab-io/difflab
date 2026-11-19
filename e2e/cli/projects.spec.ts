import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'bun:test'
import { lstatOrNull } from 'utils/fsx'
import { createE2EContext, type E2ETestContext } from '../common/test-harness.js'

// Setup -----------------------------------------------------------------------
let activeCtx: E2ETestContext | null = null

async function openContext(label: string): Promise<E2ETestContext> {
  const ctx = await createE2EContext('cli', 'projects', label)
  activeCtx = ctx
  return ctx
}

// Tests -----------------------------------------------------------------------
describe('when running project commands', () => {
  it('project list should print No projects yet. given no projects exist', async () => {
    // Arrange
    const ctx = await openContext('project-list--empty-when-no-projects')

    // Act
    const result = await ctx.runCli(['project', 'list'])

    // Assert
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe('No projects yet.')
  })

  it('project add should exit 1 with usage guidance without persisting given missing key, --name, or --repo', async () => {
    // Arrange
    const ctx = await openContext('project-add--exit-1-given-missing-arguments')
    const invalidInvocations = [
      ['project', 'add'],
      ['project', 'add', '--name', 'Demo', '--repo', 'https://github.com/acme/demo'],
      ['project', 'add', 'DEMO', '--repo', 'https://github.com/acme/demo'],
      ['project', 'add', 'DEMO', '--name', 'Demo'],
    ]

    // Act
    const results = []
    for (const args of invalidInvocations) {
      results.push(await ctx.runCli(args))
    }
    const listResult = await ctx.runCli(['project', 'list'])

    // Assert
    for (const result of results) {
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('project add <key> --name <name> --repo <origin>')
    }
    expect(listResult.stdout.trim()).toBe('No projects yet.')
  })

  it('project add should exit 1 without persisting given an invalid repository URL', async () => {
    // Arrange
    const ctx = await openContext('project-add--exit-1-given-invalid-repository-url')

    // Act
    const addResult = await ctx.runCli([
      'project',
      'add',
      'BADURL',
      '--name',
      'Bad URL Project',
      '--repo',
      'not-a-valid-repository-url',
    ])
    const listResult = await ctx.runCli(['project', 'list'])

    // Assert
    expect(addResult.exitCode).toBe(1)
    expect(addResult.stderr).toContain('valid URL')
    expect(listResult.stdout.trim()).toBe('No projects yet.')
  })

  it('project add and project list should auto-start the local daemon and persist canonical URLs in local mode', async () => {
    // Arrange
    const ctx = await openContext('project-add-and-list--auto-start-daemon-and-canonical-urls')

    // Act
    const addResult = await ctx.runCli([
      'project',
      'add',
      'cli',
      '--name',
      'CLI Workspace',
      '--repo',
      'git@github.com:difflab-io/difflab.git',
    ])
    const statusResult = await ctx.runCli(['status', '--json'])
    const listResult = await ctx.runCli(['project', 'list'])

    // Assert
    expect(addResult.exitCode).toBe(0)
    expect(addResult.stdout).toContain('Created project CLI Workspace (CLI)')
    expect(JSON.parse(statusResult.stdout)).toMatchObject({ running: true })
    expect(listResult.stdout).toContain('CLI\tCLI Workspace')
    expect(listResult.stdout).toContain('  https://github.com/difflab-io/difflab')
    expect(await ctx.readApiLog()).toContain('CreateProject')
  })

  it('project add should exit 1 and keep only the original project given a conflicting SSH/HTTPS URL', async () => {
    // Arrange
    const ctx = await openContext('project-add--exit-1-given-conflicting-ssh-https-url')
    await ctx.runCli([
      'project',
      'add',
      'FIRST',
      '--name',
      'First Project',
      '--repo',
      'https://github.com/acme/shared-repo',
    ])

    // Act
    const conflictResult = await ctx.runCli([
      'project',
      'add',
      'SECOND',
      '--name',
      'Second Project',
      '--repo',
      'git@github.com:acme/shared-repo.git',
    ])
    const listResult = await ctx.runCli(['project', 'list'])

    // Assert
    expect(conflictResult.exitCode).toBe(1)
    expect(listResult.stdout).toContain('FIRST\tFirst Project')
    expect(listResult.stdout).not.toContain('SECOND')
  })

  it('project add and project list should persist to the remote workspace without creating local.sqlite given DIFFLAB_RPC_URL', async () => {
    // Arrange
    const ctx = await openContext('project-add-and-list--remote-rpc-url-without-local-sqlite')
    const pgServer = await ctx.startPostgres()
    await ctx.runApiMigrate({ DATABASE_URL: pgServer.connectionString })
    const cloudApi = await ctx.startApiServer({
      mode: 'cloud',
      env: {
        DATABASE_URL: pgServer.connectionString,
        DIFFLAB_API_TOKEN: 'e2e-cloud-token',
      },
    })
    const remoteEnv = {
      DIFFLAB_RPC_URL: cloudApi.rpcUrl,
      DIFFLAB_API_TOKEN: 'e2e-cloud-token',
      DIFFLAB_WORKSPACE: 'ws-remote-cli',
    }

    // Act
    const addResult = await ctx.runCli(
      [
        'project',
        'add',
        'CLOUD1',
        '--name',
        'Cloud Remote Project',
        '--repo',
        'https://github.com/acme/cloud-service.git',
      ],
      { env: remoteEnv },
    )
    const listResult = await ctx.runCli(['project', 'list'], { env: remoteEnv })
    const otherWsList = await ctx.runCli(['project', 'list'], {
      env: { ...remoteEnv, DIFFLAB_WORKSPACE: 'ws-empty' },
    })

    // Assert
    expect(addResult.exitCode).toBe(0)
    expect(listResult.stdout).toContain('CLOUD1\tCloud Remote Project')
    expect(otherWsList.stdout.trim()).toBe('No projects yet.')
    expect(await lstatOrNull(join(ctx.difflabHome, 'local.sqlite'))).toBeNull()
    expect(await lstatOrNull(join(ctx.difflabHome, 'daemon.json'))).toBeNull()
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
