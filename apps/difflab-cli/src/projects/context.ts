import { MissingRepoConfig } from '../errors.js'
import { discoverGitRepository } from '../extensions/gitx.js'
import { readRepoConfig } from './config.js'
import { inspectRepository, type RepositoryContext } from './repo-store.js'

/** Read the non-mutating project context for an initialized repository. */
export async function readProjectContext(
  cwd = process.cwd(),
  home?: string,
): Promise<RepositoryContext> {
  const git = discoverGitRepository(cwd)
  const config = await readRepoConfig(git.root)
  if (!config) throw new MissingRepoConfig(`Missing difflab.yaml in ${git.root}`)
  return inspectRepository(git, config.project.id, home)
}
