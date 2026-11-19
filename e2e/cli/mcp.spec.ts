import { mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { getDaemonStatus } from 'difflab-daemon'
import { createGitRepository } from '../common/fixtures.js'
import {
  buildCleanEnv,
  CLI_ENTRYPOINT,
  createE2EContext,
  type E2ETestContext,
} from '../common/test-harness.js'

// Setup -----------------------------------------------------------------------
let activeCtx: E2ETestContext | null = null
let activeMcpClient: Client | null = null

async function openContext(label: string): Promise<E2ETestContext> {
  const ctx = await createE2EContext('cli', 'mcp', label)
  activeCtx = ctx
  return ctx
}

async function connectMcp(ctx: E2ETestContext) {
  const env = buildCleanEnv({
    DIFFLAB_HOME: ctx.difflabHome,
    DIFFLAB_DAEMON_LOG_PATH: ctx.apiLogPath,
  }) as Record<string, string>

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [CLI_ENTRYPOINT, 'mcp', 'serve'],
    stderr: 'pipe',
    env,
  })
  const client = new Client({ name: 'difflab-e2e', version: '0.1.0' })
  await client.connect(transport)
  activeMcpClient = client

  return {
    async listTools() {
      const response = await client.listTools()
      await ctx.appendCliLog(
        `=== MCP listTools ===\n${JSON.stringify(
          response.tools.map((tool) => tool.name),
          null,
          2,
        )}\n\n`,
      )
      return response
    },
    async callTool(name: string, args: Record<string, unknown>) {
      const response = await client.callTool({ name, arguments: args })
      await ctx.appendCliLog(
        `=== MCP callTool ${name} ===\nrequest: ${JSON.stringify(args)}\nresponse: ${JSON.stringify(response, null, 2)}\n\n`,
      )
      return response
    },
  }
}

// Tests -----------------------------------------------------------------------
describe('when running difflab mcp setup', () => {
  it('should write pi and cursor entries on the first run and report existing entries on the second run', async () => {
    // Arrange
    const ctx = await openContext('mcp-setup--idempotent-pi-and-cursor-registration')
    const userHome = join(ctx.workspaceDir, 'fake-user-home')
    await mkdir(userHome, { recursive: true })

    // Act
    const firstRun = await ctx.runCli(['mcp', 'setup', '--client', 'pi', '--client', 'cursor'], {
      env: { HOME: userHome },
    })
    const secondRun = await ctx.runCli(['mcp', 'setup', '--client', 'pi', '--client', 'cursor'], {
      env: { HOME: userHome },
    })

    // Assert
    expect(firstRun.exitCode).toBe(0)
    expect(firstRun.stdout).toContain('Added pi:')
    expect(firstRun.stdout).toContain('Added cursor:')
    expect(secondRun.exitCode).toBe(0)
    expect(secondRun.stdout).toContain('Already configured pi:')
    expect(secondRun.stdout).toContain('Already configured cursor:')

    const piConfig = JSON.parse(
      await readFile(join(userHome, '.config', 'mcp', 'mcp.json'), 'utf8'),
    )
    const cursorConfig = JSON.parse(await readFile(join(userHome, '.cursor', 'mcp.json'), 'utf8'))
    expect(piConfig.mcpServers.difflab).toEqual({
      command: 'npx',
      args: ['-y', '@difflab/difflab-cli', 'mcp', 'serve'],
    })
    expect(cursorConfig.mcpServers.difflab).toEqual(piConfig.mcpServers.difflab)
  })
})

