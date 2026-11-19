import { createDifflabDb as createLegacyDifflabDb } from 'difflab-db-legacy'
import { lstatOrNull } from 'utils/fsx'
import type { DifflabDb } from './db.js'
import { DEFAULT_ACTOR } from './types.js'

// API -------------------------------------------------------------------------
export async function seedFromLegacyIfPresent(
  db: DifflabDb,
  legacySqlitePath: string,
): Promise<number> {
  const existing = await lstatOrNull(legacySqlitePath)
  if (!existing || !existing.isFile() || existing.isSymbolicLink()) {
    return 0
  }

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
