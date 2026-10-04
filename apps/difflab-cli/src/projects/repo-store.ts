import { mkdir, readlink, symlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { RepoStoreError } from '../errors.js'
import { addPathToGitExcludes } from '../extensions/gitx.js'
import { lstatOrNull } from '../extensions/fsx.js'

// API -------------------------------------------------------------------------
/** Check that repository store paths are safe without creating or changing anything. */
export async function preflightRepoStore(root: string, target: string): Promise<void> {
  for (const path of [root, dirname(target)]) {
    const entry = await lstatOrNull(path)
    if (entry && !entry.isDirectory())
      throw new RepoStoreError(`Refusing non-directory repository path: ${path}`)
  }
  const targetStat = await lstatOrNull(target)
  if (targetStat && !targetStat.isDirectory())
    throw new RepoStoreError(`Refusing existing target: ${target}`)
  const link = join(root, '.difflab')
  const entry = await lstatOrNull(link)
  if (entry) {
    if (!entry.isSymbolicLink())
      throw new RepoStoreError(`Refusing to replace existing .difflab path: ${link}`)
    if (resolve(root, await readlink(link)) !== resolve(target))
      throw new RepoStoreError(`.difflab already links elsewhere: ${link}`)
  }
}

/** Verify the repository store and optionally record its Git exclude entry. */
export async function checkRepoStore(
  root: string,
  target: string,
  excludePath?: string,
): Promise<void> {
  const link = join(root, '.difflab')
  const entry = await lstatOrNull(link)
  if (!entry) throw new RepoStoreError(`Missing .difflab symlink at ${link}`)
  if (!entry.isSymbolicLink())
    throw new RepoStoreError(`Refusing to replace existing .difflab path: ${link}`)
  if (resolve(root, await readlink(link)) !== resolve(target))
    throw new RepoStoreError(`.difflab already links elsewhere: ${link}`)
  const targetStat = await lstatOrNull(target)
  if (!targetStat?.isDirectory())
    throw new RepoStoreError(`Missing or invalid .difflab target directory: ${target}`)
  if (excludePath) await addPathToGitExcludes(excludePath, '/.difflab')
}

/** Create the target and symlink, then verify and exclude the repository store. */
export async function ensureRepoStore(
  root: string,
  target: string,
  excludePath?: string,
): Promise<void> {
  await preflightRepoStore(root, target)
  if (!(await lstatOrNull(target))) {
    try {
      await mkdir(target, { recursive: true, mode: 0o700 })
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
    }
  }
  const link = join(root, '.difflab')
  if (!(await lstatOrNull(link))) {
    try {
      await symlink(target, link)
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
    }
  }
  await checkRepoStore(root, target, excludePath)
}