describe('given a difflab mcp serve session on an uninitialized workspace', () => {
  it('listTools should expose project_context, log_append, template_list, scaffold, and all five todo_* tools', async () => {
    // Arrange
    const ctx = await openContext('mcp-uninitialized--list-tools')
    const mcp = await connectMcp(ctx)

    // Act
    const { tools } = await mcp.listTools()

    // Assert
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      [
        'log_append',
        'project_context',
        'scaffold',
        'template_list',
        'todo_add',
        'todo_complete',
        'todo_init',
        'todo_list',
        'todo_remove',
      ].sort(),
    )
  })

  it('project_context should return skill-directed errors for missing difflab.yaml, relative cwd, or missing global setup without creating local.sqlite', async () => {
    // Arrange
    const ctx = await openContext('mcp-uninitialized--project-context-returns-init-hint')
    const repoDir = await createGitRepository(ctx.workspaceDir, {
      subpath: 'repo',
      originUrl: 'https://github.com/difflab-io/uninitialized.git',
    })
    const mcp = await connectMcp(ctx)

    // Act
    const missingYaml = await mcp.callTool('project_context', { cwd: await realpath(repoDir) })
    const relativeCwd = await mcp.callTool('project_context', { cwd: 'relative/path' })
    await writeFile(join(repoDir, 'difflab.yaml'), 'schemaVersion: 1\nproject:\n  id: UNINIT\n')
    await symlink(join(ctx.workspaceDir, 'missing-store'), join(repoDir, '.difflab'))
    const missingGlobal = await mcp.callTool('project_context', { cwd: await realpath(repoDir) })

    // Assert
    expect(missingYaml.isError).toBe(true)
    expect(parseMcpJson(missingYaml).error).toContain('difflab-init')
    expect(relativeCwd.isError).toBe(true)
    expect(missingGlobal.isError).toBe(true)
    expect(parseMcpJson(missingGlobal).error).toContain('difflab-init')
  })

  it('todo tools should persist and update tasks in workspace/todos.json', async () => {
    // Arrange
    const ctx = await openContext('mcp-uninitialized--todo-tools-crud')
    const mcp = await connectMcp(ctx)
    const cwd = await realpath(ctx.workspaceDir)

    // Act
    const initialized = await mcp.callTool('todo_init', { cwd, path: 'todos.json' })
    const added = await mcp.callTool('todo_add', {
      cwd,
      path: 'todos.json',
      text: 'Verify retained E2E outputs',
    })
    const taskId = parseMcpJson<{ id: string }>(added).id
    await mcp.callTool('todo_complete', { cwd, path: 'todos.json', id: taskId })
    const listedAfterComplete = await mcp.callTool('todo_list', { cwd, path: 'todos.json' })
    await mcp.callTool('todo_remove', { cwd, path: 'todos.json', id: taskId })
    const listedAfterRemove = await mcp.callTool('todo_list', { cwd, path: 'todos.json' })

    // Assert
    expect(initialized.isError).toBeUndefined()
    const completedTasks = parseMcpJson<{ tasks: Array<{ id: string; done: boolean }> }>(
      listedAfterComplete,
    ).tasks
    expect(completedTasks).toEqual([expect.objectContaining({ id: taskId, done: true })])
    expect(parseMcpJson<{ tasks: unknown[] }>(listedAfterRemove).tasks).toEqual([])
    expect(await readFile(join(cwd, 'todos.json'), 'utf8')).toContain('"version": 1')
  })

  it('template_list and scaffold should write valid files and reject duplicates or traversal paths', async () => {
    // Arrange
    const ctx = await openContext('mcp-uninitialized--template-list-and-scaffold')
    const mcp = await connectMcp(ctx)
    const cwd = await realpath(ctx.workspaceDir)

    // Act
    const listed = await mcp.callTool('template_list', {})
    const scaffolded = await mcp.callTool('scaffold', {
      name: 'spec-driven-plan',
      cwd,
      path: 'plans/demo',
      filename: 'PLAN.md',
    })
    const duplicate = await mcp.callTool('scaffold', {
      name: 'spec-driven-plan',
      cwd,
      path: 'plans/demo',
      filename: 'PLAN.md',
    })
    const traversal = await mcp.callTool('scaffold', {
      name: 'spec-driven-plan',
      cwd,
      path: '../outside',
      filename: 'escape.md',
    })

    // Assert
    expect(parseMcpJson<Array<{ name: string }>>(listed).map((item) => item.name)).toContain(
      'spec-driven-plan',
    )
    expect(scaffolded.isError).toBeUndefined()
    expect(await readFile(join(cwd, 'plans', 'demo', 'PLAN.md'), 'utf8')).toContain('## Intent')
    expect(duplicate.isError).toBe(true)
    expect(parseMcpJson(duplicate).error).toContain('already exists')
    expect(traversal.isError).toBe(true)
    expect(JSON.stringify(traversal)).toContain('traversal')
  })

  it('log_append should append single-line timestamped entries to workspace/logs.txt and reject multiline messages', async () => {
    // Arrange
    const ctx = await openContext('mcp-uninitialized--log-append')
    const mcp = await connectMcp(ctx)
    const logPath = join(await realpath(ctx.workspaceDir), 'logs.txt')

    // Act
    const valid = await mcp.callTool('log_append', {
      path: logPath,
      message: 'Phase 3 MCP stdio verification complete',
    })
    const multiline = await mcp.callTool('log_append', {
      path: logPath,
      message: 'line one\nline two',
    })

    // Assert
    expect(valid.isError).toBeUndefined()
    expect(multiline.isError).toBe(true)
    expect(await readFile(logPath, 'utf8')).toMatch(
      /^\[\d{6} \d{2}:\d{2}:\d{2}\]: Phase 3 MCP stdio verification complete\n$/,
    )
  })
})

