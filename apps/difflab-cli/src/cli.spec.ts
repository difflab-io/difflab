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
test('non-interactive init needs an explicit selection; new and repeated setup succeed', () => {
  const missing = cli('init')
  expect(missing.status).toBe(1)
  expect(missing.stderr).toContain('--project <id> or --new-project <name>')

  const created = cli('init', '--new-project', 'CLI Project')
  expect(created.status).toBe(0)
  const projects = cli('project', 'list')
  expect(projects.stdout).toContain('CLI Project')
  expect(projects.stdout).toContain('https://github.com/example/cli')
  const id = /^[0-9a-f-]{36}/.exec(projects.stdout)?.[0]
  expect(id).toBeDefined()
  expect(cli('init', '--project', id!).status).toBe(0)
})

test('invalid GitHub origin with --new-project does not create a project', () => {
  execFileSync('git', ['remote', 'set-url', 'origin', 'https://gitlab.com/example/cli'], {
    cwd: repo,
  })
  const result = cli('init', '--new-project', 'Must Not Exist')
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
