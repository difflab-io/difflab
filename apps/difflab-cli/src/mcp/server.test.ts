import { describe, expect, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

describe('Difflab MCP over stdio', () => {
  test('exposes todo tools and persists their changes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'difflab-mcp-'))
    const file = join(directory, 'todos.json')
    const todoArgs = { cwd: directory, path: 'todos.json' }
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
      await client.connect(transport)
      const { tools } = await client.listTools()
      expect(tools.map((tool) => tool.name).sort()).toEqual([
        'todo_add',
        'todo_complete',
        'todo_init',
        'todo_list',
        'todo_remove',
      ])
      for (const tool of tools) {
        expect(tool.inputSchema.required).toContain('cwd')
        expect(tool.inputSchema.required).toContain('path')
        expect(tool.description).toContain('absolute cwd')
        expect(tool.description).toContain('relative path')
      }
      const uninitialized = await client.callTool({ name: 'todo_list', arguments: todoArgs })
      expect('isError' in uninitialized && uninitialized.isError).toBe(true)
      const initial = await client.callTool({ name: 'todo_init', arguments: todoArgs })
      expect(responseText(initial)).toEqual({ created: true, list: { version: 1, tasks: [] } })
      const add = await client.callTool({
        name: 'todo_add',
        arguments: { ...todoArgs, text: 'Test MCP' },
      })
      const task = responseText(add)
      expect(task).toMatchObject({ text: 'Test MCP', done: false })
      expect(
        responseText(
          await client.callTool({ name: 'todo_complete', arguments: { ...todoArgs, id: task.id } }),
        ),
      ).toMatchObject({ done: true })
      expect(
        responseText(await client.callTool({ name: 'todo_list', arguments: todoArgs })).tasks,
      ).toHaveLength(1)
      const otherArgs = { cwd: directory, path: 'other.json' }
      await client.callTool({ name: 'todo_init', arguments: otherArgs })
      expect(
        responseText(await client.callTool({ name: 'todo_list', arguments: otherArgs })).tasks,
      ).toHaveLength(0)
      expect(
        responseText(
          await client.callTool({ name: 'todo_remove', arguments: { ...todoArgs, id: task.id } }),
        ),
      ).toMatchObject({ id: task.id })
      expect(
        responseText(await client.callTool({ name: 'todo_list', arguments: todoArgs })).tasks,
      ).toHaveLength(0)
      expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ version: 1, tasks: [] })
      const missing = await client.callTool({
        name: 'todo_remove',
        arguments: { ...todoArgs, id: task.id },
      })
      expect('isError' in missing && missing.isError).toBe(true)
      expect(responseText(missing).error).toContain('Unknown task ID')
      const escape = await client.callTool({
        name: 'todo_init',
        arguments: { cwd: directory, path: '../outside.json' },
      })
      expect('isError' in escape && escape.isError).toBe(true)
      expect(responseText(escape).error).toContain('outside cwd')
    } finally {
      await client.close()
      await rm(directory, { recursive: true, force: true })
    }
  }, 15_000)
})
