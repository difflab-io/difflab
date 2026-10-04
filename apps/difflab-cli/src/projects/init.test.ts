import { afterEach, beforeEach, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createProject,
  databasePath,
  linkRepository,
  listProjects,
  projectDirectory,
} from 'difflab-db'
import { readProjectContext } from './context.js'
import { discoverGitRepository } from './git.js'
import { initializeRepository } from './init.js'

// Setup -----------------------------------------------------------------------
let temp: string
let home: string
let repo: string
beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'difflab-init-'))
  home = join(temp, 'home')
  await mkdir(home)
  repo = join(temp, 'repo')
  await makeRepo(repo, 'git@github.com:Example/First.git')
})

// Tests -----------------------------------------------------------------------
test('initializes a repository, tracks only manifest, and repeats without duplicate rows or excludes', async () => {
  const project = await createProject('Team Tools', home)
  const first = await initializeRepository({ cwd: repo, home, projectId: project.id })
  const second = await initializeRepository({ cwd: repo, home, projectId: project.id })

  expect(second).toEqual(first)
  expect(first.project.id).toBe(project.id)
  expect(first.repository.github).toBe('https://github.com/example/first')
  expect(await readFile(join(repo, 'difflab.yaml'), 'utf8')).toContain(`id: ${project.id}`)
  expect((await lstat(join(repo, '.difflab'))).isSymbolicLink()).toBe(true)
  expect(
    (await readFile(discoverGitRepository(repo).excludePath, 'utf8')).split('/.difflab').length - 1,
  ).toBe(1)
  expect(
    execFileSync('git', ['check-ignore', '.difflab'], { cwd: repo, encoding: 'utf8' }).trim(),
  ).toBe('.difflab')
  expect((await listProjects(home))[0]?.repositories).toHaveLength(1)
})

test('two repositories share one database and a second project has its own database', async () => {
  const first = await createProject('One', home)
  const second = await createProject('Two', home)
  const other = join(temp, 'other')
  const separate = join(temp, 'separate')
  await makeRepo(other, 'https://github.com/example/second')
  await makeRepo(separate, 'https://github.com/example/third')

  await initializeRepository({ cwd: repo, home, projectId: first.id })
  await initializeRepository({ cwd: other, home, projectId: first.id })
  await initializeRepository({ cwd: separate, home, projectId: second.id })

  expect(
    (await listProjects(home)).find((item) => item.id === first.id)?.repositories,
  ).toHaveLength(2)
  expect((await readProjectContext(other, home)).project.id).toBe(first.id)
  expect((await readProjectContext(separate, home)).project.id).toBe(second.id)
  expect(databasePath(first.slug, home)).not.toBe(databasePath(second.slug, home))
})

test('an invalid origin or conflicting local file leaves no new project', async () => {
  execFileSync('git', ['remote', 'set-url', 'origin', 'https://gitlab.com/example/first'], {
    cwd: repo,
  })
  await expect(initializeRepository({ cwd: repo, home, newProject: 'Unused' })).rejects.toThrow(
    'GitHub',
  )
  expect(await listProjects(home)).toEqual([])
  execFileSync('git', ['remote', 'set-url', 'origin', 'https://github.com/example/first'], {
    cwd: repo,
  })
  await writeFile(join(repo, 'difflab.yaml'), 'user data')
  await expect(initializeRepository({ cwd: repo, home, newProject: 'Unused' })).rejects.toThrow(
    'Invalid difflab.yaml',
  )
  expect(await readFile(join(repo, 'difflab.yaml'), 'utf8')).toBe('user data')
  expect(await listProjects(home)).toEqual([])
})

test('read-only context does not initialize missing home, and mismatches never reassign', async () => {
  await expect(readProjectContext(repo, home)).rejects.toThrow('Missing difflab.yaml')
  const project = await createProject('One', home)
  const other = await createProject('Two', home)
  await initializeRepository({ cwd: repo, home, projectId: project.id })
  await expect(initializeRepository({ cwd: repo, home, projectId: other.id })).rejects.toThrow(
    'already belongs',
  )
  expect((await readProjectContext(repo, home)).project.id).toBe(project.id)
})

test('a repository assigned to another project does not leave an orphan new project', async () => {
  const first = await createProject('First', home)
  await initializeRepository({ cwd: repo, home, projectId: first.id })
  const copy = join(temp, 'copy')
  await makeRepo(copy, 'https://github.com/example/first')

  await expect(initializeRepository({ cwd: copy, home, newProject: 'Orphan' })).rejects.toThrow(
    'already belongs',
  )
  expect((await listProjects(home)).map((project) => project.name)).toEqual(['First'])
})

test('resumes a matching partial link without replacing local data', async () => {
  const project = await createProject('Partial', home)
  const registered = await linkRepository(project.id, 'https://github.com/example/first', home)
  const target = join(projectDirectory(project.slug, home), registered.slug)
  await mkdir(target)
  await writeFile(join(target, 'keep.txt'), 'user data')
  await symlink(target, join(repo, '.difflab'))

  const context = await initializeRepository({ cwd: repo, home, projectId: project.id })

  expect(context.repository.id).toBe(registered.id)
  expect(await readFile(join(target, 'keep.txt'), 'utf8')).toBe('user data')
  expect((await listProjects(home))[0]?.repositories).toHaveLength(1)
})

test('never overwrites a pre-existing .difflab file', async () => {
  await writeFile(join(repo, '.difflab'), 'private')
  await expect(initializeRepository({ cwd: repo, home, newProject: 'Unused' })).rejects.toThrow(
    'Refusing to replace',
  )
  expect(await readFile(join(repo, '.difflab'), 'utf8')).toBe('private')
  expect(await listProjects(home)).toEqual([])
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await rm(temp, { recursive: true, force: true })
})

// Helpers ---------------------------------------------------------------------
async function makeRepo(path: string, origin: string): Promise<void> {
  await Bun.write(join(path, '.keep'), '')
  execFileSync('git', ['init', '-q', path])
  execFileSync('git', ['remote', 'add', 'origin', origin], { cwd: path })
}
