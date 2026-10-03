import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { hasErrorCode } from './osx.js'

// Types -----------------------------------------------------------------------
export type JsonObject = Record<string, unknown>

// API -------------------------------------------------------------------------
export function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export async function readJsonFile(file: string): Promise<JsonObject> {
  try {
    if ((await lstat(file)).isSymbolicLink()) throw new Error(`JSON file at ${file} is a symlink`)
    const parsed: unknown = JSON.parse(await readFile(file, 'utf8'))
    if (!isObject(parsed)) throw new Error('root must be a JSON object')
    return parsed
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return {}
    throw error
  }
}

export async function patchJsonToFile(
  file: string,
  patch: (value: JsonObject) => JsonObject,
): Promise<void> {
  const updated = patch(await readJsonFile(file))
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.${randomUUID()}.tmp`
  try {
    await writeFile(temp, `${JSON.stringify(updated, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    await rename(temp, file)
  } finally {
    await rm(temp, { force: true })
  }
}
