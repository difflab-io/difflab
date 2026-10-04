import { ProjectStoreError } from './registry.js'

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
