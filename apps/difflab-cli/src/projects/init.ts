import { lstat, mkdir, readlink, rm, rmdir, symlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { getProjectById, linkRepository, projectDirectory } from 'difflab-db'
import { ProjectSetupError } from '../errors.js'
import { addPathToGitExcludes } from '../extensions/gitx.js'
import { readProjectContext } from './context.js'
import { discoverGitRepository, type GitRepository } from '../extensions/gitx.js'
import { ensureRepoConfig, readRepoConfig, repoConfigPath } from './config.js'

// Types -----------------------------------------------------------------------
export type InitOptions = { cwd: string; home?: string; projectId: string }
export type InitPreflight = { git: GitRepository; configuredProjectId?: string; hasLink: boolean }

// API -------------------------------------------------------------------------
export async function preflightInit(cwd: string, home?: string): Promise<InitPreflight> {
  const git = discoverGitRepository(cwd)
  const repositoryConfig = await readRepoConfig(git.root)
  const link = join(git.root, '.difflab')
  const existing = await optionalStat(link)
  if (existing && !existing.isSymbolicLink())
    throw new ProjectSetupError(`Refusing to replace existing .difflab path: ${link}`)
  if (repositoryConfig) {
    const context = await readProjectContext(git.root, home)
    return { git, configuredProjectId: context.project.id, hasLink: true }
  }
  return { git, hasLink: Boolean(existing) }
}

export async function initializeRepository(options: InitOptions) {
  const { cwd, home, projectId } = options
  // Inspect Git and conflicting setup before linking the existing project.
  const preflight = await preflightInit(cwd, home)
  if (preflight.configuredProjectId) {
    if (projectId !== preflight.configuredProjectId) {
      throw new ProjectSetupError(
        'Repository already belongs to a different or existing project; do not overwrite its repository config',
      )
    }
    return readProjectContext(preflight.git.root, home)
  }
  const { git } = preflight
  const project = await getProjectById(projectId, home)
  const target = join(projectDirectory(project.id, home), git.slug)
  const link = join(git.root, '.difflab')
  const registeredBefore = project.repositories.some((repo) => repo.githubUrl === git.githubUrl)
  const priorTarget = await optionalStat(target)
  if (priorTarget && (!priorTarget.isDirectory() || !registeredBefore)) {
    throw new ProjectSetupError(`Refusing to replace existing repository artifacts: ${target}`)
  }
  if (preflight.hasLink) await assertLink(link, target)

  // A crash may leave the DB row, target directory, link, or local exclude in place.
  // Retry only if every existing component agrees; compensate only paths made here.
  await linkRepository(project.id, git.githubUrl, home)
  let madeDirectory = false
  let madeLink = false
  let madeRepositoryConfig = false
  try {
    if (!priorTarget) {
      await mkdir(target, { mode: 0o700 })
      madeDirectory = true
    }
    if (!preflight.hasLink) {
      await symlink(target, link)
      madeLink = true
    }
    await addPathToGitExcludes(git.excludePath, '/.difflab')
    await ensureRepoConfig(git.root, {
      schemaVersion: 1,
      project: { id: project.id },
      repository: { github: git.githubUrl },
    })
    madeRepositoryConfig = true
    return await readProjectContext(git.root, home)
  } catch (error) {
    if (madeRepositoryConfig) await rm(repoConfigPath(git.root))
    if (madeLink) await rm(link)
    if (madeDirectory) await rmdir(target).catch(() => {}) // Retain any data written by another process.
    throw error
  }
}

// Helpers ---------------------------------------------------------------------
async function optionalStat(path: string) {
  try {
    return await lstat(path)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}

async function assertLink(path: string, expected: string): Promise<void> {
  if (resolve(join(path, '..'), await readlink(path)) !== expected) {
    throw new ProjectSetupError(`.difflab already links elsewhere: ${path}`)
  }
}
