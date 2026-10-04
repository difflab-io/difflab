import { lstat, readlink } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { dataRoot, inspectProject } from 'difflab-db'
import { ProjectSetupError } from '../errors.js'
import { hasLocalExclusion } from './exclusion.js'
import { discoverGitRepository } from './git.js'
import { readManifest } from './manifest.js'

// API -------------------------------------------------------------------------
export async function readProjectContext(cwd: string, home?: string) {
  if (!isAbsolute(cwd) || !(await lstat(cwd)).isDirectory()) {
    throw new ProjectSetupError('cwd must be an absolute existing directory')
  }
  const git = discoverGitRepository(cwd)
  const manifest = await readManifest(git.root)
  if (!manifest) throw new ProjectSetupError(`Missing difflab.yaml in ${git.root}`)
  if (manifest.repository.github !== git.githubUrl) {
    throw new ProjectSetupError('difflab.yaml does not match the current Git origin')
  }
  if (!(await hasLocalExclusion(git.excludePath))) {
    throw new ProjectSetupError('Git info/exclude is missing the local /.difflab entry')
  }
  const link = join(git.root, '.difflab')
  const entry = await lstat(link)
  if (!entry.isSymbolicLink()) throw new ProjectSetupError(`Expected a .difflab symlink at ${link}`)
  const destination = await readlink(link)
  const target = resolve(git.root, destination)
  const localRoot = dataRoot(home)
  const base = join(localRoot, 'projects')
  if (!(await lstat(localRoot)).isDirectory() || !(await lstat(base)).isDirectory()) {
    throw new ProjectSetupError('Local Difflab project registry is not a regular directory')
  }
  const parts = relative(base, target).split(sep)
  if (parts.length !== 2 || parts.some((part) => !part || part === '..' || part === '.')) {
    throw new ProjectSetupError(`.difflab points outside a project repository directory: ${link}`)
  }
  const [projectSlug, repoSlug] = parts as [string, string]
  if (repoSlug !== git.slug)
    throw new ProjectSetupError('.difflab points to a different GitHub repository')
  if (!(await lstat(target)).isDirectory())
    throw new ProjectSetupError('.difflab target is not a directory')

  const project = await inspectProject(projectSlug, home)
  if (project.id !== manifest.project.id)
    throw new ProjectSetupError('difflab.yaml refers to a different project database')
  const repository = project.repositories.find(
    (item) => item.githubUrl === git.githubUrl && item.slug === repoSlug,
  )
  if (!repository || repository.projectId !== project.id) {
    throw new ProjectSetupError('Repository is not registered in the selected project database')
  }
  return {
    project: { id: project.id, name: project.name, slug: project.slug },
    repository: { id: repository.id, github: repository.githubUrl, slug: repository.slug },
    root: git.root,
  }
}
