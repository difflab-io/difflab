import { execFileSync } from 'node:child_process'
import { appendFile, readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { ProjectSetupError } from '../errors.js'

// Types -----------------------------------------------------------------------
/** Details discovered from a Git repository and its origin. */
export type GitRepository = { root: string; originUrl: string; excludePath: string }

// API -------------------------------------------------------------------------
/** Return the top-level working-tree directory for the repository containing cwd. */
export function gitRoot(cwd: string): string {
  return runGit(cwd, ['rev-parse', '--show-toplevel'])
}

/** Discover the repository root, raw origin URL, and worktree-specific exclude file. */
export function discoverGitRepository(cwd: string): GitRepository {
  const root = gitRoot(cwd)
  const originUrl = runGit(root, ['remote', 'get-url', 'origin'])
  const exclude = runGit(root, ['rev-parse', '--git-path', 'info/exclude'])
  return {
    root,
    originUrl,
    excludePath: isAbsolute(exclude) ? exclude : resolve(root, exclude),
  }
}

/** Append entry to a Git excludes file once, preserving its existing newline style. */
export async function addPathToGitExcludes(path: string, entry: string): Promise<void> {
  let existing = ''
  try {
    existing = await readFile(path, 'utf8')
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
  if (existing.split(/\r?\n/).includes(entry)) return
  const newline = existing.includes('\r\n') ? '\r\n' : '\n'
  await appendFile(
    path,
    `${existing && !existing.endsWith('\n') && !existing.endsWith('\r') ? newline : ''}${entry}${newline}`,
    {
      mode: 0o600,
    },
  )
}

// Helpers ---------------------------------------------------------------------
function runGit(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (error) {
    throw new ProjectSetupError(
      `Cannot inspect Git repository (${args.join(' ')}); run this from a Git repository with an origin`,
      { cause: error },
    )
  }
}
