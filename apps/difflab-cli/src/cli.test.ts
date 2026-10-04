import { describe, expect, test } from 'bun:test'
import { createProgram } from './cli'

// Tests -----------------------------------------------------------------------
describe('commander CLI', () => {
  test('shows help when no command is supplied', async () => {
    const output: string[] = []
    const program = createProgram()
    program.configureOutput({ writeOut: (message) => output.push(message) })

    await program.parseAsync([], { from: 'user' })

    expect(output.join('')).toContain('Usage: difflab')
    expect(output.join('')).toContain('mcp')
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
})
