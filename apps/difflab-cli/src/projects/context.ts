import { lstat, readlink } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { dataRoot, inspectProject } from 'difflab-db'
import { MissingGlobalConfig, MissingRepoConfig, ProjectSetupError } from '../errors.js'
import { discoverGitRepository } from '../extensions/gitx.js'
import { readRepoConfig } from './config.js'

// API -------------------------------------------------------------------------
export async function readProjectContext(cwd: string, home?: string) {
  if (!isAbsolute(cwd) || !(await lstat(cwd)).isDirectory()) {
    throw new ProjectSetupError('cwd must be an absolute existing directory')
  }
  const git = discoverGitRepository(cwd)
  const config = await readRepoConfig(git.root)
  if (!config) throw new MissingRepoConfig(`Missing difflab.yaml in ${git.root}`)
  if (config.repository.github !== git.githubUrl) {
    throw new ProjectSetupError('difflab.yaml does not match the current Git origin')
  }
  const link = join(git.root, '.difflab')
  const entry = await lstat(link)
  if (!entry.isSymbolicLink()) throw new ProjectSetupError(`Expected a .difflab symlink at ${link}`)
  const destination = await readlink(link)
  const target = resolve(git.root, destination)
  const localRoot = dataRoot(home)
  const base = join(localRoot, 'projects')
  try {
    if (!(await lstat(localRoot)).isDirectory() || !(await lstat(base)).isDirectory())
      throw new Error('not a directory')
  } catch (error) {
    throw new MissingGlobalConfig(`Missing or invalid global Difflab setup at ${localRoot}`, {
      cause: error,
    } as ErrorOptions)
  }
  const parts = relative(base, target).split(sep)
  if (parts.length !== 2 || parts.some((part) => !part || part === '..' || part === '.')) {
    throw new ProjectSetupError(`.difflab points outside a project repository directory: ${link}`)
  }
  const [projectKey, repoSlug] = parts as [string, string]
  if (repoSlug !== git.slug)
    throw new ProjectSetupError('.difflab points to a different GitHub repository')
  if (!(await lstat(target)).isDirectory())
    throw new ProjectSetupError('.difflab target is not a directory')

  const project = await inspectProject(projectKey, home)
  if (project.id !== config.project.id)
    throw new ProjectSetupError('difflab.yaml refers to a different project database')
  const repository = project.repositories.find(
    (item) => item.githubUrl === git.githubUrl && item.slug === repoSlug,
  )
  if (!repository || repository.projectId !== project.id) {
    throw new ProjectSetupError('Repository is not registered in the selected project database')
  }
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
