import { afterEach, describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createTempDirectory } from 'utils/testx'
import { TemplateService } from './templates/service.js'
import { createProgram } from './cli'

// Setup -----------------------------------------------------------------------
const cleanups: (() => Promise<void>)[] = []

// Tests -----------------------------------------------------------------------
describe('commander CLI', () => {
  test('shows help when no command is supplied', async () => {
    const output: string[] = []
    const program = createProgram()
    program.configureOutput({ writeOut: (message) => output.push(message) })

    await program.parseAsync([], { from: 'user' })

    expect(output.join('')).toContain('Usage: difflab')
    expect(output.join('')).toContain('mcp')
    expect(output.join('')).toContain('templates')
    expect(output.join('')).not.toContain('Hello,')
  })

  for (const [name, args] of [
    ['all required values', ['project', 'add']],
    [
      'the project key',
      ['project', 'add', '--name', 'Project', '--repo', 'https://github.com/example/repo'],
    ],
    ['the project name', ['project', 'add', 'PRO', '--repo', 'https://github.com/example/repo']],
    ['a repository', ['project', 'add', 'PRO', '--name', 'Project']],
  ] as const) {
    test(`rejects missing ${name} without prompting`, async () => {
      const program = createProgram(() => {}, '0.1.0')

      await expect(program.parseAsync(args, { from: 'user' })).rejects.toThrow(
        'project add requires a project key, --name, and at least one --repo',
      )
    })
  }

  test('lists and scaffolds installed templates into a chosen directory', async () => {
    const directory = await createTempDirectory('difflab-cli-templates-')
    cleanups.push(directory.cleanup)
    const home = directory.path
    const service = new TemplateService({ home })
    const output: string[] = []

    await createProgram((message) => output.push(message), '0.1.0', {
      templateService: service,
    }).parseAsync(['templates', 'list'], { from: 'user' })
    await createProgram((message) => output.push(message), '0.1.0', {
      templateService: service,
    }).parseAsync(
      [
        'templates',
        'scaffold',
        'spec-driven-plan',
        'docs/nested',
        'custom-plan.md',
        '--cwd',
        directory.path,
      ],
      { from: 'user' },
    )

    expect(output.filter((line) => / — /.test(line))).toHaveLength(10)
    expect(output.at(-1)).toEndWith('docs/nested/custom-plan.md')
    expect(await readFile(join(home, 'docs/nested/custom-plan.md'), 'utf8')).toBe(
      await readFile(join(home, '.difflab/templates/spec-driven-plan.md'), 'utf8'),
    )
    await expect(
      createProgram(() => {}, '0.1.0', { templateService: service }).parseAsync(
        [
          'templates',
          'scaffold',
          'spec-driven-plan',
          'docs/nested',
          'custom-plan.md',
          '--cwd',
          directory.path,
        ],
        { from: 'user' },
      ),
    ).rejects.toThrow('Destination already exists')
    await expect(
      createProgram(() => {}, '0.1.0', { templateService: service }).parseAsync(
        ['templates', 'scaffold', 'not-a-template', '.', 'new.md', '--cwd', directory.path],
        { from: 'user' },
      ),
    ).rejects.toThrow('Unknown template')
    await expect(
      createProgram(() => {}, '0.1.0', { templateService: service }).parseAsync(
        ['templates', 'scaffold', 'spec-driven-plan', '../', 'escape.md', '--cwd', directory.path],
        { from: 'user' },
      ),
    ).rejects.toThrow('parent traversal')
  })
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
})
