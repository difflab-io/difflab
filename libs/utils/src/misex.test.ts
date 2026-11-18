import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertMiseConfig, buildMiseExecArgs, MissingMiseConfigError } from './misex.js'

// Setup -----------------------------------------------------------------------
let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'difflab-misex-'))
})

// Tests -----------------------------------------------------------------------
describe('given a repository directory', () => {
  test('when mise.toml is absent, then assertMiseConfig throws MissingMiseConfigError', async () => {
    // Arrange & Act & Assert
    await expect(assertMiseConfig(root)).rejects.toBeInstanceOf(MissingMiseConfigError)
  })

  test('when mise.toml is present, then assertMiseConfig resolves path and buildMiseExecArgs wraps command', async () => {
    // Arrange
    const expected = join(root, 'mise.toml')
    await writeFile(expected, '[tools]\nbun = "1.4.2"\n')

    // Act
    const detected = await assertMiseConfig(root)
    const args = buildMiseExecArgs('claude', ['--settings', '/tmp/run.json'])

    // Assert
    expect(detected).toBe(expected)
    expect(args).toEqual(['exec', '--', 'claude', '--settings', '/tmp/run.json'])
  })
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})
