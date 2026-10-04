import { randomUUID } from 'node:crypto'
import { lstat, mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { canonicalGithubUrl, repositorySlug } from './repositories.js'
import { projectInfo, repositories } from './schema.js'
import {
  databasePath,
  ensureProjectsRoot,
  openProjectDatabase,
  projectDirectory,
  projectKeys,
  ProjectStoreError,
  requireDirectory,
  requireRegularFile,
  withRegistryLock,
} from './registry.js'

// Types -----------------------------------------------------------------------
export type Repository = { id: string; projectId: string; githubUrl: string; slug: string }
export type Project = { id: string; name: string; repositories: Repository[] }

// API -------------------------------------------------------------------------
export class ProjectConflictError extends ProjectStoreError {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectConflictError'
  }
}

export function validateProjectKey(key: string): string {
  const normalized = key.trim().toUpperCase()
  if (!/^[A-Z][A-Z0-9]{2,15}$/.test(normalized))
    throw new ProjectStoreError('Project key must be 3-16 uppercase letters or digits')
  return normalized
}

export async function createProject(
  key: string,
  name: string,
  home?: string,
  initialOrigins: string[] = [],
): Promise<Project> {
  const trimmed = name.trim()
  if (!trimmed || name.length > 100)
    throw new ProjectStoreError('Project name must be nonempty and at most 100 characters')
  const projectKey = validateProjectKey(key)
  const githubUrls = initialOrigins.map(canonicalGithubUrl)
  if (new Set(githubUrls).size !== githubUrls.length)
    throw new ProjectConflictError('Duplicate GitHub repository origins')
  return withRegistryLock(home, async () => {
    const root = await ensureProjectsRoot(home)
    const projects = await scanProjectsUnlocked(home)
    if (projects.some((project) => project.id === projectKey)) {
      throw new ProjectConflictError(`Project already exists: ${projectKey}`)
    }
    await assertAvailableDirectory(projectDirectory(projectKey, home))
    for (const githubUrl of githubUrls) {
      const owner = projects.find((project) =>
        project.repositories.some((repo) => repo.githubUrl === githubUrl),
      )
      if (owner)
        throw new ProjectConflictError(`GitHub repository already belongs to project ${owner.name}`)
    }
    const stage = join(root, `.creating-${randomUUID()}`)
    await mkdir(join(stage, 'db'), { recursive: true, mode: 0o700 })
    try {
      const database = openProjectDatabase(join(stage, 'db', 'project.sqlite'))
      const id = projectKey
      const initialRepositories: Repository[] = githubUrls.map((githubUrl) => ({
        id: randomUUID(),
        projectId: id,
        githubUrl,
        slug: repositorySlug(githubUrl),
      }))
      try {
        const orm = drizzle({ client: database })
        database
          .transaction(() => {
            orm.insert(projectInfo).values({ id: projectKey, name: trimmed }).run()
            if (initialRepositories.length)
              orm.insert(repositories).values(initialRepositories).run()
          })
          .immediate()
      } finally {
        database.close()
      }
      await assertAvailableDirectory(projectDirectory(projectKey, home))
      await rename(stage, projectDirectory(projectKey, home))
      return {
        id: projectKey,
        name: trimmed,
        repositories: initialRepositories,
      }
    } finally {
      await rm(stage, { recursive: true, force: true })
    }
  })
}

export async function listProjects(home?: string): Promise<Project[]> {
  return withRegistryLock(home, () => scanProjectsUnlocked(home))
}

/** Internal: call only while holding the registry lock. */
export async function scanProjectsUnlocked(home?: string): Promise<Project[]> {
  const projects: Project[] = []
  for (const key of await projectKeys(home)) projects.push(await loadProject(key, home))
  return projects
}

export async function getProjectById(id: string, home?: string): Promise<Project> {
  const projects = await listProjects(home)
  const project = projects.find((item) => item.id === id)
  if (!project) throw new ProjectStoreError(`Project not found: ${id}`)
  return project
}

/** Read only one project. Does not create home, project folders, SQLite sidecars or migrations. */
export async function inspectProject(projectKey: string, home?: string): Promise<Project> {
  return loadProject(projectKey, home, true)
}

// Helpers ---------------------------------------------------------------------
async function assertAvailableDirectory(path: string): Promise<void> {
  try {
    await lstat(path)
    throw new ProjectConflictError(`Project directory already exists: ${path}`)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
    throw error
  }
}

async function loadProject(
  projectKey: string,
  home: string | undefined,
  readonly = false,
): Promise<Project> {
  await requireDirectory(projectDirectory(projectKey, home))
  await requireDirectory(join(projectDirectory(projectKey, home), 'db'))
  const file = databasePath(projectKey, home)
  await requireRegularFile(file)
  const database = openProjectDatabase(file, readonly)
  try {
    const orm = drizzle({ client: database })
    const rows = orm.select().from(projectInfo).all()
    if (rows.length !== 1 || rows[0]?.id !== projectKey) {
      throw new ProjectStoreError(
        `Project database metadata does not match directory: ${projectKey}`,
      )
    }
    return {
      id: rows[0].id,
      name: rows[0].name,
      repositories: orm.select().from(repositories).all(),
    }
  } finally {
    database.close()
  }
}
