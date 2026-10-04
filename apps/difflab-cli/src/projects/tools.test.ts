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
import { createProject, databasePath } from 'difflab-db'
import { initializeRepository } from './init.js'
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
  const tool = createProjectTools(home)[0]!
  const missing = await tool.callback({ cwd: repo })
  const invalid = await tool.callback({ cwd: 'relative/path' })

  expect(missing.isError).toBe(true)
  expect(invalid.isError).toBe(true)
  expect(JSON.stringify(missing.content)).toContain('difflab-init')
  expect(JSON.stringify(invalid.content)).toContain('difflab-init')
  await expect(lstat(home)).rejects.toMatchObject({ code: 'ENOENT' })
})

test('returns configured project context and rejects old schemas without migrating', async () => {
  await mkdir(home)
  const project = await createProject('MYA', 'My Project', home)
  await initializeRepository({ cwd: repo, home, projectId: project.id })
  const tool = createProjectTools(home)[0]!
  const dbDirectory = join(home, '.difflab', 'projects', project.id, 'db')
  const before = await readdir(dbDirectory)
  const ready = await tool.callback({ cwd: repo })
  expect(await readdir(dbDirectory)).toEqual(before)
  expect(ready.isError).toBeUndefined()
  expect(JSON.parse(ready.content[0]!.text).project.id).toBe(project.id)

  const file = databasePath(project.id, home)
  const db = new Database(file)
  db.run('PRAGMA user_version = 0')
  db.close()
  const outdated = await tool.callback({ cwd: repo })
  expect(outdated.isError).toBe(true)
  expect(JSON.stringify(outdated.content)).toContain('not current')
  expect(JSON.stringify(outdated.content)).toContain('difflab-init')
  const reopened = new Database(file, { readonly: true })
  expect(
    (reopened.query('PRAGMA user_version').get() as { user_version: number }).user_version,
  ).toBe(0)
  reopened.close()
})

test('rejects a manifest that refers to another project', async () => {
  await mkdir(home)
  const project = await createProject('FIR', 'First', home)
  const second = await createProject('SEC', 'Second', home)
  await initializeRepository({ cwd: repo, home, projectId: project.id })
  const path = join(repo, 'difflab.yaml')
  await writeFile(path, (await readFile(path, 'utf8')).replace(project.id, second.id))

  const result = await createProjectTools(home)[0]!.callback({ cwd: repo })
  expect(result.isError).toBe(true)
  expect(JSON.stringify(result.content)).toContain('different project database')
})

test('rejects missing databases and mismatched symlinks without repairing them', async () => {
  await mkdir(home)
  const project = await createProject('FIR', 'First', home)
  await initializeRepository({ cwd: repo, home, projectId: project.id })
  const tool = createProjectTools(home)[0]!
  const link = join(repo, '.difflab')
  await rm(link)
  await symlink(temp, link)
  const mismatch = await tool.callback({ cwd: repo })
  expect(mismatch.isError).toBe(true)
  expect(JSON.stringify(mismatch.content)).toContain('outside a project')
  await rm(link)
  await symlink(join(home, '.difflab', 'projects', project.id, 'example--one'), link)
  const file = databasePath(project.id, home)
  await rename(file, `${file}.missing`)
  const missing = await tool.callback({ cwd: repo })
  expect(missing.isError).toBe(true)
  expect(JSON.stringify(missing.content)).toContain('difflab-init')
  await expect(lstat(file)).rejects.toMatchObject({ code: 'ENOENT' })
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await rm(temp, { recursive: true, force: true })
})
