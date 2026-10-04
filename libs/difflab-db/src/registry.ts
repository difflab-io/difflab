import { lstat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Kysely, sql } from 'kysely'
import { BunSqliteDialect } from 'kysely-bun-worker/normal'
import { assertCurrentSchema, migrate } from './migrations.js'
import { hasMigrationRace, isSqliteContention, retryDatabaseOperation } from './retry.js'
import type { ProjectDatabase } from './schema.js'

// Constants -------------------------------------------------------------------
const pendingOperations = new Map<string, Promise<void>>()

// API -------------------------------------------------------------------------
/** Serialize operations on a path: Bun's synchronous SQLite waits can block their own event loop. */
export async function withDatabaseAccess<T>(path: string, work: () => Promise<T>): Promise<T> {
  const key = resolve(path)
  const previous = pendingOperations.get(key)
  let release!: () => void
  const pending = new Promise<void>((done) => {
    release = done
  })
  pendingOperations.set(key, pending)
  try {
    if (previous) await previous
    return await work()
  } finally {
    if (pendingOperations.get(key) === pending) pendingOperations.delete(key)
    release()
  }
}

export class ProjectStoreError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ProjectStoreError'
  }
}

export async function openDatabase(
  dbPath: string,
  readonly: boolean,
): Promise<Kysely<ProjectDatabase>> {
  if (readonly) {
    try {
      const entry = await lstat(dbPath)
      if (!entry.isFile())
        throw new ProjectStoreError(`Expected a regular project database: ${dbPath}`)
    } catch (error) {
      if (error instanceof ProjectStoreError) throw error
      throw new ProjectStoreError(`Project database does not exist: ${dbPath}`, { cause: error })
    }
  }
  const db = new Kysely<ProjectDatabase>({
    dialect: new BunSqliteDialect({
      url: dbPath,
      dbOptions: { readonly, create: !readonly, strict: true },
    }),
  })
  try {
    if (readonly) await assertCurrentSchema(db)
    else {
      await sql`PRAGMA foreign_keys = ON`.execute(db)
      await sql`PRAGMA busy_timeout = 5000`.execute(db)
      await withDatabaseAccess(dbPath, () =>
        retryDatabaseOperation(
          () => migrate(db),
          (error) => isSqliteContention(error) || hasMigrationRace(error),
        ),
      )
    }
    return db
  } catch (error) {
    await db.destroy()
    throw error
  }
}
