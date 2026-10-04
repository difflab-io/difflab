import { randomUUID } from 'node:crypto'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { ProjectConflictError, scanProjectsUnlocked, type Repository } from './projects.js'
import {
  databasePath,
  openProjectDatabase,
  ProjectStoreError,
  withRegistryLock,
} from './registry.js'
import { repositories } from './schema.js'

// API -------------------------------------------------------------------------
export function canonicalGithubUrl(value: string): string {
  let pathname: string
  if (/^git@github\.com:/i.test(value)) {
    pathname = value.replace(/^git@github\.com:/i, '/')
  } else {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      throw new ProjectStoreError('Git origin must be a GitHub HTTPS or SSH URL')
    }
    if (
      (url.protocol !== 'https:' && url.protocol !== 'ssh:') ||
      url.hostname.toLowerCase() !== 'github.com' ||
      url.port ||
      (url.protocol === 'https:' && url.username !== '') ||
      (url.protocol === 'ssh:' && url.username !== 'git') ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new ProjectStoreError('Git origin must be a GitHub HTTPS or SSH URL')
    }
    pathname = url.pathname
  }
  const match = /^\/([a-z0-9-]+)\/([a-z0-9._-]+?)(?:\.git)?\/?$/i.exec(pathname)
  if (!match || !match[1] || !match[2] || match[2] === '.' || match[2] === '..') {
    throw new ProjectStoreError('Git origin must identify a GitHub owner and repository')
  }
  return `https://github.com/${match[1].toLowerCase()}/${match[2].toLowerCase()}`
}

export function repositorySlug(githubUrl: string): string {
  const [owner, repo] = canonicalGithubUrl(githubUrl).slice('https://github.com/'.length).split('/')
  return `${owner}--${repo}`
}

export async function linkRepository(
  projectId: string,
  origin: string,
  home?: string,
): Promise<Repository> {
  const githubUrl = canonicalGithubUrl(origin)
  const slug = repositorySlug(githubUrl)
  return withRegistryLock(home, async () => {
    const projects = await scanProjectsUnlocked(home)
    const project = projects.find((item) => item.id === projectId)
    if (!project) throw new ProjectStoreError(`Project not found: ${projectId}`)
    for (const existingProject of projects) {
      const existing = existingProject.repositories.find((item) => item.githubUrl === githubUrl)
      if (existing) {
        if (existingProject.id === projectId) return existing
        throw new ProjectConflictError(
          `GitHub repository already belongs to project ${existingProject.name}`,
        )
      }
    }
    if (project.repositories.some((repo) => repo.slug === slug)) {
      throw new ProjectConflictError(`Repository directory already exists in project: ${slug}`)
    }
    const database = openProjectDatabase(databasePath(project.slug, home))
    try {
      const repository: Repository = { id: randomUUID(), projectId, githubUrl, slug }
      drizzle({ client: database }).insert(repositories).values(repository).run()
      return repository
    } finally {
      database.close()
    }
  })
}
