import { join } from 'node:path'
import { ConnectError, createDifflabClient, type DifflabClient } from 'difflab-client-ts'
import { DifflabConfig } from 'difflab-config'
import { DifflabDb, DifflabDbError, type ProjectWithRemotes } from 'difflab-db'
import { lstatOrNull } from 'utils/fsx'
import { canonicalGitUrl, discoverGitRepository, type GitRepository } from 'utils/gitx'
import { MissingGlobalConfig, MissingRepoConfig, RepoStoreError } from './errors.js'
import { checkRepoStore } from './projects/repo-store.js'

// Types -----------------------------------------------------------------------
/** Normalized project record returned by either local SQLite or remote Connect RPC. */
export type ProjectRecord = {
  key: string
  name: string
  repositories: Array<{ id: string; remoteUrl: string; slug: string }>
}

/** Unified project operations backed by local SQLite or remote `difflab-api` RPC. */
export type ProjectBackend = {
  createProject(input: {
    key: string
    name: string
    repositoryUrls: string[]
  }): Promise<ProjectRecord>
  listProjects(): Promise<ProjectRecord[]>
  getProject(key: string): Promise<ProjectRecord | undefined>
  linkRepository(input: { projectKey: string; remoteUrl: string }): Promise<void>
}

/** Resolved project and repository metadata returned to CLI commands and MCP tools. */
export type DifflabContext = {
  project: { id: string; name: string }
  repository: { id: string; origin: string; slug: string; localPath: string }
  relatedRepositories: Array<{ id: string; origin: string; slug: string }>
  root: string
}

// API -------------------------------------------------------------------------
/** Run `fn` against remote Connect RPC when configured, or in-process local SQLite by default. */
export async function withProjectBackend<T>(
  options: {
    home?: string
    client?: DifflabClient
  },
  fn: (backend: ProjectBackend) => Promise<T>,
): Promise<T> {
  if (options.client) {
    return await fn(createRemoteBackend(options.client))
  }
  const config = DifflabConfig.load({ home: options.home })
  if (config.remote) {
    const client = createDifflabClient({
      mode: 'remote',
      rpcUrl: config.remote.rpcUrl,
      token: config.remote.token,
      workspaceId: config.remote.workspaceId,
    })
    return await fn(createRemoteBackend(client))
  }
  const db = await DifflabDb.openLocal(config.paths.root)
  try {
    return await fn(createLocalBackend(db))
  } finally {
    await db.close()
  }
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

  let project: ProjectRecord | undefined
  try {
    project = await withProjectBackend({ home, client: injectedClient }, (backend) =>
      backend.getProject(projectId),
    )
  } catch (error) {
    if (error instanceof ConnectError || error instanceof DifflabDbError) {
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

// Helpers ---------------------------------------------------------------------
function fromDomainProject(project: ProjectWithRemotes): ProjectRecord {
  return {
    key: project.key,
    name: project.name,
    repositories: project.gitRemotes.map((remote) => ({
      id: remote.id,
      remoteUrl: remote.remoteUrl,
      slug: remote.slug,
    })),
  }
}

function createLocalBackend(db: DifflabDb): ProjectBackend {
  return {
    async createProject({ key, name, repositoryUrls }) {
      return fromDomainProject(await db.projects.createProject(key, name, repositoryUrls))
    },
    async listProjects() {
      return (await db.projects.listProjects()).map(fromDomainProject)
    },
    async getProject(key) {
      return fromDomainProject(await db.projects.getProjectById(key))
    },
    async linkRepository({ projectKey, remoteUrl }) {
      await db.gitRemotes.linkGitRemoteToProject(projectKey, remoteUrl)
    },
  }
}

function createRemoteBackend(client: DifflabClient): ProjectBackend {
  return {
    async createProject({ key, name, repositoryUrls }) {
      const response = await client.projects.createProject({ key, name, repositoryUrls })
      return response.project!
    },
    async listProjects() {
      const { projects } = await client.projects.listProjects({})
      return projects
    },
    async getProject(key) {
      const response = await client.projects.getProject({ key })
      return response.project
    },
    async linkRepository({ projectKey, remoteUrl }) {
      await client.projects.linkRepository({ projectKey, remoteUrl })
    },
  }
}
