import { afterEach, beforeEach, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { InvalidRepoConfig, MissingGlobalConfig, MissingRepoConfig } from '../errors.js'
import { readProjectContext } from '../context.js'
import { readRepoConfig } from './config.js'

// Setup -----------------------------------------------------------------------
let temp: string
let repo: string
let home: string
beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'difflab-config-'))
  repo = join(temp, 'repo')
  home = join(temp, 'home')
  await mkdir(repo)
  execFileSync('git', ['init', '-q', repo])
  execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/example/one'], { cwd: repo })
})

// Tests -----------------------------------------------------------------------
test('readProjectContext throws MissingRepoConfig when difflab.yaml is absent', async () => {
  await expect(readProjectContext(repo, home)).rejects.toBeInstanceOf(MissingRepoConfig)
})

test('readProjectContext throws MissingGlobalConfig when the repo is linked without global setup', async () => {
  await writeFile(join(repo, 'difflab.yaml'), 'schemaVersion: 1\nproject:\n  id: MYA\n')
  await symlink(join(temp, 'missing-project', 'example--one'), join(repo, '.difflab'))

  await expect(readProjectContext(repo, home)).rejects.toBeInstanceOf(MissingGlobalConfig)
})

test('readRepoConfig reports malformed config as InvalidRepoConfig', async () => {
  await writeFile(join(repo, 'difflab.yaml'), 'schemaVersion: [')

  await expect(readRepoConfig(repo)).rejects.toBeInstanceOf(InvalidRepoConfig)
})

test('readRepoConfig groups all schema issues in one InvalidRepoConfig', async () => {
  await writeFile(
    join(repo, 'difflab.yaml'),
    'schemaVersion: 2\nproject:\n  id: bad\nextra: true\n',
  )

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
  await writeFile(join(repo, 'difflab.yaml'), 'schemaVersion: 1\nproject:\n  id: bad\n')

  await expect(readRepoConfig(repo)).rejects.toMatchObject({ name: 'InvalidRepoConfig' })
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await rm(temp, { recursive: true, force: true })
})
