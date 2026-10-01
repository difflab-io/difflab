import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { mcpServer, type SetupContext } from './adapter'
import { agentAdapter, agentNames } from './index'
import { jsonAgentAdapter } from './json-config'

const homes: string[] = []
async function tempHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'difflab-setup-'))
  homes.push(home)
  return home
}
async function put(file: string, content: string) {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, content)
}
async function failure(result: Promise<unknown>, text: string) {
  const error: unknown = await result.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(Error)
  if (error instanceof Error) expect(error.message).toContain(text)
}
function setup(id: string, context: SetupContext) {
  const adapter = agentAdapter(id)
  if (!adapter) throw new Error(`Missing test adapter: ${id}`)
  return adapter.setupMcpConfig(context)
}
afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
})

describe('agent MCP adapters', () => {
  test('registry resolves supported agents', () => {
    expect(agentNames).toEqual(['pi', 'cursor', 'codex', 'claude-code', 'claude-desktop'])
    expect(agentAdapter('not-an-agent')).toBeUndefined()
  })

  test('preserves unrelated Pi servers and is idempotent', async () => {
    const home = await tempHome()
    const file = join(home, '.config', 'mcp', 'mcp.json')
    await put(
      file,
      JSON.stringify({
        settings: { enabled: true },
        mcpServers: { other: { command: 'other-server' } },
      }),
    )
    expect((await setup('pi', { home })).status).toBe('added')
    const updated = await readFile(file, 'utf8')
    const data = JSON.parse(updated)
    expect(data.settings).toEqual({ enabled: true })
    expect(data.mcpServers.other).toEqual({ command: 'other-server' })
    expect(data.mcpServers.difflab).toEqual(mcpServer)
    expect((await setup('pi', { home })).status).toBe('existing')
    expect(await readFile(file, 'utf8')).toBe(updated)
  })

  test('rejects malformed and conflicting JSON without modifying it', async () => {
    const home = await tempHome()
    const file = join(home, '.cursor', 'mcp.json')
    for (const content of [
      '{broken',
      JSON.stringify({ mcpServers: { difflab: { command: 'different' } } }),
    ]) {
      await put(file, content)
      await failure(
        setup('cursor', { home }),
        content === '{broken' ? 'Invalid MCP config' : 'different configuration',
      )
      expect(await readFile(file, 'utf8')).toBe(content)
    }
  })

  test('supports Claude Desktop user-level JSON config', async () => {
    const home = await tempHome()
    const result = await setup('claude-desktop', { home, platform: 'darwin' })
    expect(result.file).toBe(
      join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
    )
    expect(JSON.parse(await readFile(result.file, 'utf8')).mcpServers.difflab).toEqual(mcpServer)
  })

  test('uses Codex and Claude Code native CLIs without overwriting existing entries', async () => {
    const home = await tempHome()
    const calls: { command: string; args: string[]; cwd: string }[] = []
    const run = (command: string, args: string[], cwd: string) => {
      calls.push({ command, args, cwd })
    }
    await setup('codex', { home, run })
    await setup('claude-code', { home, run })
    expect(calls).toEqual([
      {
        command: 'codex',
        args: ['mcp', 'add', 'difflab', '--', mcpServer.command, ...mcpServer.args],
        cwd: home,
      },
      {
        command: 'claude',
        args: [
          'mcp',
          'add',
          '--scope',
          'user',
          'difflab',
          '--',
          mcpServer.command,
          ...mcpServer.args,
        ],
        cwd: home,
      },
    ])
    const codexFile = join(home, '.codex', 'config.toml')
    await put(
      codexFile,
      '[mcp_servers.difflab]\ncommand = "npx"\nargs = ["-y", "@difflab/difflab-cli", "mcp", "serve"]\n',
    )
    expect((await setup('codex', { home, run })).status).toBe('existing')
    await put(codexFile, '[mcp_servers.difflab]\ncommand = "other"\n')
    await failure(setup('codex', { home, run }), 'different difflab entry')
    const claudeFile = join(home, '.claude.json')
    await put(claudeFile, JSON.stringify({ mcpServers: { difflab: mcpServer } }))
    expect((await setup('claude-code', { home, run })).status).toBe('existing')
    expect(calls).toHaveLength(2)
  })

  test('new JSON agents only need a path resolver', async () => {
    const home = await tempHome()
    const custom = jsonAgentAdapter('custom', (context) =>
      join(context.home ?? home, 'custom-mcp.json'),
    )
    expect(custom.id).toBe('custom')
    expect((await custom.setupMcpConfig({ home })).status).toBe('added')
    expect(
      JSON.parse(await readFile(join(home, 'custom-mcp.json'), 'utf8')).mcpServers.difflab,
    ).toEqual(mcpServer)
  })
})
