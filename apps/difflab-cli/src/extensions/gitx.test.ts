import { afterEach, beforeEach, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { lstat, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addPathToGitExcludes, discoverGitRepository } from './gitx.js'

// Setup -----------------------------------------------------------------------
let temp: string
let root: string
beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'difflab-git-'))
  root = join(temp, 'root')
  execFileSync('git', ['init', '-q', root])
})

// Tests -----------------------------------------------------------------------
test('rejects missing origin and resolves a Git worktree with a .git file', async () => {
  expect(() => discoverGitRepository(root)).toThrow('origin')
  execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/example/root.git'], {
    cwd: root,
  })
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
    { cwd: root },
  )
  const worktree = join(temp, 'worktree')
  execFileSync('git', ['worktree', 'add', '-q', '-b', 'side', worktree], { cwd: root })

  const discovered = discoverGitRepository(worktree)
  expect(discovered.root).toBe(await realpath(worktree))
  expect(discovered.originUrl).toBe('https://github.com/example/root.git')
  expect((await lstat(join(worktree, '.git'))).isFile()).toBe(true)
  const exclude = execFileSync('git', ['rev-parse', '--git-path', 'info/exclude'], {
    cwd: worktree,
    encoding: 'utf8',
  }).trim()
  expect(discovered.excludePath).toBe(exclude)
  expect(discovered.excludePath).toBe(await realpath(join(root, '.git', 'info', 'exclude')))
})

test('adds an exclude entry once without changing existing newline handling', async () => {
  const exclude = join(temp, 'exclude')
  await writeFile(exclude, 'first\r\n')
  await addPathToGitExcludes(exclude, '/.difflab')
  await addPathToGitExcludes(exclude, '/.difflab')
  expect(await readFile(exclude, 'utf8')).toBe('first\r\n/.difflab\r\n')
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await rm(temp, { recursive: true, force: true })
})
