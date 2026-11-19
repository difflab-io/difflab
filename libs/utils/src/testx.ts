import { realpathSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

// Types -----------------------------------------------------------------------
export class TestHomeIsolationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TestHomeIsolationError'
  }
}

// API -------------------------------------------------------------------------
export function assertIsolatedTestHome(
  candidateHome = process.env.DIFFLAB_HOME,
  userHome = homedir(),
): void {
  if (!candidateHome?.trim()) return
  const protectedRoot = canonicalizeMaybeExisting(join(userHome, '.difflab'))
  const target = canonicalizeMaybeExisting(candidateHome)
  if (target === protectedRoot || target.startsWith(`${protectedRoot}${sep}`)) {
    throw new TestHomeIsolationError(
      `Refusing to run tests against real ~/.difflab directory: ${candidateHome}`,
    )
  }
}

export async function createIsolatedTestHome(prefix = 'difflab-test-'): Promise<{
  home: string
  cleanup: () => Promise<void>
}> {
  assertIsolatedTestHome(process.env.DIFFLAB_HOME)
  const home = await mkdtemp(join(tmpdir(), prefix))
  assertIsolatedTestHome(home)
  return { home, cleanup: () => rm(home, { recursive: true, force: true }) }
}

export async function createTempDirectory(prefix: string): Promise<{
  path: string
  cleanup: () => Promise<void>
}> {
  const path = await mkdtemp(join(tmpdir(), prefix))
  return { path, cleanup: () => rm(path, { recursive: true, force: true }) }
}

export async function expectFailureWith(
  operation: Promise<unknown>,
  message: string,
): Promise<void> {
  let failure: unknown
  try {
    await operation
  } catch (error) {
    failure = error
  }
  if (!(failure instanceof Error)) {
    throw new Error(`Expected failure containing: ${message}`)
  }
  if (!failure.message.includes(message)) {
    throw new Error(`Expected failure containing: ${message}; got: ${failure.message}`)
  }
}

// Helpers ---------------------------------------------------------------------
function canonicalizeMaybeExisting(target: string): string {
  const resolved = resolve(target)
  try {
    return realpathSync(resolved)
  } catch {
    return resolved
  }
}
