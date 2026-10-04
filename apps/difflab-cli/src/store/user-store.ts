import { realpathSync } from 'node:fs'
import { lstat, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { openProjectStore, type Project, type Repository } from 'difflab-db'
import { DifflabError } from '../errors.js'

// Constants -------------------------------------------------------------------
const missing = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT'

// Types -----------------------------------------------------------------------
type ProjectStore = Awaited<ReturnType<typeof openProjectStore>>

// API -------------------------------------------------------------------------
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

/** The database belongs to the user, not to any particular Project or repository. */
export function userPaths(home = process.env.HOME || homedir()) {
  // Git returns the physical worktree path on systems such as macOS where
  // /var is a symlink; normalize the home as well for reliable link checks.
  let canonicalHome: string
  try {
    canonicalHome = realpathSync(home)
  } catch (error) {
    if (!missing(error)) throw error
    canonicalHome = resolve(home)
  }
  const root = join(canonicalHome, '.difflab')
  return { root, projects: join(root, 'projects'), database: join(root, 'difflab.sqlite') }
}

/** Only expose user-wide project operations; each call closes its database handle. */
export function createUserStore(home?: string) {
  return {
    createProject: (key: string, name: string, origins: string[] = []): Promise<Project> =>
      withUserStore((store) => store.createProject(key, name, origins), { home }),
    listProjects: (): Promise<Project[]> => listUserProjects(home),
    getProjectById: (key: string): Promise<Project> =>
      withUserStore((store) => store.getProjectById(key), { home, readonly: true }),
    inspectProject: (key: string): Promise<Project> =>
      withUserStore((store) => store.inspectProject(key), { home, readonly: true }),
    linkRepository: (key: string, origin: string): Promise<Repository> =>
      withUserStore((store) => store.linkRepository(key, origin), { home }),
  }
}

// Helpers ---------------------------------------------------------------------
/** Open a store only for the lifetime of the operation, including on errors. */
async function withUserStore<T>(
  operation: (store: ProjectStore) => Promise<T>,
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
  const store = await openProjectStore(paths.database, { readonly: options.readonly ?? false })
  try {
    return await operation(store)
  } finally {
    await store.close()
  }
}

/** Listing a user without a database is an empty, strictly non-mutating read. */
async function listUserProjects(home?: string): Promise<Project[]> {
  try {
    return await withUserStore((store) => store.listProjects(), { home, readonly: true })
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
