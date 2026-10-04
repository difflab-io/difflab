import { afterEach, beforeEach, expect, test } from 'bun:test'
import { execFileSync, spawnSync } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
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

for (const [name, args] of [
  ['the repository', ['project', 'add', 'CLI', '--name', 'CLI Project']],
  [
    'the project key',
    ['project', 'add', '--name', 'CLI Project', '--repo', 'https://github.com/example/cli'],
  ],
  ['the project name', ['project', 'add', 'CLI', '--repo', 'https://github.com/example/cli']],
] as const) {
  test(`project add with partial values missing ${name} fails with guidance`, () => {
    const result = cli(...args)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('project add <key> --name <name> --repo <origin>')
  })
}

test('invalid repository URL does not create a project', () => {
  execFileSync('git', ['remote', 'set-url', 'origin', 'not-a-repository-url'], {
    cwd: repo,
  })
  const result = cli(
    'project',
    'add',
    'BAD',
    '--name',
    'Must Not Exist',
    '--repo',
    'not-a-repository-url',
  )
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('valid URL')
  expect(cli('project', 'list').stdout).toContain('No projects yet.')
})

test('subprocess init discovers the Git root from a nested cwd and rejects an unrelated cwd', async () => {
  // Arrange
  const nested = join(repo, 'nested')
  const unrelated = join(temp, 'unrelated')
  await mkdir(nested)
  await mkdir(unrelated)
  expect(
    cli(
      'project',
      'add',
      'CLI',
      '--name',
      'CLI Project',
      '--repo',
      'https://github.com/example/cli',
    ).status,
  ).toBe(0)

  // Act
  const initialized = cliFrom(nested, 'init', 'CLI')
  const invalid = cliFrom(unrelated, 'init', 'CLI')

  // Assert
  expect(initialized.status).toBe(0)
  expect(invalid.status).toBe(1)
  expect(invalid.stderr).toContain('Cannot inspect Git repository')
  expect(await readFile(join(repo, 'difflab.yaml'), 'utf8')).toContain('id: CLI')
  await expect(lstat(join(nested, 'difflab.yaml'))).rejects.toMatchObject({ code: 'ENOENT' })
})

test('a conflicting repository keeps the shared database usable and leaves no new project', async () => {
  // Arrange
  expect(
    cli('project', 'add', 'ONE', '--name', 'One', '--repo', 'https://github.com/example/cli')
      .status,
  ).toBe(0)

  // Act
  const conflict = cli(
    'project',
    'add',
    'TWO',
    '--name',
    'Two',
    '--repo',
    'git@github.com:example/cli.git',
  )
  const projects = cli('project', 'list')

  // Assert
  expect(conflict.status).toBe(1)
  expect(projects.stdout).toContain('ONE\tOne')
  expect(projects.stdout).not.toContain('TWO\tTwo')
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await rm(temp, { recursive: true, force: true })
})

// Helpers ---------------------------------------------------------------------
function cli(...args: string[]) {
  return cliFrom(repo, ...args)
}
function cliFrom(cwd: string, ...args: string[]) {
  return spawnSync(process.execPath, [join(import.meta.dir, 'index.ts'), ...args], {
    cwd,
    env: { ...process.env, HOME: home },
    encoding: 'utf8',
  })
}
