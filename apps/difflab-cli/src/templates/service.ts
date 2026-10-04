import { constants } from 'node:fs'
import { lstat, open, rm } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureFileParent } from '../extensions/fsx.js'
import { resolveHomeDirectory, hasErrorCode } from '../extensions/osx.js'
import { resolvePath } from '../extensions/pathx.js'

// Constants -------------------------------------------------------------------
const catalog = [
  { name: 'spec-driven-plan', description: 'Spec-driven implementation plan' },
  { name: 'software-architecture-design', description: 'Software architecture design' },
  { name: 'architecture-decision-record', description: 'Architecture decision record' },
  { name: 'product-requirements-document', description: 'Product requirements document' },
  { name: 'code-review', description: 'Thorough code review' },
  { name: 'planning-intent', description: 'Planning intent for a user to fill in' },
  { name: 'ui-component-architecture', description: 'UI component design and implementation' },
  { name: 'pull-request-description', description: 'Draft pull request description' },
] as const
const examples = [
  'plan-feature.md',
  'plan-migration.md',
  'design-service.md',
  'adr-storage.md',
  'prd-onboarding.md',
  'review-change.md',
  'intent-request.md',
  'component-dialog.md',
  'component-navigation.md',
  'pull-request-feature.md',
] as const
const assets = [
  ...catalog.map(({ name }) => `${name}.md`),
  ...examples.map((name) => join('examples', name)),
]

// Types -----------------------------------------------------------------------
export type TemplateInfo = (typeof catalog)[number]
export type TemplateServiceOptions = { home?: string; bundle?: string }

export class TemplateError extends Error {}
export class UnknownTemplateError extends TemplateError {}
export class TemplateSourceError extends TemplateError {}
export class TemplateDestinationExistsError extends TemplateError {}

// API -------------------------------------------------------------------------
export class TemplateService {
  private readonly home: string
  private readonly bundle: string

  constructor(options: TemplateServiceOptions = {}) {
    this.home = resolveHomeDirectory(options.home)
    this.bundle = options.bundle ?? defaultBundleDirectory()
  }

  async listTemplates(): Promise<TemplateInfo[]> {
    await this.installMissing()
    return [...catalog]
  }

  async scaffoldFromTemplate(
    name: string,
    cwd: string,
    path: string,
    filename: string,
  ): Promise<string> {
    if (!catalog.some((item) => item.name === name)) {
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
    const destination = await ensureFileParent(cwd, join(path, filename))
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
  private async installMissing(): Promise<void> {
    for (const asset of assets) {
      const relative = join('.difflab', 'templates', asset)
      const destination = await ensureFileParent(this.home, relative)
      const source = await resolvePath(dirname(this.bundle), join(basename(this.bundle), asset))
      try {
        if ((await lstat(destination)).isSymbolicLink()) {
          throw new TemplateSourceError(`Installed template asset is a symlink: ${destination}`)
        }
        await readMarkdown(destination)
      } catch (error) {
        if (!hasErrorCode(error, 'ENOENT')) throw error
        const content = await readMarkdown(source)
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
function defaultBundleDirectory(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url))
  return resolve(moduleDir, basename(moduleDir) === 'dist' ? '../templates' : '../../templates')
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
