import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('Difflab MCP setup', () => {
  test('registers selected clients idempotently', async () => {
    const home = await mkdtemp(join(tmpdir(), 'difflab-mcp-home-'))
    const entry = process.env.DIFFLAB_MCP_TEST_ENTRY ?? join(import.meta.dir, '..', 'index.ts')
    const setup = () =>
      execFileSync(
        process.execPath,
        [entry, 'mcp', 'setup', '--client', 'pi', '--client', 'cursor'],
        { encoding: 'utf8', env: { ...process.env, HOME: home } },
      )
    try {
      expect(setup()).toContain('Added pi:')
      const pi = JSON.parse(await readFile(join(home, '.config', 'mcp', 'mcp.json'), 'utf8'))
      const cursor = JSON.parse(await readFile(join(home, '.cursor', 'mcp.json'), 'utf8'))
      expect(pi.mcpServers.difflab).toEqual({
        command: 'npx',
        args: ['-y', '@difflab/difflab-cli', 'mcp', 'serve'],
      })
      expect(cursor.mcpServers.difflab).toEqual(pi.mcpServers.difflab)
      expect(setup()).toContain('Already configured pi:')
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  }, 15_000)
})
