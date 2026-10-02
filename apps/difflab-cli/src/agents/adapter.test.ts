import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mcpServer, type SetupContext } from './adapter'
import { agentAdapter, agentNames } from './index'
import { patchJsonToFile } from '../extensions/fsx'

describe('agent MCP adapters', () => {
  test('registry resolves supported agents', () => {
    // Arrange
    const unsupported = 'not-an-agent'
    // Act
    const supported = agentNames
    const missing = agentAdapter(unsupported)
    // Assert
    expect(supported).toEqual(['pi', 'cursor', 'codex', 'claude-code', 'claude-desktop'])
    expect(missing).toBeUndefined()
  })

  test('preserves unrelated Pi servers and is idempotent', async () => {
    // Arrange
    const home = await tempHome()
    const file = join(home, '.config', 'mcp', 'mcp.json')
    await patchJsonToFile(file, () => ({
      settings: { enabled: true },
      mcpServers: { other: { command: 'other-server' } },
    }))
    // Act
    const first = await setup('pi', { home })
    const updated = await readFile(file, 'utf8')
    const second = await setup('pi', { home })
    // Assert
    expect(first.status).toBe('added')
    expect(second.status).toBe('existing')
    const data = JSON.parse(updated)
    expect(data.settings).toEqual({ enabled: true })
    expect(data.mcpServers.other).toEqual({ command: 'other-server' })
    expect(data.mcpServers.difflab).toEqual(mcpServer)
    expect(await readFile(file, 'utf8')).toBe(updated)
  })

  test('supports Claude Desktop user-level JSON config', async () => {
    // Arrange
    const home = await tempHome()
    const expected = join(
      home,
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json',
    )
    // Act
    const result = await setup('claude-desktop', { home, platform: 'darwin' })
    const content = JSON.parse(await readFile(result.file, 'utf8'))
    // Assert
    expect(result.file).toBe(expected)
    expect(content.mcpServers.difflab).toEqual(mcpServer)
  })

  test('uses Codex and Claude Code native CLIs', async () => {
    // Arrange
    const home = await tempHome()
    const calls: { command: string; args: string[]; cwd: string }[] = []
    const run = (command: string, args: string[], cwd: string) => calls.push({ command, args, cwd })
    // Act
    const codex = await setup('codex', { home, run })
    const claude = await setup('claude-code', { home, run })
    // Assert
    expect(codex.status).toBe('added')
    expect(claude.status).toBe('added')
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
  })

  test('keeps an existing matching Codex entry idempotent', async () => {
    // Arrange
    const home = await tempHome()
    const run = () => {}
    const codexFile = join(home, '.codex', 'config.toml')
    await mkdir(join(home, '.codex'), { recursive: true })
    await writeFile(
      codexFile,
      '[mcp_servers.difflab]\ncommand = "npx"\nargs = ["-y", "@difflab/difflab-cli", "mcp", "serve"]\n',
    )
    // Act
    const result = await setup('codex', { home, run })
    // Assert
    expect(result.status).toBe('existing')
  })

  test('rejects a conflicting Codex entry', async () => {
    // Arrange
    const home = await tempHome()
    const run = () => {}
    const codexFile = join(home, '.codex', 'config.toml')
    await mkdir(join(home, '.codex'), { recursive: true })
    await writeFile(codexFile, '[mcp_servers.difflab]\ncommand = "other"\n')
    // Act
    const conflict = await setup('codex', { home, run }).catch((error: unknown) => error)
    // Assert
    expect(conflict).toBeInstanceOf(Error)
    expect((conflict as Error).message).toContain('different difflab entry')
  })
})

// Helpers ---------------------------------------------------------------------
const homes: string[] = []
async function tempHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'difflab-setup-'))
  homes.push(home)
  return home
}
function setup(id: string, context: SetupContext) {
  const adapter = agentAdapter(id)
  if (!adapter) throw new Error(`Missing test adapter: ${id}`)
  return adapter.setupMcpConfig(context)
}
afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
})
