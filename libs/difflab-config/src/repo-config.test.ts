import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'bun:test'
import { InvalidRepoConfig } from './errors.js'
import { readRepoConfig } from './repo-config.js'

// Setup -----------------------------------------------------------------------
let temp: string
let repo: string
beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'difflab-repo-config-'))
  repo = join(temp, 'repo')
  await mkdir(repo)
})

// Tests -----------------------------------------------------------------------
test('readRepoConfig reports malformed config as InvalidRepoConfig', async () => {
  // Arrange
  await writeFile(join(repo, 'difflab.yaml'), 'schemaVersion: [')

  // Act / Assert
  await expect(readRepoConfig(repo)).rejects.toBeInstanceOf(InvalidRepoConfig)
})

test('readRepoConfig groups all schema issues in one InvalidRepoConfig', async () => {
  // Arrange
  await writeFile(
    join(repo, 'difflab.yaml'),
    'schemaVersion: 2\nproject:\n  id: bad\nextra: true\n',
  )

  // Act / Assert
  try {
    await readRepoConfig(repo)
    throw new Error('expected InvalidRepoConfig')
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidRepoConfig)
    expect((error as Error).message).toContain('schemaVersion')
    expect((error as Error).message).toContain('project.id')
    expect((error as Error).message).toContain('Unrecognized key')
  }
})

test('readRepoConfig rejects non-canonical project keys before database lookup', async () => {
  // Arrange
  await writeFile(join(repo, 'difflab.yaml'), 'schemaVersion: 1\nproject:\n  id: bad\n')

  // Act / Assert
  await expect(readRepoConfig(repo)).rejects.toMatchObject({ name: 'InvalidRepoConfig' })
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await rm(temp, { recursive: true, force: true })
})
