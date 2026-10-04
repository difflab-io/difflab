import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listProjects } from 'difflab-db'
import { createProgram } from './cli'
import { ProjectSetupError } from './errors.js'

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

  test('canceling an interactive selection creates no project', async () => {
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
        chooseProject: async (projects) => {
          expect(projects).toEqual([])
          throw new ProjectSetupError('Initialization cancelled')
        },
      })

      await expect(program.parseAsync(['init'], { from: 'user' })).rejects.toThrow(
        'Initialization cancelled',
      )
      expect(await listProjects(home)).toEqual([])
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  })
})
