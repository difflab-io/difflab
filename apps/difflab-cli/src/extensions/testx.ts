import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// API -------------------------------------------------------------------------
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
