import { execFile, execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

// Constants -------------------------------------------------------------------
const execFileAsync = promisify(execFile)
const COMMON_DIR = dirname(fileURLToPath(import.meta.url))
export const WORKSPACE_ROOT = resolve(COMMON_DIR, '../..')
export const OUTPUTS_ROOT = join(WORKSPACE_ROOT, 'e2e/outputs')
const TARGET_E2E_ROOT = join(WORKSPACE_ROOT, 'target/e2e')
const CLI_DIST_ENTRY = join(WORKSPACE_ROOT, 'apps/difflab-cli/dist/index.js')
const MOCK_AGENT_SCRIPT = join(COMMON_DIR, 'mock-agent.ts')
const HERDR_SHIM_SCRIPT = join(COMMON_DIR, 'herdr-shim.ts')

const AUTOSPEC_DEFINITION = `# autospec

## Intent

Autonomously plan and implement an objective, commit scoped changes in an isolated worktree, review them, and mark ready.

## Inputs

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| input | yes | — | Objective to plan and implement. |
| branch | no | auto | Target feature branch or auto. |

## Flags

| Flag | Default | Capability | Effect |
| --- | --- | --- | --- |
| --merge | false | merge | Include final merge after checks pass. |

## Steps

### 1. prepare-branch

- Handler: \`procedure: prepare feature checkout\`
- When: always
- Unless: never
- Requires: local
- Receives: \`{{input}}\`, \`{{branch}}\`
- Produces: \`checkout\`
- Instructions: Verify isolated checkout and Difflab store.

### 2. draft-plan

- Handler: \`plan new\`
- When: always
- Unless: never
- Requires: local
- Receives: \`{{input}}\`, \`{{steps.prepare-branch.checkout}}\`
- Produces: \`plan_path\`
- Instructions: Create and fill PLAN.md for {{input}}.

### 3. implement

- Handler: \`plan go\`
- When: always
- Unless: never
- Requires: local
- Receives: \`{{steps.draft-plan.plan_path}}\`, \`{{steps.prepare-branch.checkout}}\`
- Produces: \`diff_ref\`
- Instructions: Execute the implementation plan inside the isolated worktree.

### 4. remote-review

- Handler: \`review new\`
- When: always
- Unless: never
- Requires: remote-pipeline
- Receives: \`{{steps.implement.diff_ref}}\`
- Produces: \`review_path\`, \`pr_url\`
- Instructions: Commit scoped changes inside the worktree and record REVIEW.md.

### 5. address-remote

- Handler: \`review address\`
- When: always
- Unless: never
- Requires: remote-pipeline
- Receives: \`{{steps.remote-review.review_path}}\`, \`{{steps.remote-review.pr_url}}\`
- Produces: \`result\`
- Instructions: Verify and address review threads.

### 6. publish-ready

- Handler: \`pr publish\`
- When: always
- Unless: never
- Requires: remote-pipeline
- Receives: \`{{steps.address-remote.result}}\`, \`{{steps.remote-review.pr_url}}\`
- Produces: \`pr_url\`, \`head_sha\`
- Instructions: Reconcile PLAN.md and mark ready.

### 7. merge

- Handler: \`pr merge\`
- When: \`--merge\`
- Unless: never
- Requires: merge
- Receives: \`{{steps.publish-ready.pr_url}}\`, \`{{steps.publish-ready.head_sha}}\`
- Produces: \`merge_result\`
- Instructions: Merge verified PR.
`

const AUTOREVIEW_DEFINITION = `# autoreview

## Intent

Run one local or remote code review and address round for an existing change.

## Inputs

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| input | no | current branch diff | Target diff or branch to review. |

## Flags

| Flag | Default | Capability | Effect |
| --- | --- | --- | --- |
| --local | false | local | Run local review and address without mutating Git history. |
| --remote-review | false | remote-review | Run remote PR review and address. |

## Steps

### 1. local-review

- Handler: \`review new --local\`
- When: always
- Unless: \`--remote-review\`
- Requires: local
- Receives: \`{{input}}\`
- Produces: \`review_path\`
- Instructions: Record grounded local findings in REVIEW.md.

### 2. remote-review

- Handler: \`review new\`
- When: \`--remote-review\`
- Unless: \`--local\`
- Requires: remote-review
- Receives: \`{{input}}\`
- Produces: \`review_path\`, \`pr_url\`
- Instructions: Review remotely and publish findings.

### 3. address-local

- Handler: \`review address --local\`
- When: always
- Unless: \`--remote-review\`
- Requires: local
- Receives: \`{{steps.local-review.review_path}}\`
- Produces: \`result\`
- Instructions: Address local findings and record outcomes in REVIEW.md.
`

// Types -----------------------------------------------------------------------
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
  readonly suite: string
  readonly rootDir: string
  readonly homeDir: string
  readonly repoDir: string
  readonly originDir: string
  readonly herdrBin: string
  readonly herdrMode: 'real' | 'shim'
  readonly herdrSession: string
  readonly baseEnv: NodeJS.ProcessEnv
  private readonly transcript: string[] = []

  private constructor(params: {
    suite: string
    rootDir: string
    homeDir: string
    repoDir: string
    originDir: string
    herdrBin: string
    herdrMode: 'real' | 'shim'
    herdrSession: string
    baseEnv: NodeJS.ProcessEnv
  }) {
    this.suite = params.suite
    this.rootDir = params.rootDir
    this.homeDir = params.homeDir
    this.repoDir = params.repoDir
    this.originDir = params.originDir
    this.herdrBin = params.herdrBin
    this.herdrMode = params.herdrMode
    this.herdrSession = params.herdrSession
    this.baseEnv = params.baseEnv
  }

  static async create(
    suite: 'app' | 'cli' | 'web',
    extraEnv: NodeJS.ProcessEnv = {},
    meta: { name?: string } = {},
  ): Promise<TestHarness> {
    const id = randomBytes(3).toString('hex')
    const slug = slugify(meta.name ?? suite).slice(0, 32)
    const rootDir = join(TARGET_E2E_ROOT, `${suite}-${slug}-${id}`)
    // Keep $HOME short so macOS UNIX domain sockets (sockaddr_un.sun_path <= 104 bytes) succeed in Herdr.
    const rawShortHome = join('/tmp', `dl-${id}`)
    await mkdir(rawShortHome, { recursive: true })
    const homeDir = await realpath(rawShortHome)
    const repoDir = join(rootDir, 'repo')
    const originDir = join(rootDir, 'origin.git')
    const shimStateDir = join(rootDir, 'herdr-shim')

    await mkdir(rootDir, { recursive: true })
    await symlink(homeDir, join(rootDir, 'home')).catch(() => undefined)
    await mkdir(join(homeDir, '.difflab/flows'), { recursive: true })
    await mkdir(repoDir, { recursive: true })
    await mkdir(originDir, { recursive: true })

    await writeFile(join(homeDir, '.difflab/flows/autospec.md'), AUTOSPEC_DEFINITION, 'utf8')
    await writeFile(join(homeDir, '.difflab/flows/autoreview.md'), AUTOREVIEW_DEFINITION, 'utf8')
    await writeFile(
      join(homeDir, '.difflab/config.toml'),
      [
        'appPort = 0',
        'enginePort = 0',
        'daemonRigPort = 0',
        'defaultHarness = "mock"',
        'retention = "retain"',
        '',
      ].join('\n'),
      'utf8',
    )

    // Initialize isolated bare remote and primary repository checkout with mise.toml.
    runGit(originDir, ['init', '--bare'])
    runGit(repoDir, ['init', '-b', 'main'])
    runGit(repoDir, ['config', 'user.name', 'Difflab E2E'])
    runGit(repoDir, ['config', 'user.email', 'e2e@difflab.local'])
    runGit(repoDir, ['remote', 'add', 'origin', 'https://github.com/example/loops-demo.git'])

    await mkdir(join(repoDir, 'src'), { recursive: true })
    await writeFile(join(repoDir, 'mise.toml'), ['[tools]', 'bun = "1.4.2"', ''].join('\n'), 'utf8')
    await writeFile(
      join(repoDir, 'src/reviewed-module.ts'),
      [
        '// API -------------------------------------------------------------------------',
        'export function formatTopic(topic: string): string {',
        '  return ` ${topic} `',
        '}',
        '',
      ].join('\n'),
      'utf8',
    )
    runGit(repoDir, ['add', '.'])
    runGit(repoDir, ['commit', '-m', 'chore: initialize fixture repository'])

    // Trust fixture checkouts and worktrees in mise so `mise exec -- ...` never prompts interactively.
    execFileSync('mise', ['trust', repoDir], { stdio: 'ignore' })

    const resolvedHerdr = detectHerdrBinary()
    const herdrSession = `dle2e-${id}`
    const bunBin = resolveBunBinary()

    const baseEnv: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: homeDir,
      DIFFLAB_HOME_ROOT: homeDir,
      DIFFLAB_STORE_DIR: join(homeDir, '.difflab'),
      DIFFLAB_WORKSPACE_ROOT: WORKSPACE_ROOT,
      DIFFLAB_HERDR_BIN: resolvedHerdr.bin,
      DIFFLAB_HERDR_SESSION: herdrSession,
      DIFFLAB_HERDR_SHIM_DIR: shimStateDir,
      DIFFLAB_HARNESS_CMD: `${bunBin} ${MOCK_AGENT_SCRIPT}`,
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
      repoDir,
      originDir,
      herdrBin: resolvedHerdr.bin,
      herdrMode: resolvedHerdr.mode,
      herdrSession,
      baseEnv,
    })

    // Register DIFFLAB project, initialize the fixture repository, and commit difflab.yaml.
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
    runGit(repoDir, ['add', 'difflab.yaml'])
    runGit(repoDir, ['commit', '-m', 'chore: commit initialized difflab.yaml'])

    return harness
  }

  async writeRepoConfig(yamlContent: string): Promise<void> {
    await writeFile(join(this.repoDir, 'difflab.yaml'), yamlContent, 'utf8')
    runGit(this.repoDir, ['add', 'difflab.yaml'])
    runGit(this.repoDir, ['commit', '-m', 'chore: configure difflab.yaml workflow triggers'])
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
        timeout: 45_000,
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
    timeoutMs = 90_000,
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
      await new Promise((r) => setTimeout(r, 150))
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

        const projectStoreDir = dirname(dirname(detail.run.storeFlowDir))
        const planCandidate = join(projectStoreDir, 'plans', options.runId, 'PLAN.md')
        const reviewCandidate = join(projectStoreDir, 'reviews', options.runId, 'REVIEW.md')
        if (existsSync(planCandidate)) await copyFile(planCandidate, join(outDir, 'PLAN.md'))
        if (existsSync(reviewCandidate)) await copyFile(reviewCandidate, join(outDir, 'REVIEW.md'))

        const primaryHead = runGit(this.repoDir, ['rev-parse', 'HEAD'])
        const primaryStatus = runGit(this.repoDir, ['status', '--porcelain'])
        const wtPath = detail.run.worktreePath
        let worktreeHead: string | null = null
        if (wtPath && existsSync(wtPath)) {
          worktreeHead = runGit(wtPath, ['rev-parse', 'HEAD'])
          const gitLog = runGit(wtPath, ['log', '--stat', '-n', '5'])
          await writeFile(join(outDir, 'worktree-git-log.txt'), `${gitLog}\n`, 'utf8')
        }

        await writeFile(
          join(outDir, 'locations.json'),
          JSON.stringify(
            {
              herdrMode: this.herdrMode,
              herdrSession: this.herdrSession,
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

function resolveBunBinary(): string {
  try {
    return execFileSync('which', ['bun'], { encoding: 'utf8' }).trim() || 'bun'
  } catch {
    return 'bun'
  }
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'journey'
  )
}

function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

export async function readArtifactText(dir: string, filename: string): Promise<string> {
  return readFile(join(dir, filename), 'utf8')
}
