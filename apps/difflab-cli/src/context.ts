import { MigrationError, DifflabDbError } from 'difflab-db'
import { canonicalGitUrl, discoverGitRepository, type GitRepository } from 'difflab-ts/gitx'
import { join } from 'node:path'
import { MissingGlobalConfig, MissingRepoConfig, RepoStoreError } from './errors.js'
import { readRepoConfig } from './projects/config.js'
import { createUserStore, userPaths, UserStoreError } from './store/user-store.js'
import { checkRepoStore } from './projects/repo-store.js'

// Types -----------------------------------------------------------------------
export type DifflabContext = {
  project: { id: string; name: string }
  repository: { id: string; origin: string; slug: string; localPath: string }
  relatedRepositories: Array<{ id: string; origin: string; slug: string }>
  root: string
}

// API -------------------------------------------------------------------------
export async function readProjectContext(
  cwd = process.cwd(),
  home?: string,
): Promise<DifflabContext> {
  const git = discoverGitRepository(cwd)
  const config = await readRepoConfig(git.root)
  if (!config) throw new MissingRepoConfig(`Missing difflab.yaml in ${git.root}`)
  return getProjectContext(git, config.project.id, home)
}

export async function getProjectContext(
  git: GitRepository,
  projectId: string,
  home?: string,
): Promise<DifflabContext> {
  let project
  try {
    project = await createUserStore(home).getProjectById(projectId)
  } catch (error) {
    if (
      error instanceof DifflabDbError ||
      error instanceof MigrationError ||
      error instanceof UserStoreError
    )
      throw new MissingGlobalConfig('Missing or invalid global Difflab setup', { cause: error })
    throw error
  }
  const origin = canonicalGitUrl(git.originUrl)
  const repository = project.repositories.find((item) => item.url === origin)
  if (!repository)
    throw new RepoStoreError('Repository is not registered in the selected project database')
  const target = join(userPaths(home).projects, project.id, repository.slug)
  await checkRepoStore(git.root, target)
  return {
    project: { id: project.id, name: project.name },
    repository: {
      id: repository.id,
      origin: repository.url,
      slug: repository.slug,
      localPath: git.root,
    },
    relatedRepositories: project.repositories.map((item) => ({
      id: item.id,
      origin: item.url,
      slug: item.slug,
    })),
    root: git.root,
  }
}
