import { afterEach, beforeEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  canonicalGitUrl,
  createDifflabDb,
  ProjectConflictError,
  DifflabDbError,
  repositorySlug,
  validateProjectKey,
  type DifflabDb,
} from './index.js'

// Setup -----------------------------------------------------------------------
let root: string
let path: string
const stores: DifflabDb[] = []
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'difflab-db-'))
  path = join(root, 'projects.sqlite')
})

// Tests -----------------------------------------------------------------------
test('stores multiple projects in one database and reopens them', async () => {
  const store = await open()
  const first = await store.projects.createProject('des', 'Design Tools', [
    'git@github.com:Example/Library.git',
  ])
  const second = await store.projects.createProject('PLA', 'Planning')
  await store.close()
  const reopened = await open()
  expect(await reopened.projects.listProjects()).toEqual([first, second])
  expect(await reopened.projects.getProjectById('DES')).toEqual(first)
  expect(await reopened.projects.getProjectById('PLA')).toEqual(second)
  expect((await stat(path)).isFile()).toBe(true)
  expect(await readdir(root)).toEqual(['projects.sqlite'])
})

test('migrations are idempotent and leave unrelated data intact', async () => {
  const first = await open()
  await first.projects.createProject('ONE', 'One')
  await first.close()
  const db = new Database(path)
  db.run('CREATE TABLE user_notes (message TEXT)')
  db.run("INSERT INTO user_notes VALUES ('keep')")
  db.close()
  const second = await open()
  expect((await second.projects.listProjects()).map((item) => item.id)).toEqual(['ONE'])
  const check = new Database(path, { readonly: true })
  expect(check.query('SELECT name FROM kysely_migration').all()).toEqual([{ name: '001_initial' }])
  expect(check.query('SELECT message FROM user_notes').all()).toEqual([{ message: 'keep' }])
  check.close()
})

test('rejects duplicate keys, origins and cross-project links while linking idempotently', async () => {
  const store = await open()
  const first = await store.projects.createProject('FIR', 'First', ['git@github.com:Org/Repo.git'])
  await store.projects.createProject('SEC', 'Second')
  await expect(store.projects.createProject('fir', 'Duplicate')).rejects.toBeInstanceOf(
    ProjectConflictError,
  )
  expect(
    await store.repositories.linkRepositoryToProject('FIR', 'https://github.com/org/repo'),
  ).toEqual(first.repositories[0]!)
  await expect(
    store.repositories.linkRepositoryToProject('SEC', 'https://github.com/org/repo'),
  ).rejects.toBeInstanceOf(ProjectConflictError)
  await expect(
    store.projects.createProject('THR', 'Third', ['https://github.com/org/repo']),
  ).rejects.toBeInstanceOf(ProjectConflictError)
  expect((await store.projects.listProjects()).map((item) => item.id)).toEqual(['FIR', 'SEC'])
})

test('rolls back all inserts when a later origin conflicts', async () => {
  const store = await open()
  await store.projects.createProject('FIR', 'First', ['https://github.com/org/existing'])
  await expect(
    store.projects.createProject('SEC', 'Second', [
      'https://github.com/org/new',
      'git@github.com:org/existing.git',
    ]),
  ).rejects.toBeInstanceOf(ProjectConflictError)
  expect((await store.projects.listProjects()).map((item) => item.id)).toEqual(['FIR'])
  expect((await store.projects.getProjectById('FIR')).repositories).toHaveLength(1)
  const second = await store.projects.createProject('SEC', 'Second', ['https://github.com/org/new'])
  expect(second.repositories).toHaveLength(1)
})

test('concurrent writes across independent handles preserve unique keys and origins', async () => {
  const first = await open()
  const second = await open()
  const results = await Promise.allSettled([
    first.projects.createProject('AAA', 'A', ['https://github.com/org/one']),
    second.projects.createProject('BBB', 'B', ['https://github.com/org/two']),
    first.projects.createProject('CCC', 'C', ['https://github.com/org/shared']),
    second.projects.createProject('DDD', 'D', ['git@github.com:org/shared.git']),
  ])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(3)
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
  expect(await first.projects.listProjects()).toHaveLength(3)
})

