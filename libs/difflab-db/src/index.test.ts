import { afterEach, beforeEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { lstat, mkdtemp, readdir, rm, stat, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createProject,
  databasePath,
  getProjectById,
  inspectProject,
  linkRepository,
  listProjects,
  ProjectConflictError,
  repositorySlug,
} from './index.js'

// Setup -----------------------------------------------------------------------
let home: string
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'difflab-db-'))
})

// Tests -----------------------------------------------------------------------
test('creates one SQLite database per project and discovers metadata after reopening', async () => {
  const first = await createProject('DES', 'Design Tools', home)
  const second = await createProject('PLA', 'Planning', home)
  const path = databasePath(first.id, home)

  expect(first.id).toBe('DES')
  expect((await stat(path)).isFile()).toBe(true)
  expect((await listProjects(home)).map((project) => project.id)).toEqual([first.id, second.id])
  expect(await getProjectById(first.id, home)).toEqual(first)
  expect((await readdir(join(home, '.difflab', 'projects'))).sort()).toEqual(['DES', 'PLA'])
})

test('enforces a single project metadata row in SQLite', async () => {
  const project = await createProject('ONL', 'Only One', home)
  const database = new Database(databasePath(project.id, home))
  try {
    expect(() =>
      database
        .query('INSERT INTO project_info (id, name) VALUES (?, ?)')
        .run(crypto.randomUUID(), 'Two'),
    ).toThrow()
  } finally {
    database.close()
  }
})

test('rejects a blank project name without creating a project', async () => {
  await expect(createProject('BLK', '   ', home)).rejects.toThrow(
    'Project name must be nonempty and at most 100 characters',
  )
  expect(await listProjects(home)).toEqual([])
})

test('rejects duplicate project keys without replacing the first project', async () => {
  const first = await createProject('MYA', 'My Project', home)
  await expect(createProject('MYA', 'my-project', home)).rejects.toBeInstanceOf(
    ProjectConflictError,
  )
  expect((await listProjects(home))[0]?.id).toBe(first.id)
})

test('rejects a conflicting later origin without creating an orphan project', async () => {
  const first = await createProject('FIR', 'First', home, ['https://github.com/example/first'])

  await expect(
    createProject('SEC', 'Second', home, [
      'https://github.com/example/new',
      'https://github.com/example/first',
    ]),
  ).rejects.toBeInstanceOf(ProjectConflictError)

  expect(await listProjects(home)).toEqual([first])
  await expect(stat(join(home, '.difflab', 'projects', 'SEC'))).rejects.toThrow()
})

test('links a canonical repository once and rejects reassignment to a second project', async () => {
  const first = await createProject('FIR', 'First', home)
  const second = await createProject('SEC', 'Second', home)
  const repo = await linkRepository(first.id, 'git@github.com:Example/Library.git', home)

  expect(repo.githubUrl).toBe('https://github.com/example/library')
  expect(repo.id).toEqual(expect.any(String))
  expect(await linkRepository(first.id, 'https://github.com/example/library', home)).toEqual(repo)
  await expect(linkRepository(second.id, repo.githubUrl, home)).rejects.toBeInstanceOf(
    ProjectConflictError,
  )
  expect((await inspectProject(first.id, home)).repositories).toEqual([repo])
})

test('rejects unsupported Git remotes', () => {
  expect(() => repositorySlug('https://gitlab.com/example/repo')).toThrow()
  expect(() => repositorySlug('https://github.com/example/repo?token=secret')).toThrow()
  expect(() => repositorySlug('file:///tmp/repo')).toThrow()
})

test('read-only inspection rejects a forward schema and never migrates it', async () => {
  const project = await createProject('FUT', 'Future', home)
  const db = new Database(databasePath(project.id, home))
  db.run('PRAGMA user_version = 999')
  db.close()

  await expect(inspectProject(project.id, home)).rejects.toThrow('not current')
  const reopened = new Database(databasePath(project.id, home), { readonly: true })
  expect(
    (reopened.query('PRAGMA user_version').get() as { user_version: number }).user_version,
  ).toBe(999)
  reopened.close()
})

test('concurrent project creation serializes discovery', async () => {
  const projects = await Promise.all(
    ['AAA', 'BBB', 'CCC', 'DDD'].map((key) => createProject(key, key, home)),
  )
  expect(new Set(projects.map((project) => project.id)).size).toBe(4)
  expect((await listProjects(home)).length).toBe(4)
})

test('refuses to replace an unrelated project-directory symlink', async () => {
  await listProjects(home)
  const path = join(home, '.difflab', 'projects', 'UNS')
  await symlink(home, path)

  await expect(createProject('UNS', 'Unsafe', home)).rejects.toBeInstanceOf(ProjectConflictError)
  expect((await lstat(path)).isSymbolicLink()).toBe(true)
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})
