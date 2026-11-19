import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createDifflabDb, migrateDatabase } from 'difflab-db'
import { lstatOrNull } from 'utils/fsx'
import { seedFromLegacyIfPresent } from './legacy-seed.js'

// API -------------------------------------------------------------------------
export async function runMigrationsFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const databaseUrl = env.DATABASE_URL?.trim()
  if (databaseUrl) {
    const applied = await migrateDatabase({
      dialect: 'postgres',
      connectionString: databaseUrl,
    })
    console.log(
      JSON.stringify({
        event: 'difflab-api.migrate',
        dialect: 'postgres',
        applied,
      }),
    )
    return
  }

  const stateDir = resolveStateDir(env)
  const localSqlitePath = join(stateDir, 'local.sqlite')
  const existedBefore = Boolean(await lstatOrNull(localSqlitePath))
  const applied = await migrateDatabase({
    dialect: 'sqlite',
    path: localSqlitePath,
  })

  let seededProjects = 0
  if (!existedBefore) {
    const db = await createDifflabDb({ dialect: 'sqlite', path: localSqlitePath })
    try {
      seededProjects = await seedFromLegacyIfPresent(db, join(stateDir, 'difflab.sqlite'))
    } finally {
      await db.close()
    }
  }

  console.log(
    JSON.stringify({
      event: 'difflab-api.migrate',
      dialect: 'sqlite',
      path: localSqlitePath,
      applied,
      seeded_projects: seededProjects,
    }),
  )
}

// Helpers ---------------------------------------------------------------------
function resolveStateDir(env: NodeJS.ProcessEnv): string {
  const configured = env.DIFFLAB_HOME?.trim()
  return configured ? resolve(configured) : join(homedir(), '.difflab')
}

if (import.meta.main) {
  runMigrationsFromEnv().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(JSON.stringify({ event: 'difflab-api.migrate.error', message }))
    process.exit(1)
  })
}
