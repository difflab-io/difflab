import { lstatOrNull } from 'utils/fsx'
import type { DifflabDb } from './db.js'
import { DEFAULT_ACTOR } from './schema/index.js'

// API -------------------------------------------------------------------------
export async function seedFromLegacyIfPresent(
  db: DifflabDb,
  legacySqlitePath: string,
): Promise<number> {
  const existing = await lstatOrNull(legacySqlitePath)
  if (!existing || !existing.isFile() || existing.isSymbolicLink()) {
    return 0
  }

  // TODO(DIFF-325): Split bun:sqlite legacy seed adapter out of difflab-db so this dynamic import can be removed.
  const { createDifflabDb: createLegacyDifflabDb } = await import('difflab-db-legacy')
  const legacyDb = await createLegacyDifflabDb(legacySqlitePath, { readonly: true })
  try {
    await legacyDb.assertCurrentSchema()
    const legacyProjects = await legacyDb.projects.listProjects()
    for (const project of legacyProjects) {
      await db.projects.createProject(
        project.id,
        project.name,
        project.repositories.map((repo) => repo.url),
        DEFAULT_ACTOR,
      )
    }
    return legacyProjects.length
  } finally {
    await legacyDb.close()
  }
}
