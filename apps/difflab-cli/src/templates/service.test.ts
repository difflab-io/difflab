import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { execFile } from 'node:child_process'
import { cp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { createTempDirectory, expectFailureWith } from '../extensions/testx.js'
import { TemplateService, UnknownTemplateError } from './service.js'
import { embeddedSource } from './source.js'

// Setup -----------------------------------------------------------------------
let directory: Awaited<ReturnType<typeof createTempDirectory>>
let home: string
let bundle: string
let cwd: string
let service: TemplateService
const execFileAsync = promisify(execFile)

beforeEach(async () => {
  directory = await createTempDirectory('difflab-templates-')
  home = join(directory.path, 'home')
  bundle = join(directory.path, 'bundle')
  cwd = join(directory.path, 'work')
  await mkdir(home)
  await mkdir(cwd)
  await cp(join(import.meta.dir, '..', '..', 'templates'), bundle, { recursive: true })
  service = new TemplateService({
    home,
    source: {
      ...embeddedSource,
      read: (asset) => readFile(join(bundle, asset), 'utf8'),
    },
  })
})

// Tests -----------------------------------------------------------------------
describe('TemplateService', () => {
  test('lists and installs every bundled template and example asset', async () => {
    const names = (await service.listTemplates()).map(({ name }) => name)
    expect(names).toEqual([
      'spec-driven-plan',
      'software-architecture-design',
      'architecture-decision-record',
      'product-requirements-document',
      'code-review',
      'planning-intent',
      'ui-component-architecture',
      'pull-request-description',
    ])
    expect(await readdir(join(home, '.difflab/templates/examples'))).toHaveLength(10)
    expect(await readFile(join(home, '.difflab/templates/spec-driven-plan.md'), 'utf8')).toContain(
      '## Intent',
    )
    expect(
      await readFile(join(home, '.difflab/templates/pull-request-description.md'), 'utf8'),
    ).toContain('{{intent}}')
    expect(
      await readFile(join(home, '.difflab/templates/examples/component-dialog.md'), 'utf8'),
    ).toContain('## Design')
  })

  test('npm package contains the built CLI without raw template assets', async () => {
    const packageRoot = join(import.meta.dir, '..', '..')
    await execFileAsync('bun', ['run', 'build'], { cwd: packageRoot })
    const { stdout } = await execFileAsync('npm', ['pack', '--json', '--dry-run'], {
      cwd: packageRoot,
    })
    const packageContents = JSON.parse(stdout)[0].files.map(({ path }: { path: string }) => path)

    expect(packageContents).not.toContain('templates/spec-driven-plan.md')
    expect(packageContents).toContain('dist/index.js')
  })

  test('lists and scaffolds templates from a custom source', async () => {
    await writeFile(join(bundle, 'custom-template.md'), '# Custom template\\n')
    const customService = new TemplateService({
      home,
      source: {
        ...embeddedSource,
        catalog: [{ name: 'custom-template', description: 'Custom template' }],
        assets: ['custom-template.md'],
        read: (asset) => readFile(join(bundle, asset), 'utf8'),
      },
    })

    expect(await customService.listTemplates()).toEqual([
      { name: 'custom-template', description: 'Custom template' },
    ])
    const file = await customService.scaffoldFromTemplate('custom-template', cwd, '.', 'custom.md')
    expect(await readFile(file, 'utf8')).toBe('# Custom template\\n')
  })

  test('uses embedded templates by default when scaffolding', async () => {
    const defaultService = new TemplateService({ home })
    const file = await defaultService.scaffoldFromTemplate('spec-driven-plan', cwd, '.', 'PLAN.md')
    expect(await readFile(file, 'utf8')).toContain('## Intent')
  })

  test('scaffolds installed customizations and never overwrites existing files', async () => {
    await service.listTemplates()
    await writeFile(join(home, '.difflab/templates/spec-driven-plan.md'), '# My customized plan\n')
    const file = await service.scaffoldFromTemplate(
      'spec-driven-plan',
      cwd,
      'nested/deep',
      'my-plan.md',
    )
    expect(file).toBe(await realpath(join(cwd, 'nested/deep/my-plan.md')))
    expect(await readFile(file, 'utf8')).toBe('# My customized plan\n')
    await expectFailureWith(
      service.scaffoldFromTemplate('spec-driven-plan', cwd, 'nested/deep', 'my-plan.md'),
      'Destination already exists',
    )
    expect(await readFile(file, 'utf8')).toBe('# My customized plan\n')
    await service.listTemplates()
    expect(await readFile(join(home, '.difflab/templates/spec-driven-plan.md'), 'utf8')).toBe(
      '# My customized plan\n',
    )
  })

  test('installs newly available assets without replacing existing user copies', async () => {
    await service.listTemplates()
    const installed = join(home, '.difflab/templates/examples/plan-migration.md')
    await rm(installed)
    await writeFile(join(home, '.difflab/templates/spec-driven-plan.md'), '# My plan\n')
    await service.listTemplates()
    expect(await readFile(installed, 'utf8')).toContain('# Move activity history')
    expect(await readFile(join(home, '.difflab/templates/spec-driven-plan.md'), 'utf8')).toBe(
      '# My plan\n',
    )
  })

  test('rejects unknown names without creating a destination', async () => {
    await expect(
      service.scaffoldFromTemplate('../spec-driven-plan', cwd, '.', 'output.md'),
    ).rejects.toBeInstanceOf(UnknownTemplateError)
    await expectFailureWith(readFile(join(cwd, 'output.md')), 'ENOENT')
  })

  test('rejects missing injected sources', async () => {
    await rm(join(bundle, 'spec-driven-plan.md'))
    await expectFailureWith(
      service.scaffoldFromTemplate('spec-driven-plan', cwd, '.', 'output.md'),
      'Cannot read template asset',
    )
  })

  test('rejects empty injected sources', async () => {
    await writeFile(join(bundle, 'spec-driven-plan.md'), '  \n')
    await expectFailureWith(
      service.scaffoldFromTemplate('spec-driven-plan', cwd, '.', 'output.md'),
      'Template is empty',
    )
  })

  test('rejects symlinked installed files instead of replacing them', async () => {
    await service.listTemplates()
    const installed = join(home, '.difflab/templates/architecture-decision-record.md')
    await rm(installed)
    await symlink(join(bundle, 'architecture-decision-record.md'), installed)
    await expectFailureWith(
      service.scaffoldFromTemplate('architecture-decision-record', cwd, '.', 'output.md'),
      'Symlink paths are not allowed',
    )
  })

  test('rejects traversal, absolute paths, symlinks, and missing cwd', async () => {
    await expectFailureWith(
      service.scaffoldFromTemplate('spec-driven-plan', cwd, '../', 'escape.md'),
      'parent traversal',
    )
    await expectFailureWith(
      service.scaffoldFromTemplate('spec-driven-plan', cwd, '/tmp', 'escape.md'),
      'relative directory',
    )
    for (const filename of ['../escape.md', 'nested/file.md', '..', '']) {
      await expectFailureWith(
        service.scaffoldFromTemplate('spec-driven-plan', cwd, '.', filename),
        'filename must be a single',
      )
    }
    await symlink(home, join(cwd, 'link'))
    await expectFailureWith(
      service.scaffoldFromTemplate('spec-driven-plan', cwd, 'link', 'escape.md'),
      'Symlink paths are not allowed',
    )
    await expectFailureWith(
      service.scaffoldFromTemplate('spec-driven-plan', join(cwd, 'missing'), '.', 'file.md'),
      'ENOENT',
    )
  })

  test('fails on a corrupt installed template without creating a destination', async () => {
    await service.listTemplates()
    await writeFile(join(home, '.difflab/templates/spec-driven-plan.md'), '')
    await expectFailureWith(
      service.scaffoldFromTemplate('spec-driven-plan', cwd, '.', 'PLAN.md'),
      'Template is empty',
    )
    await expectFailureWith(readFile(join(cwd, 'PLAN.md')), 'ENOENT')
  })
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await directory.cleanup()
})
