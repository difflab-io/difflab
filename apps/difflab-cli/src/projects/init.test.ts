import { afterEach, beforeEach, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { readProjectContext } from './context.js'
import { discoverGitRepository } from '../extensions/gitx.js'
import { createUserStore, userPaths } from '../store/user-store.js'
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
test('initializes a repository and repeats without duplicate rows or excludes', async () => {
  // Arrange
  const project = await createProject('TEA', 'Team Tools')

  // Act
  const first = await initializeRepository({ cwd: repo, home, projectId: project.id })
  const second = await initializeRepository({ cwd: repo, home, projectId: project.id })

  // Assert
  expect(second).toEqual(first)
  expect(first.repository.github).toBe('https://github.com/example/first')
  expect(await readFile(join(repo, 'difflab.yaml'), 'utf8')).toContain(`id: ${project.id}`)
  expect((await lstat(join(repo, '.difflab'))).isSymbolicLink()).toBe(true)
  expect(
    (await readFile(discoverGitRepository(repo).excludePath, 'utf8')).split('/.difflab').length - 1,
  ).toBe(1)
  expect(
    execFileSync('git', ['check-ignore', '.difflab'], { cwd: repo, encoding: 'utf8' }).trim(),
  ).toBe('.difflab')
  expect((await createUserStore(home).listProjects())[0]?.repositories).toHaveLength(1)
})

test('projects and repositories share one user database with separate artifact directories', async () => {
  // Arrange
  const first = await createProject('ONE', 'One')
  const second = await createProject('TWO', 'Two')
  const other = join(temp, 'other')
  const separate = join(temp, 'separate')
  await makeRepo(other, 'https://github.com/example/second')
  await makeRepo(separate, 'https://github.com/example/third')

  // Act
  await initializeRepository({ cwd: repo, home, projectId: first.id })
  await initializeRepository({ cwd: other, home, projectId: first.id })
  await initializeRepository({ cwd: separate, home, projectId: second.id })

  // Assert
  expect(
    (await createUserStore(home).listProjects()).find((item) => item.id === first.id)?.repositories,
  ).toHaveLength(2)
  expect((await readProjectContext(other, home)).project.id).toBe(first.id)
  expect((await readProjectContext(separate, home)).project.id).toBe(second.id)
  expect((await readdir(userPaths(home).root)).filter((file) => file.endsWith('.sqlite'))).toEqual([
    'difflab.sqlite',
  ])
  expect(await readlink(join(repo, '.difflab'))).toBe(
    join(userPaths(home).projects, first.id, 'example--first'),
  )
  expect(await readlink(join(other, '.difflab'))).toBe(
    join(userPaths(home).projects, first.id, 'example--second'),
  )
})

test('two worktrees for the same origin can both initialize and resolve context', async () => {
  // Arrange
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'start',
    ],
    { cwd: repo },
  )
  const worktree = join(temp, 'worktree')
  execFileSync('git', ['worktree', 'add', '-q', '-b', 'side', worktree], { cwd: repo })
  const project = await createProject('WOR', 'Worktrees')

  // Act
  const original = await initializeRepository({ cwd: repo, home, projectId: project.id })
  const second = await initializeRepository({ cwd: worktree, home, projectId: project.id })

  // Assert
  expect(second.repository.id).toBe(original.repository.id)
  expect(second.repository.localPath).toBe(await realpath(worktree))
  expect((await readProjectContext(worktree, home)).root).toBe(await realpath(worktree))
  expect((await createUserStore(home).listProjects())[0]?.repositories).toHaveLength(1)
  expect(
    execFileSync('git', ['check-ignore', '.difflab'], { cwd: worktree, encoding: 'utf8' }).trim(),
  ).toBe('.difflab')
})

test('invalid origin and conflicting config fail before registration', async () => {
  // Arrange
  const project = await createProject('INV', 'Invalid')
  execFileSync('git', ['remote', 'set-url', 'origin', 'https://gitlab.com/example/first'], {
    cwd: repo,
  })

  // Act / Assert
  await expect(initializeRepository({ cwd: repo, home, projectId: project.id })).rejects.toThrow(
    'GitHub',
  )
  execFileSync('git', ['remote', 'set-url', 'origin', 'https://github.com/example/first'], {
    cwd: repo,
  })
  await writeFile(join(repo, 'difflab.yaml'), 'user data')
  await expect(initializeRepository({ cwd: repo, home, projectId: project.id })).rejects.toThrow(
    'Invalid difflab.yaml',
  )
  expect(await readFile(join(repo, 'difflab.yaml'), 'utf8')).toBe('user data')
  expect((await createUserStore(home).listProjects())[0]?.repositories).toHaveLength(0)
})

