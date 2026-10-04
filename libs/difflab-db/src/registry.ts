import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { assertCurrentSchema, migrate } from './migrations.js'

// Constants -------------------------------------------------------------------
const lockAttempts = 40
const lockDelayMs = 50

// API -------------------------------------------------------------------------
export class ProjectStoreError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ProjectStoreError'
  }
}

export function dataRoot(home = homedir()): string {
  return join(home, '.difflab')
}

export function projectDirectory(key: string, home?: string): string {
  if (!/^[A-Z][A-Z0-9]{2,15}$/.test(key)) throw new ProjectStoreError('Invalid project key')
  return join(dataRoot(home), 'projects', key)
}

export function databasePath(key: string, home?: string): string {
  return join(projectDirectory(key, home), 'db', 'project.sqlite')
}

export async function ensureProjectsRoot(home?: string): Promise<string> {
  const root = dataRoot(home)
  await ensureDirectory(root)
  const projects = join(root, 'projects')
  await ensureDirectory(projects)
  return projects
}

export async function projectKeys(home?: string): Promise<string[]> {
  const root = await ensureProjectsRoot(home)
  const entries = await readdir(root, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort()
}

export async function withRegistryLock<T>(
  home: string | undefined,
  work: () => Promise<T>,
): Promise<T> {
  const root = await ensureProjectsRoot(home)
  const lock = join(root, '.registry.lock')
  const token = randomUUID()
  let acquired = false
  for (let attempt = 0; attempt < lockAttempts; attempt++) {
    try {
      await mkdir(lock, { mode: 0o700 })
      acquired = true
      break
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
      if (attempt === lockAttempts - 1) {
        throw new ProjectStoreError(
          `Project registry is locked at ${lock}; check the owning process before removing a stale lock`,
        )
      }
      await new Promise((resolve) => setTimeout(resolve, lockDelayMs))
    }
  }
  if (!acquired) throw new ProjectStoreError('Could not acquire project registry lock')
  let failed = false
  let failure: unknown
  let result!: T
  try {
    await writeFile(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, token }), {
      flag: 'wx',
      mode: 0o600,
    })
    result = await work()
  } catch (error) {
    failed = true
    failure = error
  }
  // Never remove another process's lock after an external intervention.
  try {
    const owner = JSON.parse(await readFile(join(lock, 'owner.json'), 'utf8')) as {
      token: string
    }
    if (owner.token === token) await rm(lock, { recursive: true })
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT') && !failed)
      throw error
  }
  if (failed) throw failure
  return result
}

export function openProjectDatabase(path: string, readonly = false): Database {
  const database = new Database(path, { readonly, create: !readonly, strict: true })
  try {
    database.run('PRAGMA foreign_keys = ON')
    database.run('PRAGMA busy_timeout = 5000')
    if (readonly) assertCurrentSchema(database)
    else {
      database.run('PRAGMA journal_mode = WAL')
      migrate(database)
    }
    return database
  } catch (error) {
    database.close()
    throw error
  }
}

export async function requireRegularFile(path: string): Promise<void> {
  const entry = await lstat(path)
  if (!entry.isFile()) throw new ProjectStoreError(`Expected a regular project database: ${path}`)
}

export async function requireDirectory(path: string): Promise<void> {
  const entry = await lstat(path)
  if (!entry.isDirectory())
    throw new ProjectStoreError(`Expected a directory, not a symlink or file: ${path}`)
}

// Helpers ---------------------------------------------------------------------
async function ensureDirectory(path: string): Promise<void> {
  try {
    await mkdir(path, { mode: 0o700 })
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
  }
  await requireDirectory(path)
}
