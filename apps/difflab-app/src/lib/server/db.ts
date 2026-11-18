import { realpathSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createDifflabDb, type DifflabDb } from 'difflab-db'

// Constants -------------------------------------------------------------------
const dbHandles = new Map<string, Promise<DifflabDb>>()

// API -------------------------------------------------------------------------
export function resolveAppHome(overrideHome?: string): string {
  const raw = overrideHome ?? process.env.DIFFLAB_HOME_ROOT ?? process.env.HOME ?? homedir()
  try {
    return realpathSync(raw)
  } catch {
    return resolve(raw)
  }
}

export function resolveStorePaths(overrideHome?: string) {
  const home = resolveAppHome(overrideHome)
  const root = process.env.DIFFLAB_STORE_DIR
    ? resolve(process.env.DIFFLAB_STORE_DIR)
    : join(home, '.difflab')
  return {
    home,
    root,
    projects: join(root, 'projects'),
    flows: join(root, 'flows'),
    worktrees: join(root, 'worktrees'),
    daemonState: join(root, 'daemon.json'),
    database: join(root, 'difflab.sqlite'),
  }
}

export async function getAppDb(overrideHome?: string): Promise<DifflabDb> {
  const paths = resolveStorePaths(overrideHome)
  let pending = dbHandles.get(paths.database)
  if (!pending) {
    pending = (async () => {
      await mkdir(paths.root, { recursive: true, mode: 0o700 })
      await mkdir(paths.projects, { recursive: true, mode: 0o700 })
      return createDifflabDb(paths.database)
    })()
    dbHandles.set(paths.database, pending)
    pending.catch(() => dbHandles.delete(paths.database))
  }
  return pending
}

export async function closeAllAppDbs(): Promise<void> {
  const handles = [...dbHandles.values()]
  dbHandles.clear()
  await Promise.allSettled(handles.map(async (promise) => (await promise).close()))
}
