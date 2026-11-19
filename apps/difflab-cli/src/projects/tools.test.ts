import { Database } from 'bun:sqlite'
import { execFileSync } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'bun:test'
import { resolveDifflabClient } from 'difflab-client-ts'
import { resolveDifflabPaths } from 'difflab-config'
import { stopDaemon } from 'difflab-daemon'
import { createProgram } from '../cli.js'
import { createProjectTools } from './tools.js'

// Setup -----------------------------------------------------------------------
let temp: string
let repo: string
let home: string
beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'difflab-context-'))
  repo = join(temp, 'repo')
  home = join(temp, 'home')
  await mkdir(repo)
  execFileSync('git', ['init', '-q', repo])
  execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/example/one'], { cwd: repo })
})

// Tests -----------------------------------------------------------------------
test('missing setup and invalid cwd produce skill-directed errors without creating home', async () => {
  // Arrange
  const tool = createProjectTools(home)[0]!

  // Act
  const missing = await tool.callback({ cwd: repo })
  const invalid = await tool.callback({ cwd: 'relative/path' })

  // Assert
  expect(missing.isError).toBe(true)
  expect(invalid.isError).toBe(true)
  expect(JSON.stringify(missing.content)).toContain('difflab-init')
  await expect(lstat(home)).rejects.toMatchObject({ code: 'ENOENT' })
})

test('returns typed context and fails without migrating when local.sqlite loses migration rows', async () => {
  // Arrange
  await mkdir(home)
  await createProject('MYA', 'My Project', 'https://github.com/example/one')
  await initialize({ cwd: repo, home, projectId: 'MYA' })
  const tool = createProjectTools(home)[0]!
  const paths = resolveDifflabPaths(home)

  // Act
  const ready = await tool.callback({ cwd: repo })

  // Assert
  expect(ready.isError).toBeUndefined()
  expect(ready.structuredContent).toMatchObject({ project: { id: 'MYA' } })

  await stopDaemon(paths.root)
  const db = new Database(paths.database)
  db.run('DELETE FROM kysely_migration')
  db.close()

  const outdated = await tool.callback({ cwd: repo })
  expect(outdated.isError).toBe(true)
  expect(JSON.stringify(outdated.content)).toContain('difflab-init')
  const reopened = new Database(paths.database, { readonly: true })
  expect(
    (reopened.query('SELECT count(*) AS total FROM kysely_migration').get() as { total: number })
      .total,
  ).toBe(0)
  reopened.close()
})

test('rejects a manifest for another project rather than auto-linking the origin', async () => {
  // Arrange
  await mkdir(home)
  await createProject('FIR', 'First', 'https://github.com/example/one')
  await createProject('SEC', 'Second', 'https://github.com/example/two')
  await initialize({ cwd: repo, home, projectId: 'FIR' })
  const configPath = join(repo, 'difflab.yaml')
  await writeFile(configPath, (await readFile(configPath, 'utf8')).replace('FIR', 'SEC'))
  const wrongStore = join(resolveDifflabPaths(home).projects, 'SEC', 'github.com--example--one')
  await mkdir(wrongStore, { recursive: true })
  await rm(join(repo, '.difflab'))
  await symlink(wrongStore, join(repo, '.difflab'))

  // Act
  const result = await createProjectTools(home)[0]!.callback({ cwd: repo })

  // Assert
  expect(result.isError).toBe(true)
  expect(JSON.stringify(result.content)).toContain('not registered')
  const client = await resolveDifflabClient({ home })
  const second = await client.projects.getProject({ key: 'SEC' })
  expect(second.project?.repositories.map((r) => r.remoteUrl)).toEqual([
    'https://github.com/example/two',
  ])
})

test('rejects wrong symlinks and missing projects without repairing either', async () => {
  // Arrange
  await mkdir(home)
  await createProject('FIR', 'First', 'https://github.com/example/one')
  await initialize({ cwd: repo, home, projectId: 'FIR' })
  const tool = createProjectTools(home)[0]!
  const paths = resolveDifflabPaths(home)
  const link = join(repo, '.difflab')
  await rm(link)
  await symlink(temp, link)

  // Act / Assert
  const mismatch = await tool.callback({ cwd: repo })
  expect(mismatch.isError).toBe(true)
  expect(JSON.stringify(mismatch.content)).toContain('links elsewhere')

  await rm(link)
  const validStore = join(paths.projects, 'FIR', 'github.com--example--one')
  await symlink(validStore, link)
  await stopDaemon(paths.root)
  await rm(paths.database, { force: true })
  await rm(`${paths.database}-wal`, { force: true })
  await rm(`${paths.database}-shm`, { force: true })

  const missing = await tool.callback({ cwd: repo })
  expect(missing.isError).toBe(true)
  expect(JSON.stringify(missing.content)).toContain('difflab-init')
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  try {
    await stopDaemon(resolveDifflabPaths(home).root)
  } catch {
    // Ignore when home was never created.
  }
  await rm(temp, { recursive: true, force: true })
})

// Helpers ---------------------------------------------------------------------
async function initialize(options: { cwd: string; home: string; projectId: string }) {
  await createProgram(() => {}, '0.1.0', options).parseAsync([
    'node',
    'difflab',
    'init',
    options.projectId,
  ])
}

async function createProject(key: string, name: string, origin: string) {
  await createProgram(() => {}, '0.1.0', { home }).parseAsync([
    'node',
    'difflab',
    'project',
    'add',
    key,
    '--name',
    name,
    '--repo',
    origin,
  ])
}
