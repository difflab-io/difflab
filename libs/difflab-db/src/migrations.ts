import type { Database } from 'bun:sqlite'
import { migrations } from './generated/migrations.js'

// API -------------------------------------------------------------------------
export class MigrationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MigrationError'
  }
}

/** Verify without creating a database, sidecar, migration table, or directory. */
export function assertCurrentSchema(database: Database): void {
  const version = schemaVersion(database)
  if (version !== migrations.length) {
    throw new MigrationError(
      `Project database schema ${version} is not current (${migrations.length})`,
    )
  }
  verifyHistory(database, version)
}

export function migrate(database: Database): void {
  const version = schemaVersion(database)
  if (version > migrations.length)
    throw new MigrationError(`Unknown project schema version ${version}`)
  database.run(
    'CREATE TABLE IF NOT EXISTS difflab_migrations (version INTEGER PRIMARY KEY, tag TEXT NOT NULL, hash TEXT NOT NULL)',
  )
  verifyHistory(database, version)

  for (let index = version; index < migrations.length; index++) {
    const migration = migrations[index]
    if (!migration) throw new MigrationError(`Missing migration ${index}`)
    try {
      database
        .transaction(() => {
          for (const statement of migration.statements) database.run(statement)
          database
            .query('INSERT INTO difflab_migrations (version, tag, hash) VALUES (?, ?, ?)')
            .run(index + 1, migration.tag, migration.hash)
          database.run(`PRAGMA user_version = ${index + 1}`)
        })
        .immediate()
    } catch (error) {
      throw new MigrationError(`Could not apply project migration ${migration.tag}`, {
        cause: error,
      })
    }
  }
}

// Helpers ---------------------------------------------------------------------
function schemaVersion(database: Database): number {
  const row = database.query('PRAGMA user_version').get() as { user_version: number } | null
  if (!row || !Number.isSafeInteger(row.user_version) || row.user_version < 0) {
    throw new MigrationError('Invalid project database schema version')
  }
  return row.user_version
}

function verifyHistory(database: Database, version: number): void {
  const table = database
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'difflab_migrations'")
    .get()
  if (!table) {
    if (version === 0) return
    throw new MigrationError('Project database migration history is missing')
  }
  let applied: { version: number; tag: string; hash: string }[]
  try {
    applied = database
      .query('SELECT version, tag, hash FROM difflab_migrations ORDER BY version')
      .all() as typeof applied
  } catch (error) {
    throw new MigrationError('Invalid project database migration history', { cause: error })
  }
  if (
    applied.length !== version ||
    applied.some(
      (row, index) =>
        row.version !== index + 1 ||
        row.tag !== migrations[index]?.tag ||
        row.hash !== migrations[index]?.hash,
    )
  ) {
    throw new MigrationError(
      'Project database migration history does not match this Difflab version',
    )
  }
}