test('an existing config for another project rejects init without changing its assignment', async () => {
  // Arrange
  const project = await createProject('ONE', 'One')
  const other = await createProject('TWO', 'Two')
  await initializeRepository({ cwd: repo, home, projectId: project.id })

  // Act / Assert
  await expect(initializeRepository({ cwd: repo, home, projectId: other.id })).rejects.toThrow(
    'already belongs',
  )
  expect((await readProjectContext(repo, home)).project.id).toBe(project.id)
})

test('resumes partial links, preserving artifacts and accepting a relative link', async () => {
  // Arrange
  const project = await createProject('PAR', 'Partial')
  const target = join(userPaths(home).projects, project.id, 'example--first')
  await mkdir(target, { recursive: true })
  await writeFile(join(target, 'keep.txt'), 'user data')
  await symlink(relative(await realpath(repo), target), join(repo, '.difflab'))

  // Act
  const context = await initializeRepository({ cwd: repo, home, projectId: project.id })

  // Assert
  expect(context.repository.github).toBe('https://github.com/example/first')
  expect(await readFile(join(target, 'keep.txt'), 'utf8')).toBe('user data')
  expect((await createUserStore(home).listProjects())[0]?.repositories).toHaveLength(1)
})

test('rejects wrong symlinks and artifact files before linking a repository', async () => {
  // Arrange
  const project = await createProject('FIL', 'File')
  await symlink(join(temp, 'wrong'), join(repo, '.difflab'))

  // Act / Assert
  await expect(initializeRepository({ cwd: repo, home, projectId: project.id })).rejects.toThrow(
    'links elsewhere',
  )
  expect((await createUserStore(home).listProjects())[0]?.repositories).toHaveLength(0)
  await rm(join(repo, '.difflab'))
  await writeFile(join(repo, '.difflab'), 'private')
  await expect(initializeRepository({ cwd: repo, home, projectId: project.id })).rejects.toThrow(
    'Refusing to replace',
  )
  expect(await readFile(join(repo, '.difflab'), 'utf8')).toBe('private')
  expect((await createUserStore(home).listProjects())[0]?.repositories).toHaveLength(0)
})

test('a conflicting artifact target fails before DB mutation and can be retried safely', async () => {
  // Arrange
  const project = await createProject('ART', 'Artifacts')
  const target = join(userPaths(home).projects, project.id, 'example--first')
  await mkdir(join(userPaths(home).projects, project.id))
  await writeFile(target, 'do not replace')

  // Act / Assert
  await expect(initializeRepository({ cwd: repo, home, projectId: project.id })).rejects.toThrow(
    'non-directory',
  )
  expect(await readFile(target, 'utf8')).toBe('do not replace')
  expect((await createUserStore(home).listProjects())[0]?.repositories).toHaveLength(0)
  await rm(target)
  const context = await initializeRepository({ cwd: repo, home, projectId: project.id })
  expect(context.project.id).toBe(project.id)
  expect((await createUserStore(home).listProjects())[0]?.repositories).toHaveLength(1)
})

test('missing config on read never creates a user store', async () => {
  // Arrange
  const absentHome = join(temp, 'absent')

  // Act / Assert
  await expect(readProjectContext(repo, absentHome)).rejects.toThrow('Missing difflab.yaml')
  expect(await createUserStore(absentHome).listProjects()).toEqual([])
  await expect(lstat(absentHome)).rejects.toMatchObject({ code: 'ENOENT' })
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await rm(temp, { recursive: true, force: true })
})

// Helpers ---------------------------------------------------------------------
function createProject(key: string, name: string) {
  return createUserStore(home).createProject(key, name)
}
async function makeRepo(path: string, origin: string): Promise<void> {
  await mkdir(path)
  execFileSync('git', ['init', '-q', path])
  execFileSync('git', ['remote', 'add', 'origin', origin], { cwd: path })
}
