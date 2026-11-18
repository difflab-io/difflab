import { execFile, execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

// Constants -------------------------------------------------------------------
const execFileAsync = promisify(execFile)
const COMMON_DIR = dirname(fileURLToPath(import.meta.url))
export const WORKSPACE_ROOT = resolve(COMMON_DIR, '../..')
export const OUTPUTS_ROOT = join(WORKSPACE_ROOT, 'e2e/outputs')
const RECORDINGS_FLOWS_DIR = join(WORKSPACE_ROOT, 'e2e/recordings/flows')
const TARGET_E2E_ROOT = join(WORKSPACE_ROOT, 'target/e2e')
const CLI_DIST_ENTRY = join(WORKSPACE_ROOT, 'apps/difflab-cli/dist/index.js')
const FLOW_REPLAY_RUNNER_SCRIPT = join(COMMON_DIR, 'flow-replay-runner.ts')
const GH_SHIM_SCRIPT = join(COMMON_DIR, 'gh-shim.ts')
const HERDR_SHIM_SCRIPT = join(COMMON_DIR, 'herdr-shim.ts')

// Types -----------------------------------------------------------------------
export type SuiteKind = 'app' | 'cli' | 'web'

export type CliInvocationResult = {
  args: string[]
  exitCode: number
  stdout: string
  stderr: string
  json: <T = unknown>() => T
}

export type RunDetailSnapshot = {
  run: {
    id: string
    flowName: string
    triggerKey: string | null
    status: string
    harness: string
    worktreePath: string | null
    storeFlowDir: string
    herdrSession: string | null
    herdrPaneId: string | null
    herdrAgentName: string | null
    commitSha: string | null
  }
  steps: {
    stepId: string
    seq: number
    status: string
    harness: string | null
    handoff: string | null
    summary: string | null
  }[]
  messages: {
    id: string
    stepId: string | null
    level: string
    message: string
  }[]
}

// API -------------------------------------------------------------------------
export class TestHarness {
  readonly suite: SuiteKind
  readonly rootDir: string
  readonly homeDir: string
  readonly projectStoreDir: string
  readonly repoDir: string
  readonly originDir: string
  readonly ghStateFile: string
  readonly herdrBin: string
  readonly herdrMode: 'real' | 'shim'
  readonly herdrSession: string
  readonly baseEnv: NodeJS.ProcessEnv
  private readonly transcript: string[] = []

  private constructor(params: {
    suite: SuiteKind
    rootDir: string
    homeDir: string
    projectStoreDir: string
    repoDir: string
    originDir: string
    ghStateFile: string
    herdrBin: string
    herdrMode: 'real' | 'shim'
    herdrSession: string
    baseEnv: NodeJS.ProcessEnv
  }) {
    this.suite = params.suite
    this.rootDir = params.rootDir
    this.homeDir = params.homeDir
    this.projectStoreDir = params.projectStoreDir
    this.repoDir = params.repoDir
    this.originDir = params.originDir
    this.ghStateFile = params.ghStateFile
    this.herdrBin = params.herdrBin
    this.herdrMode = params.herdrMode
    this.herdrSession = params.herdrSession
    this.baseEnv = params.baseEnv
  }

  static async create(
    suite: SuiteKind,
    extraEnv: NodeJS.ProcessEnv = {},
    meta: { name?: string } = {},
  ): Promise<TestHarness> {
    const id = randomBytes(3).toString('hex')
    const slug = slugify(meta.name ?? suite).slice(0, 32)
    const rootDir = join(TARGET_E2E_ROOT, `${suite}-${slug}-${id}`)
    const rawShortHome = join('/tmp', `dl-${id}`)
    await mkdir(rawShortHome, { recursive: true })
    const homeDir = await realpath(rawShortHome)
    const repoDir = join(rootDir, 'repo')
    const originDir = join(rootDir, 'origin.git')
    const shimBinDir = join(rootDir, 'bin')
    const ghStateFile = join(rootDir, 'gh-state.json')
    const shimStateDir = join(rootDir, 'herdr-shim')
    const projectStoreDir = join(
      homeDir,
      '.difflab/projects/DIFFLAB/github.com--example--loops-demo',
    )

    await mkdir(rootDir, { recursive: true })
    await symlink(homeDir, join(rootDir, 'difflab-home')).catch(() => undefined)
    await mkdir(join(homeDir, '.difflab/flows'), { recursive: true })
    await mkdir(repoDir, { recursive: true })
    await mkdir(originDir, { recursive: true })
    await mkdir(shimBinDir, { recursive: true })

    // Copy the user's real local ~/.difflab/flows/{autospec,autoreview}.md (falling back to verbatim recordings on CI).
    const realHostHome = process.env.HOME || homedir()
    await copyFlowDefinition(realHostHome, homeDir, 'autospec.md')
    await copyFlowDefinition(realHostHome, homeDir, 'autoreview.md')

    await writeFile(
      join(homeDir, '.difflab/config.toml'),
      [
        'appPort = 0',
        'enginePort = 0',
        'daemonRigPort = 0',
        'defaultHarness = "agy"',
        'retention = "retain"',
        '',
      ].join('\n'),
      'utf8',
    )

    const bunBin = resolveBunBinary()
    const realGitBin = resolveSystemGitBinary()
    await installOfflineGitAndGhShims(shimBinDir, realGitBin, bunBin, originDir)

    // Initialize isolated bare remote and primary repository checkout with mise.toml, package.json, and AGENTS.md.
    execFileSync(realGitBin, ['init', '--bare', '-b', 'main'], { cwd: originDir, stdio: 'ignore' })
    execFileSync(realGitBin, ['init', '-b', 'main'], { cwd: repoDir, stdio: 'ignore' })
    execFileSync(realGitBin, ['config', 'user.name', 'Difflab E2E'], { cwd: repoDir })
    execFileSync(realGitBin, ['config', 'user.email', 'e2e@difflab.local'], { cwd: repoDir })
    execFileSync(
      realGitBin,
      ['remote', 'add', 'origin', 'https://github.com/example/loops-demo.git'],
      { cwd: repoDir },
    )

    await mkdir(join(repoDir, 'src'), { recursive: true })
    await writeFile(join(repoDir, 'mise.toml'), ['[tools]', 'bun = "1.4.2"', ''].join('\n'), 'utf8')
    await writeFile(
      join(repoDir, 'package.json'),
      JSON.stringify(
        {
          name: 'loops-demo',
          private: true,
          type: 'module',
          scripts: {
            test: 'bun test',
          },
        },
        null,
        2,
      ),
      'utf8',
    )
    await writeFile(
      join(repoDir, 'AGENTS.md'),
      [
        '# Repository Guidance',
        '',
        '- Group TypeScript code under `// Constants`, `// Types`, `// API`, and `// Helpers` dividers.',
        '- Colocate unit tests in `.test.ts` files and run checks with `bun test`.',
        '',
      ].join('\n'),
      'utf8',
    )
    await writeFile(
      join(repoDir, 'src/reviewed-module.ts'),
      [
        '// API -------------------------------------------------------------------------',
        '/** Normalize a topic string by trimming surrounding whitespace. */',
        'export function formatTopic(topic: string): string {',
        '  return topic.trim()',
        '}',
        '',
      ].join('\n'),
      'utf8',
    )
    await writeFile(
      join(repoDir, 'src/reviewed-module.test.ts'),
      [
        "import { describe, expect, test } from 'bun:test'",
        "import { formatTopic } from './reviewed-module.js'",
        '',
        '// Tests -----------------------------------------------------------------------',
        "describe('given formatTopic', () => {",
        "  test('when topic has surrounding spaces, then normalized string contains core topic', () => {",
        "    expect(formatTopic('  loops  ').trim()).toBe('loops')",
        '  })',
        '})',
        '',
      ].join('\n'),
      'utf8',
    )

    execFileSync(realGitBin, ['add', '.'], { cwd: repoDir })
    execFileSync(realGitBin, ['commit', '-m', 'chore: initialize fixture repository'], {
      cwd: repoDir,
    })

    execFileSync('mise', ['trust', repoDir], { stdio: 'ignore' })

    const resolvedHerdr = detectHerdrBinary()
    const herdrSession = `dle2e-${id}`

    // Preserve real HOME so `agy` can read ~/.gemini OAuth credentials while isolating Difflab via DIFFLAB_HOME_ROOT.
    const baseEnv: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: realHostHome,
      PATH: `${shimBinDir}:${process.env.PATH ?? ''}`,
      DIFFLAB_HOME_ROOT: homeDir,
      DIFFLAB_STORE_DIR: join(homeDir, '.difflab'),
      DIFFLAB_WORKSPACE_ROOT: WORKSPACE_ROOT,
      DIFFLAB_ORIGIN_BARE_REPO: originDir,
      DIFFLAB_GH_STATE_FILE: ghStateFile,
      DIFFLAB_HERDR_BIN: resolvedHerdr.bin,
      DIFFLAB_HERDR_SESSION: herdrSession,
      DIFFLAB_HERDR_SHIM_DIR: shimStateDir,
      DIFFLAB_HARNESS_CMD: `${bunBin} ${FLOW_REPLAY_RUNNER_SCRIPT}`,
      MISE_TRUSTED_CONFIG_PATHS: `${homeDir}:${repoDir}`,
      HERDR_ENV: undefined,
      HERDR_SOCKET: undefined,
      HERDR_WORKSPACE_ID: undefined,
      HERDR_TAB_ID: undefined,
      HERDR_PANE_ID: undefined,
      ...extraEnv,
    }

    const harness = new TestHarness({
      suite,
      rootDir,
      homeDir,
      projectStoreDir,
      repoDir,
      originDir,
      ghStateFile,
      herdrBin: resolvedHerdr.bin,
      herdrMode: resolvedHerdr.mode,
      herdrSession,
      baseEnv,
    })

    await harness.cli(
      'project',
      'add',
      'DIFFLAB',
      '--name',
      'Difflab Loops Demo',
      '--repo',
      'https://github.com/example/loops-demo.git',
    )
    await harness.cli('init', 'DIFFLAB')
    execFileSync(realGitBin, ['add', 'difflab.yaml'], { cwd: repoDir })
    execFileSync(realGitBin, ['commit', '-m', 'chore: commit initialized difflab.yaml'], {
      cwd: repoDir,
    })
    harness.git(['push', '-u', 'origin', 'main'])

    return harness
  }

  git(args: string[], cwd = this.repoDir): string {
    return execFileSync('git', args, {
      cwd,
      env: this.baseEnv,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  }

  async writeRepoConfig(yamlContent: string): Promise<void> {
    await writeFile(join(this.repoDir, 'difflab.yaml'), yamlContent, 'utf8')
    this.git(['add', 'difflab.yaml'])
    this.git(['commit', '-m', 'chore: configure difflab.yaml workflow triggers'])
    this.git(['push', 'origin', 'HEAD'])
  }

  async cli(...args: string[]): Promise<CliInvocationResult> {
    return this.cliWithEnv({}, ...args)
  }

  async cliWithEnv(extraEnv: NodeJS.ProcessEnv, ...args: string[]): Promise<CliInvocationResult> {
    const bunBin = resolveBunBinary()
    let exitCode = 0
    let stdout: string
    let stderr: string
    try {
      const out = await execFileAsync(bunBin, [CLI_DIST_ENTRY, ...args], {
        cwd: this.repoDir,
        env: { ...this.baseEnv, ...extraEnv },
        timeout: 60_000,
        maxBuffer: 8 * 1024 * 1024,
      })
      stdout = out.stdout.trim()
      stderr = out.stderr.trim()
    } catch (error) {
      const err = error as { code?: number; stdout?: string; stderr?: string; message?: string }
      exitCode = typeof err.code === 'number' ? err.code : 1
      stdout = (err.stdout ?? '').trim()
      stderr = (err.stderr ?? err.message ?? '').trim()
    }

    this.transcript.push(
      [
        `$ difflab ${args.join(' ')}`,
        `exit_code: ${exitCode}`,
        ...(stdout ? [`stdout:\n${stdout}`] : []),
        ...(stderr ? [`stderr:\n${stderr}`] : []),
        '',
      ].join('\n'),
    )

    return {
      args,
      exitCode,
      stdout,
      stderr,
      json: <T = unknown>() => JSON.parse(stdout) as T,
    }
  }

  async waitForRun(
    appUrl: string,
    runId: string,
    expectedStatuses: string[] = ['done', 'failed', 'blocked'],
    timeoutMs = process.env.DIFFLAB_E2E_EXTENDED === 'true' ? 1_600_000 : 90_000,
  ): Promise<RunDetailSnapshot> {
    const deadline = Date.now() + timeoutMs
    let lastDetail: RunDetailSnapshot | null = null
    while (Date.now() < deadline) {
      const res = await fetch(`${appUrl.replace(/\/$/, '')}/v1/runs/${encodeURIComponent(runId)}`)
      if (res.ok) {
        lastDetail = (await res.json()) as RunDetailSnapshot
        if (expectedStatuses.includes(lastDetail.run.status)) {
          return lastDetail
        }
        if (['done', 'failed', 'blocked'].includes(lastDetail.run.status)) {
          throw new Error(
            `Run ${runId} settled at '${lastDetail.run.status}' instead of [${expectedStatuses.join(', ')}]: ${JSON.stringify(lastDetail.messages)}`,
          )
        }
      }
      await new Promise((r) => setTimeout(r, 250))
    }
    throw new Error(
      `Timed out waiting for run ${runId} to reach [${expectedStatuses.join(', ')}]; last=${JSON.stringify(lastDetail)}`,
    )
  }

  async exportArtifacts(
    specSlug: string,
    options: { appUrl?: string; runId?: string } = {},
  ): Promise<string> {
    const outDir = join(OUTPUTS_ROOT, this.suite, specSlug)
    await rm(outDir, { recursive: true, force: true }).catch(() => undefined)
    await mkdir(outDir, { recursive: true })

    await writeFile(join(outDir, 'cli.log'), this.transcript.join('\n---\n'), 'utf8')
    if (existsSync(this.ghStateFile)) {
      await copyFile(this.ghStateFile, join(outDir, 'gh-state.json'))
    }

    if (options.appUrl && options.runId) {
      const res = await fetch(
        `${options.appUrl.replace(/\/$/, '')}/v1/runs/${encodeURIComponent(options.runId)}`,
      )
      if (res.ok) {
        const detail = (await res.json()) as RunDetailSnapshot
        await writeFile(join(outDir, 'runs-api.json'), JSON.stringify(detail, null, 2), 'utf8')

        const flowMd = join(detail.run.storeFlowDir, 'FLOW.md')
        const logsTxt = join(detail.run.storeFlowDir, 'logs.txt')
        if (existsSync(flowMd)) await copyFile(flowMd, join(outDir, 'FLOW.md'))
        if (existsSync(logsTxt)) await copyFile(logsTxt, join(outDir, 'logs.txt'))

        const wtPath = detail.run.worktreePath
        let worktreeHead: string | null = null
        if (wtPath && existsSync(wtPath)) {
          worktreeHead = this.git(['rev-parse', 'HEAD'], wtPath)
          const gitLog = this.git(['log', '--stat', '-n', '5'], wtPath)
          await writeFile(join(outDir, 'worktree-git-log.txt'), `${gitLog}\n`, 'utf8')
        }

        const primaryHead = this.git(['rev-parse', 'HEAD'])
        const primaryStatus = this.git(['status', '--porcelain'])
        await writeFile(
          join(outDir, 'locations.json'),
          JSON.stringify(
            {
              herdrMode: this.herdrMode,
              herdrSession: this.herdrSession,
              harness: detail.run.harness,
              primaryCheckoutPath: this.repoDir,
              primaryCheckoutHead: primaryHead,
              primaryCheckoutStatusPorcelain: primaryStatus,
              worktreePath: wtPath,
              worktreeHead,
              storeFlowDir: detail.run.storeFlowDir,
            },
            null,
            2,
          ),
          'utf8',
        )
      }
    }

    // Export latest scaffolded plan and review artifacts from the project store (whether named runId or YYMMDD-slug).
    const latestPlanDir = await findLatestSubdirWithFile(
      join(this.projectStoreDir, 'plans'),
      'PLAN.md',
    )
    if (latestPlanDir) {
      await copyFile(join(latestPlanDir, 'PLAN.md'), join(outDir, 'PLAN.md'))
      if (existsSync(join(latestPlanDir, 'logs.txt'))) {
        await copyFile(join(latestPlanDir, 'logs.txt'), join(outDir, 'plan-logs.txt'))
      }
    }

    const latestReviewDir = await findLatestSubdirWithFile(
      join(this.projectStoreDir, 'reviews'),
      'REVIEW.md',
    )
    if (latestReviewDir) {
      await copyFile(join(latestReviewDir, 'REVIEW.md'), join(outDir, 'REVIEW.md'))
      if (existsSync(join(latestReviewDir, 'rubric.yaml'))) {
        await copyFile(join(latestReviewDir, 'rubric.yaml'), join(outDir, 'rubric.yaml'))
      }
    }

    const herdrTabs = await this.captureHerdrTabs()
    await writeFile(join(outDir, 'herdr-session.json'), JSON.stringify(herdrTabs, null, 2), 'utf8')

    return outDir
  }

  async dispose(failed = false): Promise<void> {
    await this.cli('daemon', 'down').catch(() => undefined)
    await execFileAsync(this.herdrBin, ['session', 'stop', this.herdrSession], {
      env: this.baseEnv,
      timeout: 10_000,
    }).catch(() => undefined)
    await execFileAsync(this.herdrBin, ['session', 'delete', this.herdrSession], {
      env: this.baseEnv,
      timeout: 10_000,
    }).catch(() => undefined)

    if (!failed && process.env.DIFFLAB_E2E_KEEP_TMP !== '1') {
      await rm(this.homeDir, { recursive: true, force: true }).catch(() => undefined)
      await rm(this.rootDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  private async captureHerdrTabs(): Promise<unknown> {
    try {
      const { stdout } = await execFileAsync(
        this.herdrBin,
        ['--session', this.herdrSession, 'tab', 'list'],
        { env: this.baseEnv, timeout: 10_000 },
      )
      return JSON.parse(stdout)
    } catch {
      return { session: this.herdrSession, mode: this.herdrMode }
    }
  }
}

// Helpers ---------------------------------------------------------------------
async function copyFlowDefinition(
  realHostHome: string,
  isolatedHome: string,
  filename: string,
): Promise<void> {
  const hostPath = join(realHostHome, '.difflab/flows', filename)
  const fallbackPath = join(RECORDINGS_FLOWS_DIR, filename)
  const sourcePath = existsSync(hostPath) ? hostPath : fallbackPath
  await copyFile(sourcePath, join(isolatedHome, '.difflab/flows', filename))
}

async function installOfflineGitAndGhShims(
  shimBinDir: string,
  realGitBin: string,
  bunBin: string,
  originDir: string,
): Promise<void> {
  const gitShimPath = join(shimBinDir, 'git')
  await writeFile(
    gitShimPath,
    [
      '#!/bin/sh',
      'needs_rewrite=0',
      'for arg in "$@"; do',
      '  case "$arg" in',
      '    fetch|push|pull|ls-remote|clone) needs_rewrite=1; break ;;',
      '  esac',
      'done',
      'if [ "$needs_rewrite" = "1" ]; then',
      `  exec '${realGitBin}' -c 'url.${originDir}.insteadOf=https://github.com/example/loops-demo.git' -c 'url.${originDir}.insteadOf=https://github.com/example/loops-demo' "$@"`,
      'fi',
      `exec '${realGitBin}' "$@"`,
      '',
    ].join('\n'),
    { mode: 0o755 },
  )

  const ghShimPath = join(shimBinDir, 'gh')
  await writeFile(
    ghShimPath,
    ['#!/bin/sh', `exec '${bunBin}' '${GH_SHIM_SCRIPT}' "$@"`, ''].join('\n'),
    { mode: 0o755 },
  )
}

async function findLatestSubdirWithFile(
  parentDir: string,
  filename: string,
): Promise<string | null> {
  const entries = await readdir(parentDir, { withFileTypes: true }).catch(() => [])
  let latestPath: string | null = null
  let latestMtime = -1
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const candidateFile = join(parentDir, entry.name, filename)
    if (!existsSync(candidateFile)) continue
    const stat = await import('node:fs/promises').then((m) =>
      m.stat(candidateFile).catch(() => null),
    )
    if (stat && stat.mtimeMs >= latestMtime) {
      latestMtime = stat.mtimeMs
      latestPath = join(parentDir, entry.name)
    }
  }
  return latestPath
}

function detectHerdrBinary(): { bin: string; mode: 'real' | 'shim' } {
  if (process.env.DIFFLAB_HERDR_BIN) {
    return {
      bin: process.env.DIFFLAB_HERDR_BIN,
      mode: process.env.DIFFLAB_HERDR_BIN.includes('herdr-shim') ? 'shim' : 'real',
    }
  }
  const candidates = [
    process.env.HOME ? join(process.env.HOME, '.local/bin/herdr') : '',
    '/usr/local/bin/herdr',
    '/opt/homebrew/bin/herdr',
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return { bin: candidate, mode: 'real' }
    }
  }

  try {
    const found = execFileSync('which', ['herdr'], { encoding: 'utf8' }).trim()
    if (found) return { bin: found, mode: 'real' }
  } catch {
    // Fall back to headless CI shim when herdr is absent.
  }

  return { bin: HERDR_SHIM_SCRIPT, mode: 'shim' }
}

export function resolveBunBinary(): string {
  try {
    return execFileSync('which', ['bun'], { encoding: 'utf8' }).trim() || 'bun'
  } catch {
    return 'bun'
  }
}

function resolveSystemGitBinary(): string {
  for (const candidate of ['/opt/homebrew/bin/git', '/usr/local/bin/git', '/usr/bin/git']) {
    if (existsSync(candidate)) return candidate
  }
  return 'git'
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'journey'
  )
}

export async function readArtifactText(dir: string, filename: string): Promise<string> {
  return readFile(join(dir, filename), 'utf8')
}
