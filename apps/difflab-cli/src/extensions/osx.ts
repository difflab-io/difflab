import { homedir } from 'node:os'

export function resolveHomeDirectory(home?: string): string {
  return home ?? homedir()
}

export function isFileError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}
