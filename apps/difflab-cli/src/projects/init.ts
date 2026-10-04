import { lstat, mkdir, readlink, rm, rmdir, symlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createProject, getProjectById, linkRepository, projectDirectory } from 'difflab-db'
import { ProjectSetupError } from '../errors.js'
import { addLocalExclusion } from './exclusion.js'
import { readProjectContext } from './context.js'
import { discoverGitRepository, type GitRepository } from './git.js'
import { manifestPath, readManifest, writeManifest } from './manifest.js'

// Types -----------------------------------------------------------------------
export type InitOptions = { cwd: string; home?: string; projectId?: string; newProject?: string }
export type InitPreflight = { git: GitRepository; configuredProjectId?: string; hasLink: boolean }

// API -------------------------------------------------------------------------
export async function preflightInit(cwd: string, home?: string): Promise<InitPreflight> {
  const git = discoverGitRepository(cwd)
  const manifest = await readManifest(git.root)
  const link = join(git.root, '.difflab')
  const existing = await optionalStat(link)
  if (existing && !existing.isSymbolicLink())
    throw new ProjectSetupError(`Refusing to replace existing .difflab path: ${link}`)
  if (manifest) {
    const context = await readProjectContext(git.root, home)
    return { git, configuredProjectId: context.project.id, hasLink: true }
  }
  return { git, hasLink: Boolean(existing) }
}

export async function initializeRepository(options: InitOptions) {
  const { cwd, home, projectId, newProject } = options
  if (
    (projectId === undefined && newProject === undefined) ||
    (projectId !== undefined && newProject !== undefined)
  ) {
    throw new ProjectSetupError('Choose exactly one of --project <id> or --new-project <name>')
  }
  // Inspect Git and conflicting setup before creating a project in the registry.
  const preflight = await preflightInit(cwd, home)
  if (preflight.configuredProjectId) {
    if (projectId !== preflight.configuredProjectId || newProject) {
      throw new ProjectSetupError(
        'Repository already belongs to a different or existing project; do not overwrite its manifest',
      )
    }
    return readProjectContext(preflight.git.root, home)
  }
  if (newProject && preflight.hasLink)
    throw new ProjectSetupError(
      'Unfinished .difflab link exists; select its existing project or repair it first',
    )
  const { git } = preflight
  const project = projectId
    ? await getProjectById(projectId, home)
    : await createProject(requireProjectName(newProject), home, git.githubUrl)
  const target = join(projectDirectory(project.slug, home), git.slug)
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
  let madeManifest = false
  try {
    if (!priorTarget) {
      await mkdir(target, { mode: 0o700 })
      madeDirectory = true
    }
    if (!preflight.hasLink) {
      await symlink(target, link)
      madeLink = true
    }
    await addLocalExclusion(git.excludePath)
    await writeManifest(git.root, {
      schemaVersion: 1,
      project: { id: project.id },
      repository: { github: git.githubUrl },
    })
    madeManifest = true
    return await readProjectContext(git.root, home)
  } catch (error) {
    if (madeManifest) await rm(manifestPath(git.root))
    if (madeLink) await rm(link)
    if (madeDirectory) await rmdir(target).catch(() => {}) // Retain any data written by another process.
    throw error
  }
}

// Helpers ---------------------------------------------------------------------
function requireProjectName(name: string | undefined): string {
  if (!name) throw new ProjectSetupError('A new project needs a nonempty name')
  return name
}

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
