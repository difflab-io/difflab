import { realpathSync } from 'node:fs'
import { lstat, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createDifflabDb, type Project, type Repository } from 'difflab-db'
import { DifflabError } from '../errors.js'

// Constants -------------------------------------------------------------------
const missing = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT'

// Types -----------------------------------------------------------------------
type UserDatabase = Awaited<ReturnType<typeof createDifflabDb>>

export class UserStoreError extends DifflabError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'UserStoreError'
  }
}

export class MissingUserDatabase extends UserStoreError {
  constructor(path: string, options?: ErrorOptions) {
    super(`Missing global Difflab database at ${path}`, options)
    this.name = 'MissingUserDatabase'
  }
}

// API -------------------------------------------------------------------------
/** The database belongs to the user, not to any particular Project or repository. */
export function userPaths(home = process.env.HOME || homedir()) {
  // Git returns the physical worktree path on systems such as macOS where
  // /var is a symlink; normalize the home as well for reliable link checks.
  let tilde: string
  try {
    tilde = realpathSync(home)
  } catch (error) {
    if (!missing(error)) throw error
    tilde = resolve(home)
  }
  const root = join(tilde, '.difflab')
  return { root, projects: join(root, 'projects'), database: join(root, 'difflab.sqlite') }
}

/** Only expose user-wide project operations; each call closes its database handle. */
export async function ensureUserStore(home?: string): Promise<void> {
  const paths = userPaths(home)
  await ensureDirectory(paths.root)
  await ensureDirectory(paths.projects)
  const db = await createDifflabDb(paths.database)
  await db.close()
}

export function createUserStore(home?: string) {
  return {
    createProject: (key: string, name: string, origins: string[] = []): Promise<Project> =>
      withUserStore((db) => db.projects.createProject(key, name, origins), { home }),
    listProjects: (): Promise<Project[]> => listUserProjects(home),
    getProjectById: (key: string): Promise<Project> =>
      withUserStore((db) => db.projects.getProjectById(key), { home, readonly: true }),
    linkRepositoryToProject: (key: string, origin: string): Promise<Repository> =>
      withUserStore((db) => db.repositories.linkRepositoryToProject(key, origin), { home }),
  }
}

/** Open a store only for the lifetime of the operation, including on errors. */
export async function withUserStore<T>(
  operation: (db: UserDatabase) => Promise<T>,
  options: { home?: string; readonly?: boolean } = {},
): Promise<T> {
  const paths = userPaths(options.home)
  if (options.readonly) {
    const entry = await lstat(paths.database).catch((error: unknown) => {
      if (missing(error)) throw new MissingUserDatabase(paths.database, { cause: error })
      throw error
    })
    if (!entry.isFile()) throw new UserStoreError(`Not a regular database file: ${paths.database}`)
  } else {
    await ensureDirectory(paths.root)
    await ensureDirectory(paths.projects)
  }
  const db = await createDifflabDb(paths.database, { readonly: options.readonly ?? false })
  try {
    return await operation(db)
  } finally {
    await db.close()
  }
}

// Helpers ---------------------------------------------------------------------
/** Listing a user without a database is an empty, strictly non-mutating read. */
async function listUserProjects(home?: string): Promise<Project[]> {
  try {
    return await withUserStore((db) => db.projects.listProjects(), { home, readonly: true })
  } catch (error) {
    if (error instanceof MissingUserDatabase) return []
    throw error
  }
}

async function ensureDirectory(path: string): Promise<void> {
  try {
    await mkdir(path, { mode: 0o700 })
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
  }
  const entry = await lstat(path)
  if (!entry.isDirectory())
    throw new UserStoreError(`Refusing non-directory user store path: ${path}`)
}
