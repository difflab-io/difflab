import { homedir } from 'node:os'

// API -------------------------------------------------------------------------
export function resolveHomeDirectory(home?: string): string {
  return home ?? homedir()
}

/** Check an unknown error's native Node error code without replacing or wrapping it. */
export function hasErrorCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code
}
