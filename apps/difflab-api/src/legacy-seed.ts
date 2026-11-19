import { type DifflabDb } from 'difflab-db'
import { createDifflabDb as createLegacyDifflabDb } from 'difflab-db-legacy'
import { lstatOrNull } from 'utils/fsx'
import { LOCAL_ACTOR } from './context.js'

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
        LOCAL_ACTOR,
      )
    }
    return legacyProjects.length
  } finally {
    await legacyDb.close()
  }
}
