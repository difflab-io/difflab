import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  addPathToGitExcludes,
  canonicalGitUrl,
  discoverGitRepository,
  repositorySlug,
} from './gitx.js'

// Setup -----------------------------------------------------------------------
let tempRoot: string

beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), 'gitx-test-'))
})

// Tests -----------------------------------------------------------------------
describe('Git URL normalization', () => {
  test('treats GitHub HTTPS, scp, and SSH URLs as equivalent', () => {
    // Arrange
    const urls = [
      'https://github.com/Org/Repo.git',
      'git@github.com:Org/Repo.git',
      'ssh://git@github.com/Org/Repo.git',
    ]

    // Act
    const canonical = urls.map(canonicalGitUrl)

    // Assert
    expect(canonical).toEqual([
      'https://github.com/org/repo',
      'https://github.com/org/repo',
      'https://github.com/org/repo',
    ])
  })

  test('supports GitLab nested groups and generic hosts', () => {
    // Arrange
    const nested = 'ssh://git@gitlab.com/group/sub/repo.git'
    const generic = 'https://Git.example.test/Team/Repo.git'

    // Act
    const values = [canonicalGitUrl(nested), canonicalGitUrl(generic)]

    // Assert
    expect(values).toEqual([
      'https://gitlab.com/group/sub/repo',
      'https://git.example.test/team/repo',
    ])
  })

  test('creates stable repository slugs', () => {
    // Arrange
    const url = 'https://github.com/Org/Repo.git'

    // Act
    const slug = repositorySlug(url)

    // Assert
    expect(slug).toBe('github.com--org--repo')
    expect(repositorySlug('https://gitlab.com/group/sub/repo')).toBe('gitlab.com--group--sub--repo')
  })

  test('rejects unsupported URL forms and path traversal', () => {
    // Arrange
    const invalid = [
      'file:///tmp/repo',
      'ftp://github.com/org/repo',
      'https://github.com:444/org/repo',
      'https://user@github.com/org/repo',
      'https://user:pass@github.com/org/repo',
      'ssh://deploy@github.com/org/repo',
      'https://github.com/org/repo?x=1',
      'https://github.com/org/repo#x',
      'https://github.com/org/../repo',
      'https://github.com/org/%2e%2e/repo',
      'https://github.com/org/%2E/repo',
      'https://github.com',
      'https://:444/org/repo',
      'https://github.com/',
      'not-a-url',
    ]

    // Act / Assert
    for (const value of invalid) expect(() => canonicalGitUrl(value)).toThrow()
  })
})

describe('Git repository discovery', () => {
  test('rejects a repository without an origin remote', () => {
    // Arrange
    runGit(tempRoot, ['init'])

    // Act / Assert
    expect(() => discoverGitRepository(tempRoot)).toThrow()
  })

  test('returns the canonical root, raw origin, and worktree exclude path', async () => {
    // Arrange
    const worktree = join(tempRoot, 'worktree')
    runGit(tempRoot, ['init', '-b', 'main'])
    runGit(tempRoot, ['config', 'user.email', 'test@example.com'])
    runGit(tempRoot, ['config', 'user.name', 'Test'])
    await writeFile(join(tempRoot, 'file'), 'content')
    runGit(tempRoot, ['add', 'file'])
    runGit(tempRoot, ['commit', '-m', 'initial'])
    runGit(tempRoot, ['remote', 'add', 'origin', 'git@github.com:Org/Repo.git'])
    runGit(tempRoot, ['worktree', 'add', worktree, '-b', 'feature'])

    // Act
    const repository = discoverGitRepository(worktree)

    // Assert
    expect(repository.root).toBe(runGit(worktree, ['rev-parse', '--show-toplevel']))
    expect(repository.originUrl).toBe('https://github.com/Org/Repo.git')
    expect(repository.excludePath).toContain(join('.git', 'worktrees'))
    expect(repository.excludePath).toContain(join('info', 'exclude'))
  })
})

describe('Git excludes', () => {
  test('appends an entry once and preserves CRLF', async () => {
    // Arrange
    const excludes = join(tempRoot, 'exclude')
    await writeFile(excludes, 'first\r\nexisting\r\n')

    // Act
    await addPathToGitExcludes(excludes, 'new-entry')
    await addPathToGitExcludes(excludes, 'new-entry')

    // Assert
    expect(await readFile(excludes, 'utf8')).toBe('first\r\nexisting\r\nnew-entry\r\n')
  })
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true })
})

// Helpers ---------------------------------------------------------------------
function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}
