import { spawnSync } from 'node:child_process'
import { appendFile, chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'bun:test'
import { lstatOrNull } from 'utils/fsx'

// Setup -----------------------------------------------------------------------
const CURRENT_DIR = dirname(fileURLToPath(import.meta.url))
const E2E_ROOT = resolve(CURRENT_DIR, '..')
const REPO_ROOT = resolve(E2E_ROOT, '..')
const OUTPUTS_ROOT = join(E2E_ROOT, 'outputs', 'cli', 'setup')
const CLI_ENTRYPOINT = join(REPO_ROOT, 'apps', 'difflab-cli', 'src', 'index.ts')

// Tests -----------------------------------------------------------------------
describe('given an unconfigured HOME and a restricted PATH missing gh, glab, and npx', () => {
  describe('when running difflab setup', () => {
    it('then it exits 0, lists missing items with the agent prompt note in stdout and cli.log, and leaves HOME/.difflab absent on disk', async () => {
      // Arrange
      const ctx = await createSetupTestContext('unconfigured-home-and-restricted-path')
      await ctx.stubTools({ git: 'git version 2.45.0', bun: '1.4.2' })

      // Act
      const result = await ctx.runCli(['setup'])
      const cliLog = await readFile(ctx.cliLogPath, 'utf8')
      const storeStat = await lstatOrNull(join(ctx.difflabHome, '.difflab'))

      // Assert
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('[ok] git')
      expect(result.stdout).toContain('[ok] bun (1.4.2)')
      expect(result.stdout).toContain('[missing] npx')
      expect(result.stdout).toContain('[missing] gh or glab')
      expect(result.stdout).toContain('[missing]')
      expect(result.stdout).toContain('difflab templates list')
      expect(result.stdout).toContain('[missing] on-request-worktree')
      expect(result.stdout).toContain('[missing] on-remote-delegation')
      expect(result.stdout).toContain('[optional] on-merge')
      expect(result.stdout).toContain(
        'Agent note: ask the user whether you must install or configure missing items for them before running changes.',
      )
      expect(result.stdout).not.toContain('Repository:')
      expect(cliLog).toContain('$ difflab setup')
      expect(cliLog).toContain('[missing] on-request-worktree')
      expect(storeStat).toBeNull()
    })
  })
})

describe('given available prerequisites, unpacked up-to-date templates, and configured HOOK.md files', () => {
  describe('when running difflab setup', () => {
    it('then it exits 0 and reports ok across prerequisites, templates, and hooks without missing prompts', async () => {
      // Arrange
      const ctx = await createSetupTestContext('configured-store-and-hooks')
      await ctx.stubTools({
        git: 'git version 2.45.0',
        bun: '1.4.2',
        npx: '10.8.0',
        gh: 'gh version 2.60.0',
      })
      const storeRoot = join(ctx.difflabHome, '.difflab')
      const unpacked = await ctx.runCli(['templates', 'list'])
      expect(unpacked.exitCode).toBe(0)
      for (const hook of ['on-request-worktree', 'on-remote-delegation', 'on-merge']) {
        const hookDir = join(storeRoot, 'hooks', hook)
        await mkdir(hookDir, { recursive: true })
        await writeFile(join(hookDir, 'HOOK.md'), `# ${hook}\n`, 'utf8')
      }

      // Act
      const result = await ctx.runCli(['setup'])
      const cliLog = await readFile(ctx.cliLogPath, 'utf8')

      // Assert
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('[ok] git')
      expect(result.stdout).toContain('[ok] bun (1.4.2)')
      expect(result.stdout).toContain('[ok] npx')
      expect(result.stdout).toContain('[ok] gh')
      expect(result.stdout).toContain('Templates:')
      expect(result.stdout).toContain(`[ok] ${join(storeRoot, 'templates')}`)
      expect(result.stdout).toContain('up to date)')
      expect(result.stdout).toContain('[ok] on-request-worktree')
      expect(result.stdout).toContain('[ok] on-remote-delegation')
      expect(result.stdout).toContain('[ok] on-merge')
      expect(result.stdout).toContain('Difflab machine setup is ready.')
      expect(result.stdout).not.toContain('[missing]')
      expect(result.stdout).not.toContain('[outdated]')
      expect(result.stdout).not.toContain('Agent note:')
      expect(cliLog).toContain('Difflab machine setup is ready.')
    })
  })
})

// Helpers ---------------------------------------------------------------------
type SetupTestContext = {
  rootDir: string
  difflabHome: string
  cliLogPath: string
  stubTools: (versions: Record<string, string>) => Promise<void>
  runCli: (
    args: string[],
    envOverrides?: Record<string, string>,
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>
}

async function createSetupTestContext(slug: string): Promise<SetupTestContext> {
  const rootDir = join(OUTPUTS_ROOT, slug)
  const difflabHome = join(rootDir, 'difflab-home')
  const binDir = join(rootDir, 'bin')
  const cliLogPath = join(rootDir, 'cli.log')
  assertIsolatedHome(difflabHome)

  await rm(rootDir, { recursive: true, force: true })
  await mkdir(difflabHome, { recursive: true })
  await mkdir(binDir, { recursive: true })
  await writeFile(cliLogPath, '', 'utf8')

  return {
    rootDir,
    difflabHome,
    cliLogPath,
    async stubTools(versions) {
      for (const [name, output] of Object.entries(versions)) {
        await writeExecutable(join(binDir, name), `#!/bin/sh\necho "${output}"\n`)
      }
    },
    async runCli(args, envOverrides = {}) {
      const result = spawnSync(process.execPath, [CLI_ENTRYPOINT, ...args], {
        cwd: rootDir,
        env: { ...process.env, HOME: difflabHome, PATH: binDir, ...envOverrides },
        encoding: 'utf8',
        timeout: 15000,
      })
      const exitCode = result.status ?? 1
      const stdout = result.stdout ?? ''
      const stderr = result.stderr ?? ''
      await appendFile(
        cliLogPath,
        `$ difflab ${args.join(' ')}\nexitCode: ${exitCode}\n--- stdout ---\n${stdout}--- stderr ---\n${stderr}\n`,
        'utf8',
      )
      return { exitCode, stdout, stderr }
    },
  }
}

function assertIsolatedHome(targetHome: string): void {
  const normalizedTarget = resolve(targetHome)
  const realUserHome = resolve(homedir())
  if (
    normalizedTarget === realUserHome ||
    normalizedTarget.startsWith(`${join(realUserHome, '.difflab')}`) ||
    !normalizedTarget.startsWith(`${OUTPUTS_ROOT}/`)
  ) {
    throw new Error(`Refusing non-isolated test HOME: ${normalizedTarget}`)
  }
}

async function writeExecutable(path: string, contents: string): Promise<void> {
  await writeFile(path, contents, 'utf8')
  await chmod(path, 0o755)
}
