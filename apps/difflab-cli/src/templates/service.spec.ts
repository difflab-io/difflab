import { afterEach, describe, expect, test } from 'bun:test'
import { execFile } from 'node:child_process'
import { mkdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { parse, stringify } from 'yaml'
import { createTempDirectory, expectFailureWith } from 'utils/testx'
import { userPaths } from '../store/user-store.js'
import { TemplateService } from './service.js'

// Setup -----------------------------------------------------------------------
const cleanups: (() => Promise<void>)[] = []
const execFileAsync = promisify(execFile)

// Tests -----------------------------------------------------------------------
describe('YAML review rubric scaffolding', () => {
  test('installs and scaffolds customized criteria into the project store without overwriting', async () => {
    // Arrange
    const directory = await createTempDirectory('difflab-rubric-')
    cleanups.push(directory.cleanup)
    const home = join(directory.path, 'home')
    const cwd = join(directory.path, 'repo')
    await mkdir(home)
    await mkdir(cwd)
    await execFileAsync('git', ['init', '-q'], { cwd })
    await execFileAsync('git', ['remote', 'add', 'origin', 'https://github.com/example/repo.git'], {
      cwd,
    })
    await writeFile(join(cwd, 'difflab.yaml'), 'schemaVersion: 1\nproject:\n  id: DIFFLAB\n')
    const store = join(userPaths(home).projects, 'DIFFLAB', 'github.com--example--repo')
    await mkdir(store, { recursive: true })
    await symlink(store, join(cwd, '.difflab'))
    const service = new TemplateService({ home })
    const catalog = await service.listTemplates()
    const installed = join(home, '.difflab/templates/code-review-rubric.yaml')
    const rubric = parse(await readFile(installed, 'utf8'))
    rubric.sections[0].criteria[0].issue = 'Project-specific intent requirement.'
    const customized = stringify(rubric)
    await writeFile(installed, customized)

    // Act
    const report = await service.scaffoldFromTemplate(
      'code-review',
      cwd,
      '.difflab/reviews/261025-example',
      'REVIEW.md',
    )
    const file = await service.scaffoldFromTemplate(
      'code-review-rubric',
      cwd,
      '.difflab/reviews/261025-example',
      'rubric.yaml',
    )
    await service.listTemplates()

    // Assert
    expect(await readFile(report, 'utf8')).toContain('## Overall Assessment')
    expect(catalog).toContainEqual(
      expect.objectContaining({ name: 'code-review-rubric', asset: 'code-review-rubric.yaml' }),
    )
    expect(file).toBe(await realpath(join(store, 'reviews/261025-example/rubric.yaml')))
    expect(await readFile(file, 'utf8')).toBe(customized)
    expect(await readFile(installed, 'utf8')).toBe(customized)
    expect(parse(await readFile(file, 'utf8')).sections[0].criteria[0].results).toEqual([])
    await expectFailureWith(
      service.scaffoldFromTemplate(
        'code-review-rubric',
        cwd,
        '.difflab/reviews/261025-example',
        'rubric.yaml',
      ),
      'Destination already exists',
    )
    expect(await readFile(file, 'utf8')).toBe(customized)
  })
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
})
