import { lstat } from 'node:fs/promises'
import { join } from 'node:path'

// Constants -------------------------------------------------------------------
const MISE_FILENAMES = ['mise.toml', '.mise.toml'] as const

// Types -----------------------------------------------------------------------
export class MissingMiseConfigError extends Error {
  constructor(repoRoot: string) {
    super(`Repository requires a mise.toml file at ${repoRoot}`)
    this.name = 'MissingMiseConfigError'
  }
}

// API -------------------------------------------------------------------------
/** Verifies that a repository root contains a regular mise.toml or .mise.toml file. */
export async function assertMiseConfig(repoRoot: string): Promise<string> {
  for (const filename of MISE_FILENAMES) {
    const candidate = join(repoRoot, filename)
    const entry = await lstat(candidate).catch(() => null)
    if (entry?.isFile()) return candidate
  }
  throw new MissingMiseConfigError(repoRoot)
}

/** Builds deterministic `mise exec -- <command> <args...>` invocation arguments. */
export function buildMiseExecArgs(command: string, args: readonly string[] = []): string[] {
  if (!command.trim()) throw new Error('Command for mise exec must be non-empty')
  return ['exec', '--', command, ...args]
}
