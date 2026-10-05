import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, resolve } from 'node:path'
import { hasErrorCode } from '../extensions/osx.js'

// Types -----------------------------------------------------------------------
export class ProgressLogError extends Error {}

export type ProgressEntry = { path: string; entry: string }

// API -------------------------------------------------------------------------
/** Append one timestamped line to an existing directory's logs.txt. */
export async function appendProgressLog(
  path: string,
  message: string,
  now = new Date(),
): Promise<ProgressEntry> {
  if (!isAbsolute(path) || resolve(path) !== path || basename(path) !== 'logs.txt') {
    throw new ProgressLogError('path must be an absolute, normalized path ending in logs.txt')
  }
  if (!message.trim() || /[\r\n\0]/.test(message) || Buffer.byteLength(message, 'utf8') > 2048) {
    throw new ProgressLogError('message must be one non-empty line of at most 2048 bytes')
  }
  // Agents use the physical project-store path, not the repository's .difflab symlink.
  const parent = dirname(path)
  if ((await realpath(parent)) !== parent) {
    throw new ProgressLogError('path must not contain symlinked directories')
  }

  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp = `${pad(now.getFullYear() % 100)}${pad(now.getMonth() + 1)}${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  const entry = `[${stamp}]: ${message}`
  try {
    const existing = await lstat(path)
    if (existing.isSymbolicLink()) throw new ProgressLogError('logs.txt must not be a symlink')
    if (!existing.isFile()) throw new ProgressLogError('logs.txt must be a regular file')
  } catch (error) {
    if (!hasErrorCode(error, 'ENOENT')) throw error
  }
  let handle
  try {
    handle = await open(
      path,
      constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW,
      0o600,
    )
  } catch (error) {
    if (hasErrorCode(error, 'ELOOP')) throw new ProgressLogError('logs.txt must not be a symlink')
    throw error
  }
  try {
    if (!(await handle.stat()).isFile())
      throw new ProgressLogError('logs.txt must be a regular file')
    const line = Buffer.from(`${entry}\n`, 'utf8')
    const { bytesWritten } = await handle.write(line)
    if (bytesWritten !== line.length)
      throw new ProgressLogError('Could not append the full log line')
  } finally {
    await handle.close()
  }
  return { path, entry }
}
