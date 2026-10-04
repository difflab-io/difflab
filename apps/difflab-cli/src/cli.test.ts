import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listProjects } from 'difflab-db'
import { createProgram } from './cli'

// Tests -----------------------------------------------------------------------
describe('commander CLI', () => {
  test('shows help when no command is supplied', async () => {
    // Arrange
    const output: string[] = []
    const program = createProgram()
    program.configureOutput({ writeOut: (message) => output.push(message) })

    // Act
    await program.parseAsync([], { from: 'user' })

    // Assert
    expect(output.join('')).toContain('Usage: difflab')
    expect(output.join('')).toContain('mcp')
    expect(output.join('')).not.toContain('Hello,')
  })

  test('injected project add answers create a project', async () => {
    // Arrange
    const temp = await mkdtemp(join(tmpdir(), 'difflab-cancel-'))
    const home = join(temp, 'home')
    const repo = join(temp, 'repo')
    try {
      await mkdir(home)
      await mkdir(repo)
      execFileSync('git', ['init', '-q', repo])
      execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/example/cancel'], {
        cwd: repo,
      })
      const program = createProgram(() => {}, '0.1.0', {
        home,
        cwd: repo,
        promptProjectAdd: async () => ({
          key: 'INT',
          name: 'Interactive project',
          repositories: ['https://github.com/example/cancel'],
        }),
      })

      // Act
      await program.parseAsync(['project', 'add'], { from: 'user' })

      // Assert
      expect((await listProjects(home)).map((project) => project.name)).toEqual([
        'Interactive project',
      ])
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  })
})