test('concurrent writes to one project key allow exactly one winner', async () => {
  const first = await open()
  const second = await open()
  const results = await Promise.allSettled([
    first.projects.createProject('SAME', 'First'),
    second.projects.createProject('SAME', 'Second'),
  ])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
  expect(await first.projects.listProjects()).toHaveLength(1)
})

test('concurrent writable opens migrate a new database only once', async () => {
  const [first, second] = await Promise.all([open(), open()])
  await first.projects.createProject('ONE', 'One')
  expect(await second.projects.getProjectById('ONE')).toEqual(
    await first.projects.getProjectById('ONE'),
  )
  const check = new Database(path, { readonly: true })
  expect(check.query('SELECT name FROM kysely_migration').all()).toEqual([{ name: '001_initial' }])
  check.close()
})

test('read-only open of missing database has no side effects', async () => {
  await expect(createDifflabDb(path, { readonly: true })).rejects.toBeInstanceOf(DifflabDbError)
  expect(await readdir(root)).toEqual([])
})

test('read-only open of older schema does not create migration tables or sidecars', async () => {
  const db = new Database(path)
  db.run('CREATE TABLE old_notes (message TEXT)')
  db.close()
  await expect(createDifflabDb(path, { readonly: true })).rejects.toThrow('not current')
  expect(await readdir(root)).toEqual(['projects.sqlite'])
  const check = new Database(path, { readonly: true })
  expect(check.query("SELECT name FROM sqlite_master WHERE type = 'table'").all()).toEqual([
    { name: 'old_notes' },
  ])
  check.close()
})

test('read-only open rejects a newer migration without modifying history', async () => {
  const writer = await open()
  await writer.close()
  const db = new Database(path)
  db.run(
    "INSERT INTO kysely_migration (name, timestamp) VALUES ('999_future', '2099-01-01T00:00:00Z')",
  )
  db.close()
  await expect(createDifflabDb(path, { readonly: true })).rejects.toThrow('not current')
  const check = new Database(path, { readonly: true })
  expect(check.query('SELECT name FROM kysely_migration ORDER BY name').all()).toEqual([
    { name: '001_initial' },
    { name: '999_future' },
  ])
  check.close()
  expect(await readdir(root)).toEqual(['projects.sqlite'])
})

test('read-only store can inspect but cannot modify data or create sidecars', async () => {
  const writer = await open()
  const project = await writer.projects.createProject('ONE', 'One')
  await writer.close()
  const reader = await createDifflabDb(path, { readonly: true })
  stores.push(reader)
  expect(await reader.projects.getProjectById('ONE')).toEqual(project)
  await expect(reader.projects.createProject('TWO', 'Two')).rejects.toBeInstanceOf(DifflabDbError)
  await expect(
    reader.repositories.linkRepositoryToProject('ONE', 'https://github.com/org/repo'),
  ).rejects.toBeInstanceOf(DifflabDbError)
  expect(await readdir(root)).toEqual(['projects.sqlite'])
})

test('validates project keys, names and GitHub origins', async () => {
  const store = await open()
  expect(validateProjectKey(' abc ')).toBe('ABC')
  expect(canonicalGitUrl('git@github.com:Org/Repo.git')).toBe('https://github.com/org/repo')
  expect(repositorySlug('https://github.com/Org/Repo')).toBe('github.com--org--repo')
  expect(() => validateProjectKey('a')).toThrow()
  expect(repositorySlug('https://gitlab.com/org/repo')).toBe('gitlab.com--org--repo')
  await expect(store.projects.createProject('BAD', '  ')).rejects.toBeInstanceOf(DifflabDbError)
  await expect(
    store.projects.createProject('DUP', 'Duplicate', [
      'https://github.com/org/repo',
      'git@github.com:org/repo.git',
    ]),
  ).rejects.toBeInstanceOf(ProjectConflictError)
  await expect(store.projects.getProjectById('BAD')).rejects.toBeInstanceOf(DifflabDbError)
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()))
  await rm(root, { recursive: true, force: true })
})

// Helpers ---------------------------------------------------------------------
async function open(): Promise<DifflabDb> {
  const store = await createDifflabDb(path)
  stores.push(store)
  return store
}
