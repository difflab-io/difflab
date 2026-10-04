import { afterEach, beforeEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { execFileSync } from 'node:child_process'
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProgram } from '../cli.js'
import { createProjectTools } from './tools.js'
import { createUserStore, userPaths } from '../store/user-store.js'

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

test('returns typed context without writing database sidecars or migrating old schemas', async () => {
  // Arrange
  await mkdir(home)
  const project = await createProject('MYA', 'My Project')
  await initialize({ cwd: repo, home, projectId: project.id })
  const tool = createProjectTools(home)[0]!
  const paths = userPaths(home)
  const before = await readdir(paths.root)

  // Act
  const ready = await tool.callback({ cwd: repo })

  // Assert
  expect(await readdir(paths.root)).toEqual(before)
  expect(ready.isError).toBeUndefined()
  expect(ready.structuredContent).toMatchObject({ project: { id: project.id } })
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
  const project = await createProject('FIR', 'First')
  const second = await createProject('SEC', 'Second')
  await initialize({ cwd: repo, home, projectId: project.id })
  const path = join(repo, 'difflab.yaml')
  await writeFile(path, (await readFile(path, 'utf8')).replace(project.id, second.id))

  // Act
  const result = await createProjectTools(home)[0]!.callback({ cwd: repo })

  // Assert
  expect(result.isError).toBe(true)
  expect(JSON.stringify(result.content)).toContain('not registered')
  expect((await createUserStore(home).getProjectById(second.id)).repositories).toHaveLength(0)
})

test('rejects missing databases and wrong symlinks without repairing either', async () => {
  // Arrange
  await mkdir(home)
  const project = await createProject('FIR', 'First')
  await initialize({ cwd: repo, home, projectId: project.id })
  const tool = createProjectTools(home)[0]!
  const link = join(repo, '.difflab')
  await rm(link)
  await symlink(temp, link)

  // Act / Assert
  const mismatch = await tool.callback({ cwd: repo })
  expect(mismatch.isError).toBe(true)
  expect(JSON.stringify(mismatch.content)).toContain('links elsewhere')
  await rm(link)
  await symlink(join(userPaths(home).projects, project.id, 'example--one'), link)
  const file = userPaths(home).database
  await rename(file, `${file}.missing`)
  const missing = await tool.callback({ cwd: repo })
  expect(missing.isError).toBe(true)
  expect(JSON.stringify(missing.content)).toContain('difflab-init')
  await expect(lstat(file)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readdir(userPaths(home).root)).not.toContain('difflab.sqlite-wal')
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
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

function createProject(key: string, name: string) {
  return createUserStore(home).createProject(key, name)
}
