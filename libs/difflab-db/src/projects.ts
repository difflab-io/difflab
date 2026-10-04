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
  projectSlugs,
  ProjectStoreError,
  requireDirectory,
  requireRegularFile,
  withRegistryLock,
} from './registry.js'

// Types -----------------------------------------------------------------------
export type Repository = { id: string; projectId: string; githubUrl: string; slug: string }
export type Project = { id: string; name: string; slug: string; repositories: Repository[] }

// API -------------------------------------------------------------------------
export class ProjectConflictError extends ProjectStoreError {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectConflictError'
  }
}

export function slugForName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  if (!name.trim() || name.length > 100 || !slug)
    throw new ProjectStoreError(
      'Project name must produce a nonempty filesystem-safe slug (max 100 characters)',
    )
  return slug
}

export async function createProject(
  name: string,
  home?: string,
  initialOrigin?: string,
): Promise<Project> {
  const trimmed = name.trim()
  const slug = slugForName(trimmed)
  const githubUrl = initialOrigin ? canonicalGithubUrl(initialOrigin) : undefined
  return withRegistryLock(home, async () => {
    const root = await ensureProjectsRoot(home)
    const projects = await scanProjectsUnlocked(home)
    if (projects.some((project) => project.slug === slug)) {
      throw new ProjectConflictError(`Project already exists: ${slug}`)
    }
    await assertAvailableDirectory(projectDirectory(slug, home))
    if (githubUrl) {
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
      const id = randomUUID()
      const initialRepository: Repository | undefined = githubUrl
        ? { id: randomUUID(), projectId: id, githubUrl, slug: repositorySlug(githubUrl) }
        : undefined
      try {
        const orm = drizzle({ client: database })
        database
          .transaction(() => {
            orm.insert(projectInfo).values({ id, name: trimmed, slug }).run()
            if (initialRepository) orm.insert(repositories).values(initialRepository).run()
          })
          .immediate()
      } finally {
        database.close()
      }
      await assertAvailableDirectory(projectDirectory(slug, home))
      await rename(stage, projectDirectory(slug, home))
      return { id, name: trimmed, slug, repositories: initialRepository ? [initialRepository] : [] }
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
  for (const slug of await projectSlugs(home)) projects.push(await loadProject(slug, home))
  return projects
}

export async function getProjectById(id: string, home?: string): Promise<Project> {
  const projects = await listProjects(home)
  const project = projects.find((item) => item.id === id)
  if (!project) throw new ProjectStoreError(`Project not found: ${id}`)
  return project
}

/** Read only one project. Does not create home, project folders, SQLite sidecars or migrations. */
export async function inspectProject(slug: string, home?: string): Promise<Project> {
  return loadProject(slug, home, true)
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
  slug: string,
  home: string | undefined,
  readonly = false,
): Promise<Project> {
  await requireDirectory(projectDirectory(slug, home))
  await requireDirectory(join(projectDirectory(slug, home), 'db'))
  const file = databasePath(slug, home)
  await requireRegularFile(file)
  const database = openProjectDatabase(file, readonly)
  try {
    const orm = drizzle({ client: database })
    const rows = orm.select().from(projectInfo).all()
    if (rows.length !== 1 || rows[0]?.slug !== slug) {
      throw new ProjectStoreError(`Project database metadata does not match directory: ${slug}`)
    }
    return {
      id: rows[0].id,
      name: rows[0].name,
      slug,
      repositories: orm.select().from(repositories).all(),
    }
  } finally {
    database.close()
  }
}
