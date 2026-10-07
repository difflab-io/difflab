import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { execFile } from 'node:child_process'
import { cp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { createTempDirectory, expectFailureWith } from '../extensions/testx.js'
import { userPaths } from '../store/user-store.js'
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
    expect(names).toEqual(
      expect.arrayContaining([
        'spec-driven-plan',
        'software-architecture-design',
        'architecture-decision-record',
        'product-requirements-document',
        'code-review',
        'planning-intent',
        'ui-component-architecture',
        'pull-request-description',
        'flow-definition',
        'flow-instance',
        'exploration-summary',
        'exploration-research',
        'exploration-proposal',
        'poc-readme',
      ]),
    )
    expect(await readFile(join(home, '.difflab/templates/poc-readme.md'), 'utf8')).toContain(
      'base_commit:',
    )
    expect(await readdir(join(home, '.difflab/templates/examples'))).toHaveLength(10)
    for (const name of ['exploration-summary', 'exploration-research', 'exploration-proposal']) {
      expect(await readFile(join(home, `.difflab/templates/${name}.md`), 'utf8')).toContain('# ')
    }
    expect(await readFile(join(home, '.difflab/templates/spec-driven-plan.md'), 'utf8')).toContain(
      '## Intent',
    )
    expect(await readFile(join(home, '.difflab/templates/code-review.md'), 'utf8')).toContain(
      '## Change Requests',
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
    const built = await readFile(join(packageRoot, 'dist/index.js'), 'utf8')
    expect(built).toContain('Reusable global Agent Skill flow definition')
    expect(built).toContain('Definition SHA-256')
    expect(built).toContain('Source-grounded technical exploration summary')
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

  test('scaffolds inside an initialized project symlink without following other symlinks', async () => {
    // Arrange
    await configureGitRepo()
    const store = join(userPaths(home).projects, 'DIFFLAB', 'github.com--example--repo')
    await mkdir(store, { recursive: true })
    await symlink(store, join(cwd, '.difflab'))

    // Act
    const file = await service.scaffoldFromTemplate(
      'spec-driven-plan',
      cwd,
      '.difflab/plans/261005-example',
      'PLAN.md',
    )

    // Assert
    expect(file).toBe(await realpath(join(store, 'plans', '261005-example', 'PLAN.md')))
    expect(await readFile(file, 'utf8')).toContain('## Phases')
    await symlink(bundle, join(store, 'outside'))
    await expectFailureWith(
      service.scaffoldFromTemplate('spec-driven-plan', cwd, '.difflab/outside', 'escape.md'),
      'Symlink paths are not allowed',
    )
    await expectFailureWith(
      service.scaffoldFromTemplate('spec-driven-plan', cwd, '.difflab/../', 'escape.md'),
      'parent traversal',
    )
    await expectFailureWith(
      service.scaffoldFromTemplate('spec-driven-plan', '.', '.difflab/plans', 'PLAN.md'),
      'cwd must be an absolute path',
    )
  })

  test('scaffolds optional exploration artifacts in an initialized store without overwriting', async () => {
    // Arrange
    await configureGitRepo()
    const store = join(userPaths(home).projects, 'DIFFLAB', 'github.com--example--repo')
    await mkdir(store, { recursive: true })
    await symlink(store, join(cwd, '.difflab'))
    const root = '.difflab/explore/embedded-search'

    // Act
    const summary = await service.scaffoldFromTemplate(
      'exploration-summary',
      cwd,
      root,
      'SUMMARY.md',
    )
    const research = await service.scaffoldFromTemplate(
      'exploration-research',
      cwd,
      `${root}/research`,
      'ecosystem.md',
    )
    const proposal = await service.scaffoldFromTemplate(
      'exploration-proposal',
      cwd,
      `${root}/proposals`,
      'sqlite.md',
    )

    // Assert
    expect(summary).toBe(join(store, 'explore/embedded-search/SUMMARY.md'))
    expect(await readFile(summary, 'utf8')).toContain('## Evidence and freshness')
    expect(await readFile(research, 'utf8')).toContain('## Sources fetched')
    expect(await readFile(proposal, 'utf8')).toContain('## Trade-offs')
    for (const [name, path, filename, file] of [
      ['exploration-summary', root, 'SUMMARY.md', summary],
      ['exploration-research', `${root}/research`, 'ecosystem.md', research],
      ['exploration-proposal', `${root}/proposals`, 'sqlite.md', proposal],
    ] as const) {
      const previous = await readFile(file, 'utf8')
      await expectFailureWith(
        service.scaffoldFromTemplate(name, cwd, path, filename),
        'Destination already exists',
      )
      expect(await readFile(file, 'utf8')).toBe(previous)
    }
  })

  test('scaffolds global definitions and local instances without overwriting customizations', async () => {
    // Arrange
    await configureGitRepo()
    const global = join(home, '.difflab')
    const store = join(userPaths(home).projects, 'DIFFLAB', 'github.com--example--repo')
    await mkdir(store, { recursive: true })
    await symlink(store, join(cwd, '.difflab'))
    await service.listTemplates()
    await writeFile(join(global, 'templates/flow-definition.md'), '# Customized flow\n')

    // Act
    const definition = await service.scaffoldFromTemplate(
      'flow-definition',
      global,
      'flows',
      'example.md',
    )
    const instance = await service.scaffoldFromTemplate(
      'flow-instance',
      cwd,
      '.difflab/flows/261005-example',
      'FLOW.md',
    )

    // Assert
    expect(await readFile(definition, 'utf8')).toBe('# Customized flow\n')
    expect(instance).toBe(await realpath(join(store, 'flows/261005-example/FLOW.md')))
    expect(await readFile(instance, 'utf8')).toContain('## Selected flags and permissions')
    await expectFailureWith(
      service.scaffoldFromTemplate('flow-definition', global, 'flows', 'example.md'),
      'already exists',
    )
    await expectFailureWith(
      service.scaffoldFromTemplate(
        'flow-instance',
        cwd,
        '.difflab/flows/261005-example',
        'FLOW.md',
      ),
      'already exists',
    )
    await symlink(bundle, join(global, 'outside'))
    await expectFailureWith(
      service.scaffoldFromTemplate('flow-definition', global, 'outside', 'escape.md'),
      'Symlink paths are not allowed',
    )
    expect(await readFile(definition, 'utf8')).toBe('# Customized flow\n')
  })

  test('shares one global definition across distinct initialized repositories', async () => {
    // Arrange
    const second = join(directory.path, 'second-repo')
    await mkdir(second)
    for (const root of [cwd, second]) {
      await execFileAsync('git', ['init', '-q'], { cwd: root })
      await execFileAsync(
        'git',
        [
          'remote',
          'add',
          'origin',
          `https://github.com/example/${root === cwd ? 'repo' : 'second'}.git`,
        ],
        { cwd: root },
      )
      await writeFile(join(root, 'difflab.yaml'), 'schemaVersion: 1\nproject:\n  id: DIFFLAB\n')
      const slug = root === cwd ? 'repo' : 'second'
      const store = join(userPaths(home).projects, 'DIFFLAB', `github.com--example--${slug}`)
      await mkdir(store, { recursive: true })
      await symlink(store, join(root, '.difflab'))
    }
    const definition = await service.scaffoldFromTemplate(
      'flow-definition',
      join(home, '.difflab'),
      'flows',
      'shared.md',
    )

    // Act
    const first = await service.scaffoldFromTemplate(
      'flow-instance',
      cwd,
      '.difflab/flows/261005-shared',
      'FLOW.md',
    )
    const other = await service.scaffoldFromTemplate(
      'flow-instance',
      second,
      '.difflab/flows/261005-shared',
      'FLOW.md',
    )

    // Assert
    expect(first).not.toBe(other)
    expect(await readFile(definition, 'utf8')).toContain('## Steps')
    expect(await readFile(first, 'utf8')).toBe(await readFile(other, 'utf8'))
    await expectFailureWith(
      service.scaffoldFromTemplate('flow-definition', join(home, '.difflab'), 'flows', 'shared.md'),
      'already exists',
    )
  })

  test('rejects a project link outside the user project store', async () => {
    // Arrange
    await configureGitRepo()
    await symlink(bundle, join(cwd, '.difflab'))

    // Act / Assert
    await expectFailureWith(
      service.scaffoldFromTemplate('spec-driven-plan', cwd, '.difflab/plans', 'PLAN.md'),
      'links elsewhere',
    )
    await expectFailureWith(readFile(join(bundle, 'plans', 'PLAN.md')), 'ENOENT')
  })

  test('rejects a link to another valid project store under the same home', async () => {
    // Arrange
    await configureGitRepo()
    const projects = userPaths(home).projects
    const expected = join(projects, 'DIFFLAB', 'github.com--example--repo')
    const unrelated = join(projects, 'OTHER', 'github.com--example--other')
    await mkdir(expected, { recursive: true })
    await mkdir(unrelated, { recursive: true })
    await symlink(unrelated, join(cwd, '.difflab'))

    // Act / Assert
    await expectFailureWith(
      service.scaffoldFromTemplate('code-review', cwd, '.difflab/reviews', 'REVIEW.md'),
      'links elsewhere',
    )
    await expectFailureWith(readFile(join(unrelated, 'reviews', 'REVIEW.md')), 'ENOENT')
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

// Helpers ---------------------------------------------------------------------
async function configureGitRepo(): Promise<void> {
  await execFileAsync('git', ['init', '-q'], { cwd })
  await execFileAsync('git', ['remote', 'add', 'origin', 'https://github.com/example/repo.git'], {
    cwd,
  })
  await writeFile(join(cwd, 'difflab.yaml'), 'schemaVersion: 1\nproject:\n  id: DIFFLAB\n')
}
