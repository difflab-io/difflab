import { join } from 'node:path'
import { ConnectError, type DifflabClient } from 'difflab-client-ts'
import { DaemonLifecycleError } from 'utils/daemonx'
import { lstatOrNull } from 'utils/fsx'
import { canonicalGitUrl, discoverGitRepository, type GitRepository } from 'utils/gitx'
import { resolveDifflabPaths } from './daemon/config.js'
import { MissingGlobalConfig, MissingRepoConfig, RepoStoreError } from './errors.js'
import { readRepoConfig } from './projects/config.js'
import { checkRepoStore } from './projects/repo-store.js'
import { resolveDifflabClient } from './rpc/target.js'

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
  client?: DifflabClient,
): Promise<DifflabContext> {
  const git = discoverGitRepository(cwd)
  const config = await readRepoConfig(git.root)
  if (!config) throw new MissingRepoConfig(`Missing difflab.yaml in ${git.root}`)
  return getProjectContext(git, config.project.id, home, client)
}

export async function getProjectContext(
  git: GitRepository,
  projectId: string,
  home?: string,
  injectedClient?: DifflabClient,
): Promise<DifflabContext> {
  const paths = resolveDifflabPaths(home)
  if (!injectedClient && !process.env.DIFFLAB_RPC_URL?.trim()) {
    const hasLocalDb = Boolean(await lstatOrNull(paths.database))
    const hasLegacyDb = Boolean(await lstatOrNull(join(paths.root, 'difflab.sqlite')))
    if (!hasLocalDb && !hasLegacyDb) {
      throw new MissingGlobalConfig('Missing or invalid global Difflab setup')
    }
  }

  let project
  try {
    const client = await resolveDifflabClient({ home, client: injectedClient })
    const response = await client.projects.getProject({ key: projectId })
    project = response.project
  } catch (error) {
    if (error instanceof ConnectError || error instanceof DaemonLifecycleError) {
      throw new MissingGlobalConfig('Missing or invalid global Difflab setup', { cause: error })
    }
    throw error
  }
  if (!project) {
    throw new MissingGlobalConfig(`Project not found: ${projectId}`)
  }

  const origin = canonicalGitUrl(git.originUrl)
  const repository = project.repositories.find((item) => item.remoteUrl === origin)
  if (!repository) {
    throw new RepoStoreError('Repository is not registered in the selected project database')
  }

  const target = join(paths.projects, project.key, repository.slug)
  await checkRepoStore(git.root, target)
  return {
    project: { id: project.key, name: project.name },
    repository: {
      id: repository.id,
      origin: repository.remoteUrl,
      slug: repository.slug,
      localPath: git.root,
    },
    relatedRepositories: project.repositories.map((item) => ({
      id: item.id,
      origin: item.remoteUrl,
      slug: item.slug,
    })),
    root: git.root,
  }
}
