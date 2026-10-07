import { afterEach, beforeEach, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  realpath,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProgram } from './cli.js'
import { readProjectContext } from './context.js'
import { discoverGitRepository } from 'utils/gitx'
import { createUserStore, userPaths } from './store/user-store.js'
import { TemplateService } from './templates/service.js'

let temp: string
let home: string
let repo: string
beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'difflab-init-'))
  home = join(temp, 'home')
  await mkdir(home)
  repo = join(temp, 'repo')
  await makeRepo(repo, 'https://github.com/example/first')
})
afterEach(async () => rm(temp, { recursive: true, force: true }))

async function runInit(cwd = repo, project = 'TEA') {
  return createProgram(() => {}, 'test', { cwd, home }).parseAsync([
    'node',
    'difflab',
    'init',
    project,
  ])
}
async function addProject(
  id = 'TEA',
  withRepo = true,
  origin = 'https://github.com/example/first',
) {
  await createProgram(() => {}, 'test', { home }).parseAsync([
    'node',
    'difflab',
    'project',
    'add',
    id,
    '--name',
    id,
    ...(withRepo ? ['--repo', origin] : []),
  ])
}
async function makeRepo(path: string, origin: string) {
  await mkdir(path, { recursive: true })
  execFileSync('git', ['init', '-q'], { cwd: path })
  execFileSync('git', ['remote', 'add', 'origin', origin], { cwd: path })
}

test('missing project key creates no config or project artifact directory', async () => {
  // Arrange
  // Act
  await expect(runInit(repo, 'MISSING')).rejects.toThrow()
  // Assert
  expect(await lstat(join(repo, '.difflab')).catch(() => null)).toBeNull()
  expect(await lstat(join(repo, 'difflab.yaml')).catch(() => null)).toBeNull()
  expect(await lstat(join(userPaths(home).projects, 'MISSING')).catch(() => null)).toBeNull()
})

test('idempotent init creates one exclude and one linked repository', async () => {
  // Arrange
  await addProject()
  // Act
  await runInit()
  await runInit()
  // Assert
  expect((await lstat(join(repo, '.difflab'))).isSymbolicLink()).toBe(true)
  expect(
    (await readFile(discoverGitRepository(repo).excludePath, 'utf8')).match(/\/\.difflab/g),
  ).toHaveLength(1)
  expect((await createUserStore(home).listProjects())[0]?.repositories).toHaveLength(1)
})

test('malformed config is rejected without changing the repository or store', async () => {
  // Arrange
  await writeFile(join(repo, 'difflab.yaml'), ': invalid')
  // Act
  await expect(runInit()).rejects.toThrow('Invalid difflab.yaml')
  // Assert
  expect(await readFile(join(repo, 'difflab.yaml'), 'utf8')).toBe(': invalid')
  expect(await lstat(join(repo, '.difflab')).catch(() => null)).toBeNull()
  expect(await lstat(userPaths(home).root).catch(() => null)).toBeNull()
})

test('wrong .difflab symlink is rejected before DB linking', async () => {
  // Arrange
  await addProject()
  const before = (await createUserStore(home).listProjects())[0]?.repositories
  await symlink(join(temp, 'wrong'), join(repo, '.difflab'))
  // Act
  await expect(runInit()).rejects.toThrow('links elsewhere')
  // Assert
  expect((await createUserStore(home).listProjects())[0]?.repositories).toEqual(before)
})

test('non-directory artifact and target paths can be fixed and retried without duplicate rows', async () => {
  // Arrange
  await addProject()
  const before = (await createUserStore(home).listProjects())[0]?.repositories
  const artifact = join(userPaths(home).projects, 'TEA', 'github.com--example--first')
  await mkdir(join(userPaths(home).projects, 'TEA'), { recursive: true })
  await writeFile(artifact, 'private')
  // Act / Assert
  await expect(runInit()).rejects.toThrow('Refusing existing target')
  expect((await createUserStore(home).listProjects())[0]?.repositories).toEqual(before)
  await rm(artifact)
  await writeFile(join(repo, '.difflab'), 'private')
  await expect(runInit()).rejects.toThrow('Refusing')
  expect((await createUserStore(home).listProjects())[0]?.repositories).toEqual(before)
  await rm(join(repo, '.difflab'))
  await runInit()
  // Assert
  expect((await createUserStore(home).listProjects())[0]?.repositories).toHaveLength(1)
})

test('two worktrees share one repository row and keep local context roots', async () => {
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
  const excludePath = execFileSync('git', ['rev-parse', '--git-path', 'info/exclude'], {
    cwd: worktree,
    encoding: 'utf8',
  }).trim()
  expect(excludePath).toBe(await realpath(join(repo, '.git', 'info', 'exclude')))
  await addProject()
  // Act
  const first = await runInit(repo)
  const second = await runInit(worktree)
  await createProgram(() => {}, 'test', {
    home,
    cwd: worktree,
    templateService: new TemplateService({ home }),
  }).parseAsync([
    'node',
    'difflab',
    'templates',
    'scaffold',
    'spec-driven-plan',
    '.difflab/plans/261005-worktree',
    'PLAN.md',
    '--cwd',
    worktree,
  ])
  // Assert
  expect(second).toBeDefined()
  expect(
    await readFile(join(worktree, '.difflab/plans/261005-worktree/PLAN.md'), 'utf8'),
  ).toContain('## Phases')
  expect((await createUserStore(home).listProjects())[0]?.repositories).toHaveLength(1)
  expect((await readProjectContext(worktree, home)).repository.localPath).toBe(
    await realpath(worktree),
  )
  expect((await lstat(join(worktree, '.difflab'))).isSymbolicLink()).toBe(true)
  expect(await readFile(excludePath, 'utf8')).toContain('/.difflab')
  expect(
    execFileSync('git', ['check-ignore', '.difflab'], { cwd: worktree, encoding: 'utf8' }).trim(),
  ).toBe('.difflab')
  expect(first).toBeDefined()
})

test('two projects use separate artifact directories in one database', async () => {
  // Arrange
  await addProject('ONE')
  await addProject('TWO', true, 'https://github.com/example/second')
  const other = join(temp, 'other')
  await makeRepo(other, 'https://github.com/example/second')
  // Act
  await runInit(repo, 'ONE')
  await runInit(other, 'TWO')
  // Assert
  const projects = await createUserStore(home).listProjects()
  expect(projects.find((p) => p.id === 'ONE')?.repositories).toHaveLength(1)
  expect(projects.find((p) => p.id === 'TWO')?.repositories).toHaveLength(1)
  expect(await readlink(join(repo, '.difflab'))).not.toBe(await readlink(join(other, '.difflab')))
  expect((await readdir(userPaths(home).root)).filter((file) => file.endsWith('.sqlite'))).toEqual([
    'difflab.sqlite',
  ])
})
