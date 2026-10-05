import { constants } from 'node:fs'
import { lstat, open, rm } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { ensurePathDirsExist } from '../extensions/fsx.js'
import { resolveHomeDirectory, hasErrorCode } from '../extensions/osx.js'
import { resolvePath } from '../extensions/pathx.js'
import { canonicalGitUrl, discoverGitRepository, repositorySlug } from '../extensions/gitx.js'
import { readRepoConfig } from '../projects/config.js'
import { checkRepoStore } from '../projects/repo-store.js'
import { userPaths } from '../store/user-store.js'
import { embeddedSource, type TemplateInfo, type TemplateSource } from './source.js'

// Types -----------------------------------------------------------------------
export type { TemplateInfo } from './source.js'
export type TemplateServiceOptions = { home?: string; source?: TemplateSource }

export class TemplateError extends Error {}
export class UnknownTemplateError extends TemplateError {}
export class TemplateSourceError extends TemplateError {}
export class TemplateDestinationExistsError extends TemplateError {}

// API -------------------------------------------------------------------------
export class TemplateService {
  private readonly home: string
  private readonly source: TemplateSource

  constructor(options: TemplateServiceOptions = {}) {
    this.home = resolveHomeDirectory(options.home)
    this.source = options.source ?? embeddedSource
  }

  async listTemplates(): Promise<TemplateInfo[]> {
    await this.installMissing()
    return [...this.source.catalog]
  }

  async scaffoldFromTemplate(
    name: string,
    cwd: string,
    path: string,
    filename: string,
  ): Promise<string> {
    if (!this.source.catalog.some((item) => item.name === name)) {
      throw new UnknownTemplateError(`Unknown template: ${name}`)
    }
    if (!path.trim() || isAbsolute(path)) {
      throw new TemplateError('path must be a non-empty relative directory inside cwd')
    }
    if (!filename.trim() || filename === '.' || filename === '..' || /[/\\\0]/.test(filename)) {
      throw new TemplateError('filename must be a single non-empty file name')
    }
    await this.installMissing()
    const installed = await resolvePath(this.home, join('.difflab', 'templates', `${name}.md`))
    const contents = await readMarkdown(installed)
    const destination = path.startsWith('.difflab/')
      ? await this.projectDestination(cwd, path.slice('.difflab/'.length), filename)
      : await ensurePathDirsExist(join(path, filename), cwd)
    try {
      await createExclusive(destination, contents)
    } catch (error) {
      if (hasErrorCode(error, 'EEXIST')) {
        throw new TemplateDestinationExistsError(`Destination already exists: ${destination}`, {
          cause: error,
        })
      }
      throw error
    }
    return destination
  }

  // Helpers -------------------------------------------------------------------
  private async projectDestination(cwd: string, path: string, filename: string): Promise<string> {
    if (!isAbsolute(cwd)) throw new TemplateError('cwd must be an absolute path')
    const git = discoverGitRepository(cwd)
    const config = await readRepoConfig(git.root)
    if (!config)
      throw new TemplateError(`Initialize this repository with difflab init: ${git.root}`)
    const target = join(
      userPaths(this.home).projects,
      config.project.id,
      repositorySlug(canonicalGitUrl(git.originUrl)),
    )
    await checkRepoStore(git.root, target)
    return ensurePathDirsExist(join(path, filename), target)
  }

  private async installMissing(): Promise<void> {
    for (const asset of this.source.assets) {
      const relative = join('.difflab', 'templates', asset)
      const destination = await ensurePathDirsExist(relative, this.home)
      try {
        if ((await lstat(destination)).isSymbolicLink()) {
          throw new TemplateSourceError(`Installed template asset is a symlink: ${destination}`)
        }
        await readMarkdown(destination)
      } catch (error) {
        if (!hasErrorCode(error, 'ENOENT')) throw error
        const content = await readSource(this.source, asset)
        try {
          await createExclusive(destination, content)
        } catch (writeError) {
          if (!hasErrorCode(writeError, 'EEXIST')) throw writeError
          // Another process installed it first; verify it on the next pass.
          await readMarkdown(destination)
        }
      }
    }
  }
}

// Helpers ---------------------------------------------------------------------
async function readSource(source: TemplateSource, asset: string): Promise<string> {
  try {
    const content = await source.read(asset)
    if (!content.trim()) throw new TemplateSourceError(`Template is empty: ${asset}`)
    return content
  } catch (error) {
    if (error instanceof TemplateSourceError) throw error
    throw new TemplateSourceError(`Cannot read template asset: ${asset}`, { cause: error })
  }
}

async function readMarkdown(path: string): Promise<string> {
  let handle
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    if (!(await handle.stat()).isFile())
      throw new TemplateSourceError(`Template is not a file: ${path}`)
    const content = await handle.readFile('utf8')
    if (!content.trim()) throw new TemplateSourceError(`Template is empty: ${path}`)
    return content
  } catch (error) {
    if (error instanceof TemplateSourceError) throw error
    throw new TemplateSourceError(`Cannot read template asset: ${path}`, { cause: error })
  } finally {
    await handle?.close()
  }
}

async function createExclusive(path: string, content: string): Promise<void> {
  const handle = await open(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  )
  try {
    await handle.writeFile(content, 'utf8')
  } catch (error) {
    await handle.close()
    await rm(path, { force: true })
    throw error
  } finally {
    await handle.close()
  }
}
