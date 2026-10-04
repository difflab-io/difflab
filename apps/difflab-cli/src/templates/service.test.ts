import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { cp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createTempDirectory, expectFailureWith } from '../extensions/testx.js'
import { TemplateService, UnknownTemplateError } from './service.js'

// Setup -----------------------------------------------------------------------
let directory: Awaited<ReturnType<typeof createTempDirectory>>
let home: string
let bundle: string
let cwd: string
let service: TemplateService

beforeEach(async () => {
  directory = await createTempDirectory('difflab-templates-')
  home = join(directory.path, 'home')
  bundle = join(directory.path, 'bundle')
  cwd = join(directory.path, 'work')
  await mkdir(home)
  await mkdir(cwd)
  await cp(join(import.meta.dir, '..', '..', 'templates'), bundle, { recursive: true })
  service = new TemplateService({ home, bundle })
})

// Tests -----------------------------------------------------------------------
describe('TemplateService', () => {
  test('lists eight hyphenated templates and installs templates and examples', async () => {
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

  test('rejects missing, empty, and symlinked sources', async () => {
    await rm(join(bundle, 'spec-driven-plan.md'))
    await expectFailureWith(
      service.scaffoldFromTemplate('spec-driven-plan', cwd, '.', 'output.md'),
      'Cannot read template asset',
    )
    await writeFile(join(bundle, 'spec-driven-plan.md'), '  \n')
    await expectFailureWith(
      service.scaffoldFromTemplate('spec-driven-plan', cwd, '.', 'output.md'),
      'Template is empty',
    )
    await rm(join(bundle, 'spec-driven-plan.md'))
    await symlink(
      join(bundle, 'software-architecture-design.md'),
      join(bundle, 'spec-driven-plan.md'),
    )
    await expectFailureWith(
      service.scaffoldFromTemplate('spec-driven-plan', cwd, '.', 'output.md'),
      'Symlink paths are not allowed',
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
