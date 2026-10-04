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
  const first = await createProject('Design Tools', home)
  const second = await createProject('Planning', home)
  const path = databasePath(first.slug, home)

  expect(first.slug).toBe('design-tools')
  expect((await stat(path)).isFile()).toBe(true)
  expect((await listProjects(home)).map((project) => project.id)).toEqual([first.id, second.id])
  expect(await getProjectById(first.id, home)).toEqual(first)
  expect((await readdir(join(home, '.difflab', 'projects'))).sort()).toEqual([
    'design-tools',
    'planning',
  ])
})

test('enforces a single project metadata row in SQLite', async () => {
  const project = await createProject('Only One', home)
  const database = new Database(databasePath(project.slug, home))
  try {
    expect(() =>
      database
        .query('INSERT INTO project_info (id, name, slug) VALUES (?, ?, ?)')
        .run(crypto.randomUUID(), 'Two', 'two'),
    ).toThrow()
  } finally {
    database.close()
  }
})

test('rejects duplicate project slugs without replacing the first project', async () => {
  const first = await createProject('My Project', home)
  await expect(createProject('my-project', home)).rejects.toBeInstanceOf(ProjectConflictError)
  expect((await listProjects(home))[0]?.id).toBe(first.id)
})

test('links a canonical repository once and rejects reassignment to a second project', async () => {
  const first = await createProject('First', home)
  const second = await createProject('Second', home)
  const repo = await linkRepository(first.id, 'git@github.com:Example/Library.git', home)

  expect(repo.githubUrl).toBe('https://github.com/example/library')
  expect(repo.slug).toBe('example--library')
  expect(await linkRepository(first.id, 'https://github.com/example/library', home)).toEqual(repo)
  await expect(linkRepository(second.id, repo.githubUrl, home)).rejects.toBeInstanceOf(
    ProjectConflictError,
  )
  expect((await inspectProject(first.slug, home)).repositories).toEqual([repo])
})

test('rejects unsupported Git remotes', () => {
  expect(() => repositorySlug('https://gitlab.com/example/repo')).toThrow()
  expect(() => repositorySlug('https://github.com/example/repo?token=secret')).toThrow()
  expect(() => repositorySlug('file:///tmp/repo')).toThrow()
})

test('read-only inspection rejects a forward schema and never migrates it', async () => {
  const project = await createProject('Future', home)
  const db = new Database(databasePath(project.slug, home))
  db.run('PRAGMA user_version = 999')
  db.close()

  await expect(inspectProject(project.slug, home)).rejects.toThrow('not current')
  const reopened = new Database(databasePath(project.slug, home), { readonly: true })
  expect(
    (reopened.query('PRAGMA user_version').get() as { user_version: number }).user_version,
  ).toBe(999)
  reopened.close()
})

test('concurrent project creation serializes discovery', async () => {
  const projects = await Promise.all(['A', 'B', 'C', 'D'].map((name) => createProject(name, home)))
  expect(new Set(projects.map((project) => project.id)).size).toBe(4)
  expect((await listProjects(home)).length).toBe(4)
})

test('refuses to replace an unrelated project-directory symlink', async () => {
  await listProjects(home)
  const path = join(home, '.difflab', 'projects', 'unsafe')
  await symlink(home, path)

  await expect(createProject('Unsafe', home)).rejects.toBeInstanceOf(ProjectConflictError)
  expect((await lstat(path)).isSymbolicLink()).toBe(true)
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})
