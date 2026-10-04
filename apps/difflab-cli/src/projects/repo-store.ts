import { lstat, mkdir, readlink, symlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  canonicalGithubUrl,
  MigrationError,
  ProjectStoreError,
  repositorySlug,
  validateProjectKey,
} from 'difflab-db'
import { MissingGlobalConfig, RepoStoreError } from '../errors.js'
import {
  addPathToGitExcludes,
  discoverGitRepository,
  type GitRepository,
} from '../extensions/gitx.js'
import { createUserStore, UserStoreError, userPaths } from '../store/user-store.js'
import { ensureRepoConfig, readRepoConfig, type RepoConfig } from './config.js'

// Types -----------------------------------------------------------------------
/** Context returned after repository inspection or initialization. */
export type RepositoryContext = {
  project: { id: string; name: string }
  repository: { id: string; github: string; slug: string; localPath: string }
  root: string
}

// API -------------------------------------------------------------------------
/** Inspect an initialized repository without changing any files or databases. */
export async function inspectRepository(
  git: GitRepository,
  projectId: string,
  home?: string,
): Promise<RepositoryContext> {
  const origin = canonicalGithubUrl(git.originUrl)
  let project
  try {
    project = await createUserStore(home).inspectProject(projectId)
  } catch (error) {
    if (
      error instanceof ProjectStoreError ||
      error instanceof MigrationError ||
      error instanceof UserStoreError
    )
      throw new MissingGlobalConfig('Missing or invalid global Difflab setup', { cause: error })
    throw error
  }
  const repository = project.repositories.find((item) => item.githubUrl === origin)
  if (!repository)
    throw new RepoStoreError('Repository is not registered in the selected project database')
  const target = join(userPaths(home).projects, project.id, repository.slug)
  await checkLink(git.root, target, true)
  return {
    project: { id: project.id, name: project.name },
    repository: {
      id: repository.id,
      github: repository.githubUrl,
      slug: repository.slug,
      localPath: git.root,
    },
    root: git.root,
  }
}

/** Preflight local paths before mutating the shared database; resume matching partial setup. */
export async function initializeRepository(cwd: string, projectId: string, home?: string) {
  const git = discoverGitRepository(cwd)
  const origin = canonicalGithubUrl(git.originUrl)
  const key = validateProjectKey(projectId)
  const config = await readRepoConfig(git.root)
  if (config && config.project.id !== key)
    throw new RepoStoreError(
      `Repository already belongs to project ${config.project.id}; requested ${key}`,
    )
  const project = await createUserStore(home).getProjectById(key)
  const projectPath = join(userPaths(home).projects, project.id)
  const target = join(projectPath, repositorySlug(origin))
  await checkLink(git.root, target, false)
  const projectStat = await optionalStat(projectPath)
  if (projectStat && !projectStat.isDirectory())
    throw new RepoStoreError(`Refusing non-directory project artifact path: ${projectPath}`)
  const targetStat = await optionalStat(target)
  if (targetStat && !targetStat.isDirectory())
    throw new RepoStoreError(`Refusing non-directory repository artifact path: ${target}`)

  // The first fallible write is registration. A later failure leaves an idempotent
  // partial state for the next invocation rather than removing user-owned data.
  const repository = await createUserStore(home).linkRepository(project.id, origin)
  const finalTarget = join(userPaths(home).projects, project.id, repository.slug)
  await mkdir(projectPath, { mode: 0o700, recursive: true })
  if (!(await lstat(projectPath)).isDirectory())
    throw new RepoStoreError(`Refusing non-directory project artifact path: ${projectPath}`)
  await mkdir(finalTarget, { mode: 0o700, recursive: true })
  if (!(await lstat(finalTarget)).isDirectory())
    throw new RepoStoreError(`Refusing non-directory repository artifact path: ${finalTarget}`)
  if (!(await optionalStat(join(git.root, '.difflab')))) {
    try {
      await symlink(finalTarget, join(git.root, '.difflab'))
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
      await checkLink(git.root, finalTarget, false)
    }
  }
  await checkLink(git.root, finalTarget, false)
  await addPathToGitExcludes(git.excludePath, '/.difflab')
  if (!config) {
    const desired: RepoConfig = { schemaVersion: 1, project: { id: project.id } }
    try {
      await ensureRepoConfig(desired, git.root)
    } catch (error) {
      // A competing initializer may have created the same manifest. Never
      // replace it; a different or invalid manifest remains an error.
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
      const current = await readRepoConfig(git.root)
      if (current?.project.id !== project.id)
        throw new RepoStoreError('Conflicting difflab.yaml', { cause: error })
    }
  }
  return inspectRepository(git, project.id, home)
}

// Helpers ---------------------------------------------------------------------
async function checkLink(root: string, target: string, required: boolean): Promise<void> {
  const link = join(root, '.difflab')
  const entry = await optionalStat(link)
  if (!entry) {
    if (required) throw new RepoStoreError(`Missing .difflab symlink at ${link}`)
    return
  }
  if (!entry.isSymbolicLink())
    throw new RepoStoreError(`Refusing to replace existing .difflab path: ${link}`)
  // A relative symlink is resolved from the repository root, not its parent.
  if (resolve(root, await readlink(link)) !== target)
    throw new RepoStoreError(`.difflab already links elsewhere: ${link}`)
  if (required) {
    const targetStat = await optionalStat(target)
    if (!targetStat?.isDirectory())
      throw new RepoStoreError(`Missing or invalid .difflab target directory: ${target}`)
  }
}

async function optionalStat(path: string) {
  try {
    return await lstat(path)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}
