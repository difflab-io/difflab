import { afterEach, describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdir, realpath } from 'node:fs/promises'
import { createProject } from 'difflab-db'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { join } from 'node:path'
import { createTempDirectory } from '../extensions/testx'
import { initializeRepository } from '../projects/init.js'

// Setup -----------------------------------------------------------------------
const cleanups: (() => Promise<void>)[] = []

// Tests -----------------------------------------------------------------------
describe('Difflab MCP over stdio', () => {
  test('lists todo tools and handles a request over stdio', async () => {
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

      // Assert
      expect(tools.map((tool) => tool.name).sort()).toEqual(
        [
          'todo_add',
          'todo_complete',
          'todo_init',
          'todo_list',
          'todo_remove',
          'project_context',
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
    } finally {
      await client.close()
    }
  }, 15_000)

  test('returns configured project context over stdio with an isolated home', async () => {
    const directory = await createTempDirectory('difflab-context-stdio-')
    cleanups.push(directory.cleanup)
    const home = join(directory.path, 'home')
    const repo = join(directory.path, 'repo')
    await mkdir(home)
    await mkdir(repo)
    execFileSync('git', ['init', '-q', repo])
    execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:example/stdio.git'], {
      cwd: repo,
    })
    const project = await createProject('STD', 'Stdio Project', home)
    await initializeRepository({ cwd: repo, home, projectId: project.id })
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        process.env.DIFFLAB_MCP_TEST_ENTRY ?? join(import.meta.dir, '..', 'index.ts'),
        'mcp',
        'serve',
      ],
      env: { ...process.env, HOME: home },
      stderr: 'pipe',
    })
    const client = new Client({ name: 'difflab-test', version: '0.1.0' })
    try {
      await client.connect(transport)
      const response = await client.callTool({ name: 'project_context', arguments: { cwd: repo } })
      expect(response.isError).toBeUndefined()
      expect(response.structuredContent).toBeDefined()
      expect(
        (response.structuredContent as { repository: { localPath: string } }).repository.localPath,
      ).toBe(await realpath(repo))
      expect(responseText(response).project.id).toBe(project.id)
      expect(responseText(response).repository.github).toBe('https://github.com/example/stdio')
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
