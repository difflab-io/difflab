import { afterEach, beforeEach, expect, test } from 'bun:test'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Setup -----------------------------------------------------------------------
let temp: string
let repo: string
let home: string
beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'difflab-cli-'))
  repo = join(temp, 'repo')
  home = join(temp, 'home')
  await mkdir(repo)
  await mkdir(home)
  execFileSync('git', ['init', '-q', repo])
  execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/example/cli'], { cwd: repo })
})

// Tests -----------------------------------------------------------------------
test('project add creates a project and init associates an existing project', () => {
  // Arrange
  const created = cli(
    'project',
    'add',
    'CLI',
    '--name',
    'CLI Project',
    '--repo',
    'https://github.com/example/cli',
  )
  // Act
  const projects = cli('project', 'list')
  // Assert
  expect(created.status).toBe(0)
  expect(projects.stdout).toContain('CLI Project')
  expect(projects.stdout).toContain('https://github.com/example/cli')
  const key = /^CLI\t/.test(projects.stdout) ? 'CLI' : undefined
  expect(key).toBeDefined()
  expect(cli('init', key!).status).toBe(0)
  expect(cli('init', 'MISSING').status).toBe(1)
})

test('project add without required values fails with non-interactive guidance', () => {
  const result = cli('project', 'add')
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('project add <key> --name <name> --repo <origin>')
})

test('project add with partial values fails with non-interactive guidance', () => {
  const result = cli('project', 'add', 'CLI', '--name', 'CLI Project')
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('project add <key> --name <name> --repo <origin>')
})

test('invalid GitHub origin does not create a project', () => {
  execFileSync('git', ['remote', 'set-url', 'origin', 'https://gitlab.com/example/cli'], {
    cwd: repo,
  })
  const result = cli(
    'project',
    'add',
    'BAD',
    '--name',
    'Must Not Exist',
    '--repo',
    'https://gitlab.com/example/cli',
  )
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('GitHub')
  expect(cli('project', 'list').stdout).toContain('No projects yet.')
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await rm(temp, { recursive: true, force: true })
})

// Helpers ---------------------------------------------------------------------
function cli(...args: string[]) {
  return spawnSync(process.execPath, [join(import.meta.dir, 'index.ts'), ...args], {
    cwd: repo,
    env: { ...process.env, HOME: home },
    encoding: 'utf8',
  })
}
