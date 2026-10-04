import { afterEach, beforeEach, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { lstat, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { canonicalGithubUrl } from 'difflab-db'
import { discoverGitRepository } from './git.js'

// Setup -----------------------------------------------------------------------
let temp: string
let root: string
beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'difflab-git-'))
  root = join(temp, 'root')
  execFileSync('git', ['init', '-q', root])
})

// Tests -----------------------------------------------------------------------
test('normalizes HTTPS and scp-like SSH origins', () => {
  expect(canonicalGithubUrl('git@github.com:Org/Repo.git')).toBe('https://github.com/org/repo')
  expect(canonicalGithubUrl('ssh://git@github.com/Org/Repo.git')).toBe(
    'https://github.com/org/repo',
  )
  expect(canonicalGithubUrl('https://github.com/ORG/Repo.git')).toBe('https://github.com/org/repo')
  expect(() => canonicalGithubUrl('https://github.com.evil.test/org/repo')).toThrow()
})

test('rejects missing origin and resolves a Git worktree with a .git file', async () => {
  expect(() => discoverGitRepository(root)).toThrow('GitHub origin')
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
  expect(discovered.githubUrl).toBe('https://github.com/example/root')
  expect((await lstat(join(worktree, '.git'))).isFile()).toBe(true)
  const exclude = execFileSync('git', ['rev-parse', '--git-path', 'info/exclude'], {
    cwd: worktree,
    encoding: 'utf8',
  }).trim()
  expect(discovered.excludePath).toBe(resolve(discovered.root, exclude))
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await rm(temp, { recursive: true, force: true })
})
