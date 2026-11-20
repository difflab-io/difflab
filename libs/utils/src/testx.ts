import { mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'

// API -------------------------------------------------------------------------
/** Throw an `Error` if `candidateHome` points at or inside the real user `~/.difflab` directory. */
export function assertIsolatedTestHome(
  candidateHome = process.env.DIFFLAB_HOME,
  userHome = homedir(),
): void {
  if (!candidateHome?.trim()) return
  const rel = relative(resolve(userHome, '.difflab'), resolve(candidateHome))
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    throw new Error(`Refusing to run tests against real ~/.difflab directory: ${candidateHome}`)
  }
}

/** Create an ephemeral temporary Difflab home directory verified to be outside `~/.difflab`. */
export async function createIsolatedTestHome(prefix = 'difflab-test-'): Promise<{
  home: string
  cleanup: () => Promise<void>
}> {
  assertIsolatedTestHome(process.env.DIFFLAB_HOME)
  const home = await mkdtemp(join(tmpdir(), prefix))
  assertIsolatedTestHome(home)
  return { home, cleanup: () => rm(home, { recursive: true, force: true }) }
}

/** Create a temporary directory under the OS temp root with a cleanup helper. */
export async function createTempDirectory(prefix: string): Promise<{
  path: string
  cleanup: () => Promise<void>
}> {
  const path = await mkdtemp(join(tmpdir(), prefix))
  return { path, cleanup: () => rm(path, { recursive: true, force: true }) }
}

/** Assert that `operation` rejects with an `Error` whose message contains `message`. */
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
