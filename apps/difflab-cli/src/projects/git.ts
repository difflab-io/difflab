import { execFileSync } from 'node:child_process'
import { isAbsolute, resolve } from 'node:path'
import { canonicalGithubUrl, repositorySlug } from 'difflab-db'
import { ProjectSetupError } from '../errors.js'

// Types -----------------------------------------------------------------------
export type GitRepository = { root: string; githubUrl: string; slug: string; excludePath: string }

// API -------------------------------------------------------------------------
export function gitRoot(cwd: string): string {
  return git(cwd, ['rev-parse', '--show-toplevel'])
}

export function discoverGitRepository(cwd: string): GitRepository {
  const root = gitRoot(cwd)
  const origin = git(root, ['remote', 'get-url', 'origin'])
  let githubUrl: string
  try {
    githubUrl = canonicalGithubUrl(origin)
  } catch (error) {
    throw new ProjectSetupError('The Git origin must be a GitHub HTTPS or SSH repository URL', {
      cause: error,
    })
  }
  const exclude = git(root, ['rev-parse', '--git-path', 'info/exclude'])
  return {
    root,
    githubUrl,
    slug: repositorySlug(githubUrl),
    excludePath: isAbsolute(exclude) ? exclude : resolve(root, exclude),
  }
}

// Helpers ---------------------------------------------------------------------
function git(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (error) {
    throw new ProjectSetupError(
      `Cannot inspect Git repository (${args.join(' ')}); run this from a Git repository with a GitHub origin`,
      { cause: error },
    )
  }
}
