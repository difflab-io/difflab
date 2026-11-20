import { join } from 'node:path'
import { ConnectError, createDifflabClient, type DifflabClient } from 'difflab-client-ts'
import { DifflabConfig } from 'difflab-config'
import { DaemonLifecycleError, DifflabDaemon } from 'difflab-daemon'
import { lstatOrNull } from 'utils/fsx'
import { canonicalGitUrl, discoverGitRepository, type GitRepository } from 'utils/gitx'
import { MissingGlobalConfig, MissingRepoConfig, RepoStoreError } from './errors.js'
import { checkRepoStore } from './projects/repo-store.js'

// Types -----------------------------------------------------------------------
/** Resolved project and repository metadata returned to CLI commands and MCP tools. */
export type DifflabContext = {
  project: { id: string; name: string }
  repository: { id: string; origin: string; slug: string; localPath: string }
  relatedRepositories: Array<{ id: string; origin: string; slug: string }>
  root: string
}

// API -------------------------------------------------------------------------
/** Connect to the configured remote RPC endpoint or ensure the local daemon is running. */
export async function connectCliClient(
  options: {
    home?: string
    client?: DifflabClient
  } = {},
): Promise<DifflabClient> {
  if (options.client) return options.client
  const config = DifflabConfig.load({ home: options.home })
  if (config.remote) {
    return createDifflabClient({
      mode: 'remote',
      rpcUrl: config.remote.rpcUrl,
      token: config.remote.token,
      workspaceId: config.remote.workspaceId,
    })
  }
  const status = await DifflabDaemon.withOptions({ stateDir: config.paths.root }).runBackground()
  return createDifflabClient({ mode: 'local', rpcUrl: status.rpc_url })
}

/** Read and validate the active Difflab project context for a Git repository at `cwd`. */
export async function readProjectContext(
  cwd = process.cwd(),
  home?: string,
  client?: DifflabClient,
): Promise<DifflabContext> {
  const git = discoverGitRepository(cwd)
  const config = await DifflabConfig.readRepo(git.root)
  if (!config) throw new MissingRepoConfig(`Missing difflab.yaml in ${git.root}`)
  return getProjectContext(git, config.project.id, home, client)
}

/** Resolve full project context for a discovered `git` repository and `projectId`. */
export async function getProjectContext(
  git: GitRepository,
  projectId: string,
  home?: string,
  injectedClient?: DifflabClient,
): Promise<DifflabContext> {
  const config = DifflabConfig.load({ home })
  if (!injectedClient && !config.remote) {
    const hasLocalDb = Boolean(await lstatOrNull(config.paths.database))
    const hasLegacyDb = Boolean(await lstatOrNull(config.paths.legacyDatabase))
    if (!hasLocalDb && !hasLegacyDb) {
      throw new MissingGlobalConfig('Missing or invalid global Difflab setup')
    }
  }

  let project
  try {
    const client = await connectCliClient({ home, client: injectedClient })
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

  const target = join(config.paths.projects, project.key, repository.slug)
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