describe('given a difflab mcp serve session on an initialized repository with a stopped daemon', () => {
  it('project_context should auto-start the local daemon and return the project and canonical origin', async () => {
    // Arrange
    const ctx = await openContext('mcp-initialized-stopped-daemon--auto-start-on-project-context')
    const repoDir = await createGitRepository(ctx.workspaceDir, {
      subpath: 'repo',
      originUrl: 'git@github.com:difflab-io/mcp-demo.git',
    })
    await ctx.runCli([
      'project',
      'add',
      'MCPD',
      '--name',
      'MCP Demo Project',
      '--repo',
      'git@github.com:difflab-io/mcp-demo.git',
    ])
    await ctx.runCli(['init', 'MCPD'], { cwd: repoDir })
    await ctx.runCli(['down'])
    expect(await getDaemonStatus(ctx.difflabHome)).toEqual({ running: false })
    const mcp = await connectMcp(ctx)

    // Act
    const response = await mcp.callTool('project_context', { cwd: await realpath(repoDir) })
    const daemonStatus = await getDaemonStatus(ctx.difflabHome)

    // Assert
    expect(response.isError).toBeUndefined()
    expect(daemonStatus.running).toBe(true)
    expect(parseMcpJson(response)).toMatchObject({
      project: { id: 'MCPD', name: 'MCP Demo Project' },
      repository: {
        origin: 'https://github.com/difflab-io/mcp-demo',
        slug: 'github.com--difflab-io--mcp-demo',
        localPath: await realpath(repoDir),
      },
    })
  })

  it('project_context should reject mismatched .difflab symlinks or unregistered project manifests without mutating links', async () => {
    // Arrange
    const ctx = await openContext('mcp-initialized--rejects-wrong-symlink-or-manifest')
    const repoDir = await createGitRepository(ctx.workspaceDir, {
      subpath: 'repo',
      originUrl: 'https://github.com/difflab-io/mcp-first.git',
    })
    await ctx.runCli([
      'project',
      'add',
      'FIR',
      '--name',
      'First',
      '--repo',
      'https://github.com/difflab-io/mcp-first.git',
    ])
    await ctx.runCli([
      'project',
      'add',
      'SEC',
      '--name',
      'Second',
      '--repo',
      'https://github.com/difflab-io/mcp-second.git',
    ])
    await ctx.runCli(['init', 'FIR'], { cwd: repoDir })
    const mcp = await connectMcp(ctx)

    // Act: wrong symlink
    await rm(join(repoDir, '.difflab'))
    await symlink(ctx.workspaceDir, join(repoDir, '.difflab'))
    const wrongLink = await mcp.callTool('project_context', { cwd: await realpath(repoDir) })

    // Act: manifest pointing to another project without registered origin
    const secStore = join(ctx.difflabHome, 'projects', 'SEC', 'github.com--difflab-io--mcp-first')
    await mkdir(secStore, { recursive: true })
    await rm(join(repoDir, '.difflab'))
    await symlink(secStore, join(repoDir, '.difflab'))
    await writeFile(join(repoDir, 'difflab.yaml'), 'schemaVersion: 1\nproject:\n  id: SEC\n')
    const unregistered = await mcp.callTool('project_context', { cwd: await realpath(repoDir) })

    // Assert
    expect(wrongLink.isError).toBe(true)
    expect(parseMcpJson(wrongLink).error).toContain('links elsewhere')
    expect(unregistered.isError).toBe(true)
    expect(parseMcpJson(unregistered).error).toContain('not registered')
  })
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  if (activeMcpClient) {
    const client = activeMcpClient
    activeMcpClient = null
    await client.close()
  }
  if (activeCtx) {
    const current = activeCtx
    activeCtx = null
    await current.cleanup()
  }
})

// Helpers ---------------------------------------------------------------------
function parseMcpJson<T = Record<string, unknown>>(response: unknown): T {
  if (
    !response ||
    typeof response !== 'object' ||
    !('content' in response) ||
    !Array.isArray(response.content)
  ) {
    throw new Error('MCP response did not contain content items')
  }
  const textEntry = response.content.find(
    (item: unknown) =>
      item !== null && typeof item === 'object' && 'type' in item && item.type === 'text',
  ) as { text?: string } | undefined
  if (!textEntry?.text) {
    throw new Error('MCP response did not contain a text payload')
  }
  return JSON.parse(textEntry.text)
}
