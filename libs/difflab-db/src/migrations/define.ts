import type { Kysely } from 'kysely'
import type { Migration } from 'kysely/migration'
import type { CoreDatabase, DifflabDatabase, MigrationType } from '../schema.js'

// Types -----------------------------------------------------------------------
export type TaggedMigration = {
  name: string
  migrationType: MigrationType
  migration: Migration
}

// API -------------------------------------------------------------------------
export function defineSharedMigration(spec: {
  name: string
  up: (db: Kysely<CoreDatabase>) => Promise<void>
  down?: (db: Kysely<CoreDatabase>) => Promise<void>
}): TaggedMigration {
  return {
    name: spec.name,
    migrationType: 'shared',
    migration: {
      up: (db) => spec.up(db as Kysely<CoreDatabase>),
      down: spec.down ? (db) => spec.down!(db as Kysely<CoreDatabase>) : undefined,
    },
  }
}

export function defineCloudMigration(spec: {
  name: string
  up: (db: Kysely<DifflabDatabase>) => Promise<void>
  down?: (db: Kysely<DifflabDatabase>) => Promise<void>
}): TaggedMigration {
  return {
    name: spec.name,
    migrationType: 'cloud',
    migration: {
      up: (db) => spec.up(db as Kysely<DifflabDatabase>),
      down: spec.down ? (db) => spec.down!(db as Kysely<DifflabDatabase>) : undefined,
    },
  }
}
