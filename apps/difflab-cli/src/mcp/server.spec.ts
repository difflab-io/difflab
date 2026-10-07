import { afterEach, describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { mkdir, readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { createProgram } from '../cli.js'
import { createTempDirectory } from '../extensions/testx'
import { createUserStore } from '../store/user-store.js'

// Setup -----------------------------------------------------------------------
const cleanups: (() => Promise<void>)[] = []

// Tests -----------------------------------------------------------------------
describe('Difflab MCP over stdio', () => {
  test('lists todo and template tools and handles requests over stdio', async () => {
    // Arrange
    const directory = await createTempDirectory('difflab-mcp-')
    cleanups.push(directory.cleanup)
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        process.env.DIFFLAB_MCP_TEST_ENTRY ?? join(import.meta.dir, '..', 'index.ts'),
        'mcp',
        'serve',
      ],
      stderr: 'pipe',
      env: { ...process.env, HOME: directory.path },
    })
    const client = new Client({ name: 'difflab-test', version: '0.1.0' })
    try {
      // Act
      await client.connect(transport)
      const { tools } = await client.listTools()
      const response = await client.callTool({
        name: 'todo_init',
        arguments: { cwd: directory.path, path: 'todos.json' },
      })
      const listed = await client.callTool({ name: 'template_list', arguments: {} })
      const scaffolded = await client.callTool({
        name: 'scaffold',
        arguments: {
          name: 'spec-driven-plan',
          cwd: directory.path,
          path: 'docs/deep',
          filename: 'custom.md',
        },
      })
      const duplicate = await client.callTool({
        name: 'scaffold',
        arguments: {
          name: 'spec-driven-plan',
          cwd: directory.path,
          path: 'docs/deep',
          filename: 'custom.md',
        },
      })
      const invalidName = await client.callTool({
        name: 'scaffold',
        arguments: { name: 'invalid', cwd: directory.path, path: '.', filename: 'other.md' },
      })
      const invalidPath = await client.callTool({
        name: 'scaffold',
        arguments: {
          name: 'spec-driven-plan',
          cwd: directory.path,
          path: '../',
          filename: 'escape.md',
        },
      })
      const invalidFilename = await client.callTool({
        name: 'scaffold',
        arguments: {
          name: 'spec-driven-plan',
          cwd: directory.path,
          path: '.',
          filename: '../escape.md',
        },
      })
      const logPath = join(await realpath(directory.path), 'logs.txt')
      const logged = await client.callTool({
        name: 'log_append',
        arguments: { path: logPath, message: 'Implementation started' },
      })
      const invalidLog = await client.callTool({
        name: 'log_append',
        arguments: { path: logPath, message: 'bad\nentry' },
      })

      // Assert
      expect(tools.map((tool) => tool.name).sort()).toEqual(
        [
          'project_context',
          'log_append',
          'scaffold',
          'template_list',
          'todo_add',
          'todo_complete',
          'todo_init',
          'todo_list',
          'todo_remove',
        ].sort(),
      )
      expect(tools.find((tool) => tool.name === 'project_context')?.outputSchema).toBeDefined()
      expect(responseText(response)).toEqual({ created: true, list: { version: 1, tasks: [] } })
      const context = await client.callTool({
        name: 'project_context',
        arguments: { cwd: directory.path },
      })
      expect(context.isError).toBe(true)
      expect(context.structuredContent).toBeUndefined()
      expect(responseText(context).error).toContain('difflab-init')
      expect((responseText(listed) as { name: string }[]).map((item) => item.name)).toEqual([
        'spec-driven-plan',
        'software-architecture-design',
        'architecture-decision-record',
        'product-requirements-document',
        'code-review',
        'planning-intent',
        'ui-component-architecture',
        'pull-request-description',
        'flow-definition',
        'flow-instance',
        'exploration-summary',
        'exploration-research',
        'exploration-proposal',
        'poc-readme',
      ])
      expect(responseText(scaffolded)).toEqual({
        name: 'spec-driven-plan',
        path: join(await realpath(directory.path), 'docs/deep/custom.md'),
      })
      expect(await readFile(join(directory.path, 'docs/deep/custom.md'), 'utf8')).toBe(
        await readFile(join(directory.path, '.difflab/templates/spec-driven-plan.md'), 'utf8'),
      )
      expect(duplicate.isError).toBe(true)
      expect(responseText(duplicate)).toEqual({ error: expect.stringContaining('already exists') })
      expect(invalidName.isError).toBe(true)
      expect(responseText(invalidName)).toEqual({
        error: expect.stringContaining('Unknown template'),
      })
      expect(invalidPath.isError).toBe(true)
      expect(responseText(invalidPath)).toEqual({
        error: expect.stringContaining('parent traversal'),
      })
      expect(logged.isError).toBeUndefined()
      expect(logged.structuredContent).toEqual({
        result: {
          path: logPath,
          entry: expect.stringMatching(/^\[\d{6} \d{2}:\d{2}:\d{2}\]: Implementation started$/),
        },
      })
      expect(await readFile(logPath, 'utf8')).toBe(`${responseText(logged).entry}\n`)
      expect(invalidLog.isError).toBe(true)
      expect(invalidFilename.isError).toBe(true)
      // MCP's schema validation rejects this before the tool callback serializes JSON.
      expect(JSON.stringify(invalidFilename)).toContain('filename')
    } finally {
      await client.close()
    }
  }, 15_000)

  test('returns configured project context over stdio with a temporary user home', async () => {
    const directory = await createTempDirectory('difflab-context-stdio-')
    cleanups.push(directory.cleanup)
    const userHome = join(directory.path, 'home')
    const repositoryRoot = join(directory.path, 'repo')
    await mkdir(userHome)
    await mkdir(repositoryRoot)
    execFileSync('git', ['init', '-q', repositoryRoot])
    execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:example/stdio.git'], {
      cwd: repositoryRoot,
    })
    const project = await createUserStore(userHome).createProject('STD', 'Stdio Project')
    await createProgram(() => {}, '0.1.0', { cwd: repositoryRoot, home: userHome }).parseAsync([
      'node',
      'difflab',
      'init',
      project.id,
    ])
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        process.env.DIFFLAB_MCP_TEST_ENTRY ?? join(import.meta.dir, '..', 'index.ts'),
        'mcp',
        'serve',
      ],
      env: { ...process.env, HOME: userHome },
      stderr: 'pipe',
    })
    const client = new Client({ name: 'difflab-test', version: '0.1.0' })
    try {
      await client.connect(transport)
      const response = await client.callTool({
        name: 'project_context',
        arguments: { cwd: repositoryRoot },
      })
      const globalDefinition = await client.callTool({
        name: 'scaffold',
        arguments: {
          name: 'flow-definition',
          cwd: join(userHome, '.difflab'),
          path: 'flows',
          filename: 'sample.md',
        },
      })
      const localInstance = await client.callTool({
        name: 'scaffold',
        arguments: {
          name: 'flow-instance',
          cwd: repositoryRoot,
          path: '.difflab/flows/261005-sample',
          filename: 'FLOW.md',
        },
      })
      const collision = await client.callTool({
        name: 'scaffold',
        arguments: {
          name: 'flow-instance',
          cwd: repositoryRoot,
          path: '.difflab/flows/261005-sample',
          filename: 'FLOW.md',
        },
      })
      expect(response.isError).toBeUndefined()
      expect(response.structuredContent).toBeDefined()
      expect(
        (response.structuredContent as { repository: { localPath: string } }).repository.localPath,
      ).toBe(await realpath(repositoryRoot))
      expect(responseText(response).project.id).toBe(project.id)
      expect(responseText(response).repository.origin).toBe('https://github.com/example/stdio')
      expect(globalDefinition.isError).toBeUndefined()
      expect(localInstance.isError).toBeUndefined()
      expect(collision.isError).toBe(true)
      expect(await readFile(join(userHome, '.difflab/flows/sample.md'), 'utf8')).toContain(
        '## Inputs',
      )
      expect(
        await readFile(join(repositoryRoot, '.difflab/flows/261005-sample/FLOW.md'), 'utf8'),
      ).toContain('## Steps')
    } finally {
      await client.close()
    }
  }, 15_000)
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
})

// Helpers ---------------------------------------------------------------------
function responseText(response: unknown) {
  if (
    !response ||
    typeof response !== 'object' ||
    !('content' in response) ||
    !Array.isArray(response.content)
  ) {
    throw new Error('MCP response had no content')
  }
  const item: unknown = response.content.find(
    (entry: unknown) =>
      entry !== null && typeof entry === 'object' && 'type' in entry && entry.type === 'text',
  )
  if (!item || typeof item !== 'object' || !('text' in item) || typeof item.text !== 'string') {
    throw new Error('MCP response had no text')
  }
  return JSON.parse(item.text)
}
