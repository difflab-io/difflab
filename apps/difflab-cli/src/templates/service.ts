import { constants } from 'node:fs'
import { lstat, mkdir, open, rm } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { ensurePathDirsExist, lstatOrNull } from 'utils/fsx'
import { canonicalGitUrl, discoverGitRepository, repositorySlug } from 'utils/gitx'
import { hasErrorCode, resolveHomeDirectory } from 'utils/osx'
import { resolvePath } from 'utils/pathx'
import { readRepoConfig, resolveDifflabPaths, type DifflabPaths } from 'difflab-config'
import { checkRepoStore } from '../projects/repo-store.js'
import { embeddedSource, type TemplateInfo, type TemplateSource } from './source.js'

// Types -----------------------------------------------------------------------
export type { TemplateInfo } from './source.js'
export type TemplateServiceOptions = { home?: string; source?: TemplateSource }
export type TemplateInspection = {
  directory: string
  total: number
  missing: string[]
  outdated: string[]
}

export class TemplateError extends Error {}
export class UnknownTemplateError extends TemplateError {}
export class TemplateSourceError extends TemplateError {}
export class TemplateDestinationExistsError extends TemplateError {}

// API -------------------------------------------------------------------------
export class TemplateService {
  private readonly paths: DifflabPaths
  private readonly source: TemplateSource

  constructor(options: TemplateServiceOptions = {}) {
    if (options.home !== undefined) {
      this.paths = resolveDifflabPaths(resolveHomeDirectory(options.home))
    } else if (process.env.DIFFLAB_HOME?.trim()) {
      this.paths = resolveDifflabPaths()
    } else {
      this.paths = resolveDifflabPaths(resolveHomeDirectory())
    }
    this.source = options.source ?? embeddedSource
  }

  async listTemplates(): Promise<TemplateInfo[]> {
    await this.installMissing()
    return [...this.source.catalog]
  }

  async inspectTemplates(): Promise<TemplateInspection> {
    const directory = join(this.paths.root, 'templates')
    const missing: string[] = []
    const outdated: string[] = []
    for (const asset of this.source.assets) {
      const installed = join(directory, asset)
      const entry = await lstatOrNull(installed)
      if (!entry || !entry.isFile() || entry.isSymbolicLink()) {
        missing.push(asset)
        continue
      }
      const [installedContent, bundledContent] = await Promise.all([
        readTemplate(installed),
        readSource(this.source, asset),
      ])
      if (installedContent !== bundledContent) {
        outdated.push(asset)
      }
    }
    return { directory, total: this.source.assets.length, missing, outdated }
  }

  async scaffoldFromTemplate(
    name: string,
    cwd: string,
    path: string,
    filename: string,
  ): Promise<string> {
    const template = this.source.catalog.find((item) => item.name === name)
    if (!template) {
      throw new UnknownTemplateError(`Unknown template: ${name}`)
    }
    if (!path.trim() || isAbsolute(path)) {
      throw new TemplateError('path must be a non-empty relative directory inside cwd')
    }
    if (!filename.trim() || filename === '.' || filename === '..' || /[/\\\0]/.test(filename)) {
      throw new TemplateError('filename must be a single non-empty file name')
    }
    await this.installMissing()
    const installed = await resolvePath(
      this.paths.root,
      join('templates', template.asset ?? `${name}.md`),
    )
    const contents = await readTemplate(installed)
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
      this.paths.projects,
      config.project.id,
      repositorySlug(canonicalGitUrl(git.originUrl)),
    )
    await checkRepoStore(git.root, target)
    return ensurePathDirsExist(join(path, filename), target)
  }

  private async installMissing(): Promise<void> {
    const rootEntry = await lstatOrNull(this.paths.root)
    if (rootEntry?.isSymbolicLink()) {
      throw new TemplateSourceError(`Difflab state root is a symlink: ${this.paths.root}`)
    }
    if (!rootEntry) {
      await mkdir(this.paths.root, { recursive: true, mode: 0o700 })
    }
    for (const asset of this.source.assets) {
      const relative = join('templates', asset)
      const destination = await ensurePathDirsExist(relative, this.paths.root)
      try {
        if ((await lstat(destination)).isSymbolicLink()) {
          throw new TemplateSourceError(`Installed template asset is a symlink: ${destination}`)
        }
        await readTemplate(destination)
      } catch (error) {
        if (!hasErrorCode(error, 'ENOENT')) throw error
        const content = await readSource(this.source, asset)
        try {
          await createExclusive(destination, content)
        } catch (writeError) {
          if (!hasErrorCode(writeError, 'EEXIST')) throw writeError
          await readTemplate(destination)
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

async function readTemplate(path: string): Promise<string> {
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
