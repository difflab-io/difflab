import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'bun:test'
import { readProjectContext } from './context.js'
import { MissingGlobalConfig, MissingRepoConfig } from './errors.js'

// Setup -----------------------------------------------------------------------
let temp: string
let repo: string
let home: string
beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'difflab-context-unit-'))
  repo = join(temp, 'repo')
  home = join(temp, 'home')
  await mkdir(repo)
  execFileSync('git', ['init', '-q', repo])
  execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/example/one'], { cwd: repo })
})

// Tests -----------------------------------------------------------------------
test('readProjectContext throws MissingRepoConfig when difflab.yaml is absent', async () => {
  // Arrange / Act / Assert
  await expect(readProjectContext(repo, home)).rejects.toBeInstanceOf(MissingRepoConfig)
})

test('readProjectContext throws MissingGlobalConfig when the repo is linked without global setup', async () => {
  // Arrange
  await writeFile(join(repo, 'difflab.yaml'), 'schemaVersion: 1\nproject:\n  id: MYA\n')
  await symlink(join(temp, 'missing-project', 'example--one'), join(repo, '.difflab'))

  // Act / Assert
  await expect(readProjectContext(repo, home)).rejects.toBeInstanceOf(MissingGlobalConfig)
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await rm(temp, { recursive: true, force: true })
})
