import { afterEach, describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createTempDirectory } from '../extensions/testx'

// Setup -----------------------------------------------------------------------
const cleanups: (() => Promise<void>)[] = []

// Tests -----------------------------------------------------------------------
describe('Difflab MCP setup', () => {
  test('registers selected clients idempotently', async () => {
    // Arrange
    const home = await createTempDirectory('difflab-mcp-home-')
    cleanups.push(home.cleanup)
    const entry = process.env.DIFFLAB_MCP_TEST_ENTRY ?? join(import.meta.dir, '..', 'index.ts')
    const setup = () =>
      execFileSync(
        process.execPath,
        [entry, 'mcp', 'setup', '--client', 'pi', '--client', 'cursor'],
        { encoding: 'utf8', env: { ...process.env, HOME: home.path } },
      )

    // Act
    const firstOutput = setup()
    const pi = JSON.parse(await readFile(join(home.path, '.config', 'mcp', 'mcp.json'), 'utf8'))
    const cursor = JSON.parse(await readFile(join(home.path, '.cursor', 'mcp.json'), 'utf8'))
    const secondOutput = setup()

    // Assert
    expect(firstOutput).toContain('Added pi:')
    expect(pi.mcpServers.difflab).toEqual({
      command: 'npx',
      args: ['-y', '@difflab/difflab-cli', 'mcp', 'serve'],
    })
    expect(cursor.mcpServers.difflab).toEqual(pi.mcpServers.difflab)
    expect(secondOutput).toContain('Already configured pi:')
  }, 15_000)
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
})
