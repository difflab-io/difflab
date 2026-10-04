import { lstat, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { canonicalGithubUrl } from 'difflab-db'
import { parseDocument, stringify } from 'yaml'
import { z } from 'zod'
import { ProjectSetupError } from '../errors.js'

// Constants -------------------------------------------------------------------
const manifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  project: z.strictObject({ id: z.uuid() }),
  repository: z.strictObject({ github: z.string().url() }),
})

// Types -----------------------------------------------------------------------
export type ProjectManifest = z.infer<typeof manifestSchema>

// API -------------------------------------------------------------------------
export function manifestPath(root: string): string {
  return join(root, 'difflab.yaml')
}

export async function readManifest(root: string): Promise<ProjectManifest | null> {
  const path = manifestPath(root)
  try {
    const entry = await lstat(path)
    if (!entry.isFile()) throw new ProjectSetupError(`Manifest is not a regular file: ${path}`)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
  try {
    const document = parseDocument(await readFile(path, 'utf8'), { uniqueKeys: true, strict: true })
    if (document.errors.length) throw document.errors[0]
    const manifest = manifestSchema.parse(document.toJS({ maxAliasCount: 0 }))
    if (canonicalGithubUrl(manifest.repository.github) !== manifest.repository.github) {
      throw new ProjectSetupError('Manifest GitHub URL is not canonical')
    }
    return manifest
  } catch (error) {
    throw new ProjectSetupError(`Invalid difflab.yaml at ${path}; do not overwrite it`, {
      cause: error,
    })
  }
}

export async function writeManifest(root: string, manifest: ProjectManifest): Promise<void> {
  const parsed = manifestSchema.parse(manifest)
  await writeFile(manifestPath(root), stringify(parsed), { flag: 'wx', mode: 0o644 })
}
