import { execFileSync } from 'node:child_process'
import { appendFile, readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'

// Constants -------------------------------------------------------------------
const GIT_PROTOCOLS = new Set(['https:', 'ssh:'])

// Types -----------------------------------------------------------------------
/** A Git repository's local root, origin, and exclude file. */
export type GitRepository = { root: string; originUrl: string; excludePath: string }

/** An error raised when Git metadata cannot be inspected or is invalid. */
export class GitInspectionError extends Error {
  /** Creates a Git inspection error with an optional underlying cause. */
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'GitInspectionError'
  }
}

// API -------------------------------------------------------------------------
/** Returns the absolute top-level directory of the Git repository containing cwd. */
export function gitRoot(cwd: string): string {
  return runGit(cwd, ['rev-parse', '--show-toplevel'])
}

/** Discovers the repository metadata needed by project integrations. */
export function discoverGitRepository(cwd: string): GitRepository {
  const root = gitRoot(cwd)
  const exclude = runGit(root, ['rev-parse', '--git-path', 'info/exclude'])
  return {
    root,
    originUrl: runGit(root, ['remote', 'get-url', 'origin']),
    excludePath: isAbsolute(exclude) ? exclude : resolve(root, exclude),
  }
}

/** Adds an entry to a Git excludes file once, preserving its newline style. */
export async function addPathToGitExcludes(path: string, entry: string): Promise<void> {
  let existing = ''
  try {
    existing = await readFile(path, 'utf8')
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
  if (existing.split(/\r?\n/).includes(entry)) return
  const newline = existing.includes('\r\n') ? '\r\n' : '\n'
  const separator = existing && !existing.endsWith('\n') && !existing.endsWith('\r') ? newline : ''
  await appendFile(path, `${separator}${entry}${newline}`, { mode: 0o600 })
}

/** Normalizes a supported Git remote to a lowercase, credential-free HTTPS URL. */
export function canonicalGitUrl(value: string): string {
  const raw = value.trim()
  if (
    !raw ||
    /[?#]/.test(raw) ||
    raw.split('/').some((segment) => segment === '.' || segment === '..') ||
    /%2e/i.test(raw)
  )
    throw unsupportedOrigin(value)

  let input = raw
  if (raw.startsWith('git@')) {
    const match = /^git@([^/:?#]+):(.+)$/.exec(raw)
    if (!match) throw unsupportedOrigin(value)
    input = `ssh://git@${match[1]}/${match[2]}`
  }

  let parsed: URL
  try {
    parsed = new URL(input)
  } catch (error) {
    throw new GitInspectionError(`Git origin is not a valid URL: ${value}`, { cause: error })
  }

  if (!GIT_PROTOCOLS.has(parsed.protocol) || parsed.search || parsed.hash || parsed.port)
    throw unsupportedOrigin(value)
  if (parsed.protocol === 'https:' && parsed.username) throw unsupportedOrigin(value)
  if (parsed.protocol === 'ssh:' && parsed.username !== 'git') throw unsupportedOrigin(value)
  if (parsed.password || !parsed.hostname || !parsed.pathname || parsed.pathname === '/')
    throw unsupportedOrigin(value)

  const rawPathParts = parsed.pathname.slice(1).split('/')
  if (rawPathParts.some((part) => part === '.' || part === '..' || !part))
    throw unsupportedOrigin(value)
  const parts = rawPathParts.filter(Boolean)
  if (parts.length === 0) throw unsupportedOrigin(value)
  const last = parts.at(-1)!
  if (/\.git$/i.test(last)) parts[parts.length - 1] = last.slice(0, -4)
  if (!parts.at(-1)) throw unsupportedOrigin(value)
  return `https://${parsed.hostname.toLowerCase()}/${parts.join('/').toLowerCase()}`
}

/** Returns a filesystem-safe stable slug for a canonical repository URL. */
export function repositorySlug(url: string): string {
  try {
    const parsed = new URL(canonicalGitUrl(url))
    return `${parsed.hostname}--${parsed.pathname.slice(1).replaceAll('/', '--')}`
  } catch (error) {
    if (error instanceof GitInspectionError) throw error
    throw new GitInspectionError(`Git origin does not identify a repository: ${url}`, {
      cause: error,
    })
  }
}

// Helpers ---------------------------------------------------------------------
function unsupportedOrigin(value: string): GitInspectionError {
  return new GitInspectionError(`Git origin uses an unsupported URL form: ${value}`)
}

function runGit(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (error) {
    throw new GitInspectionError(`Cannot inspect Git repository (${args.join(' ')})`, {
      cause: error,
    })
  }
}
