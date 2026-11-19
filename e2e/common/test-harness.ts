import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { stopDaemon } from 'difflab-daemon'
import { assertIsolatedTestHome } from 'utils/testx'

// Constants -------------------------------------------------------------------
const CURRENT_DIR = dirname(fileURLToPath(import.meta.url))
export const E2E_ROOT = resolve(CURRENT_DIR, '..')
export const REPO_ROOT = resolve(E2E_ROOT, '..')
export const OUTPUTS_ROOT = join(E2E_ROOT, 'outputs')
export const API_ENTRYPOINT = join(REPO_ROOT, 'apps', 'difflab-api', 'src', 'index.ts')
export const API_MIGRATE_ENTRYPOINT = join(REPO_ROOT, 'libs', 'difflab-db', 'src', 'migrate-cli.ts')
export const CLI_ENTRYPOINT = join(REPO_ROOT, 'apps', 'difflab-cli', 'src', 'index.ts')

// Types -----------------------------------------------------------------------
export type E2ESuite = 'api' | 'cli'

export type RunningApiServer = {
  pid: number
  port: number
  serverUrl: string
  rpcUrl: string
  stop: () => Promise<void>
}

export type FailedApiStartup = {
  exitCode: number | null
  signal: NodeJS.Signals | null
  log: string
}

export type StartApiOptions = {
  mode?: 'local' | 'cloud'
  port?: number
  stateDir?: string
  env?: Record<string, string | undefined>
  startupTimeoutMs?: number
}

export type RunCliOptions = {
  cwd?: string
  env?: Record<string, string | undefined>
  timeoutMs?: number
}

export type CliResult = {
  exitCode: number
  stdout: string
  stderr: string
}

export type RunningPostgres = {
  connectionString: string
  stop: () => Promise<void>
}

export type E2ETestContext = {
  suite: E2ESuite
  spec: string
  slug: string
  rootDir: string
  difflabHome: string
  workspaceDir: string
  cliLogPath: string
  apiLogPath: string
  appendCliLog: (text: string) => Promise<void>
  appendApiLog: (text: string) => Promise<void>
  readApiLog: () => Promise<string>
  readCliLog: () => Promise<string>
  startPostgres: () => Promise<RunningPostgres>
  runApiMigrate: (env?: Record<string, string | undefined>) => Promise<CliResult>
  startApiServer: (options?: StartApiOptions) => Promise<RunningApiServer>
  startApiExpectingFailure: (options?: StartApiOptions) => Promise<FailedApiStartup>
  runCli: (args: string[], options?: RunCliOptions) => Promise<CliResult>
  cleanup: () => Promise<void>
}

// API -------------------------------------------------------------------------
export async function createE2EContext(
  suite: E2ESuite,
  spec: string,
  testLabel: string,
): Promise<E2ETestContext> {
  const slug = slugify(testLabel)
  const rootDir = join(OUTPUTS_ROOT, suite, spec, slug)
  const difflabHome = join(rootDir, 'difflab-home')
  const workspaceDir = join(rootDir, 'workspace')
  const cliLogPath = join(rootDir, 'cli.log')
  const apiLogPath = join(rootDir, 'api.log')

  assertIsolatedTestHome(difflabHome)

  await rm(rootDir, { recursive: true, force: true })
  await mkdir(difflabHome, { recursive: true })
  await mkdir(workspaceDir, { recursive: true })
  await writeFile(cliLogPath, '', 'utf8')
  await writeFile(apiLogPath, '', 'utf8')

  const cleanupCallbacks: Array<() => Promise<void>> = []

  const appendCliLog = async (text: string): Promise<void> => {
    await appendFile(cliLogPath, text, 'utf8')
  }

  const appendApiLog = async (text: string): Promise<void> => {
    await appendFile(apiLogPath, text, 'utf8')
  }

  const readApiLog = async (): Promise<string> => {
    return await readFile(apiLogPath, 'utf8')
  }

  const readCliLog = async (): Promise<string> => {
    return await readFile(cliLogPath, 'utf8')
  }

  const startPostgres = async (): Promise<RunningPostgres> => {
    const db = new PGlite()
    await db.waitReady
    const server = new PGLiteSocketServer({
      db,
      host: '127.0.0.1',
      port: 0,
      maxConnections: 15,
    })
    await server.start()
    const connectionString = `postgres://postgres@${server.getServerConn()}/postgres`
    await appendApiLog(
      `${JSON.stringify({ event: 'e2e.postgres.started', connection_string: connectionString })}\n`,
    )

    let stopped = false
    const stop = async () => {
      if (stopped) return
      stopped = true
      await server.stop()
      await db.close()
    }
    cleanupCallbacks.push(stop)

    return { connectionString, stop }
  }

  const runApiMigrate = async (
    envOverrides: Record<string, string | undefined> = {},
  ): Promise<CliResult> => {
    const env = buildCleanEnv({
      DIFFLAB_HOME: difflabHome,
      ...envOverrides,
    })
    const result = await runSubprocess(process.execPath, [API_MIGRATE_ENTRYPOINT], {
      cwd: REPO_ROOT,
      env,
      timeoutMs: 20_000,
    })
    await appendApiLog(formatProcessTranscript('difflab-api migrate', [], result))
    return result
  }

  const startApiServer = async (options: StartApiOptions = {}): Promise<RunningApiServer> => {
    const port = options.port ?? 0
    const stateDir = options.stateDir ?? difflabHome
    const mode = options.mode ?? 'local'
    const args = [API_ENTRYPOINT, '--port', String(port)]
    if (mode === 'local') {
      args.push('--state-dir', stateDir)
    }
    const env = buildCleanEnv({
      DIFFLAB_HOME: stateDir,
      DIFFLAB_MODE: mode,
      ...options.env,
    })

    const child = spawn(process.execPath, args, {
      cwd: REPO_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let combined = ''
    let readyPayload: { server_url: string; rpc_url: string; pid: number } | null = null
    let exitInfo: { code: number | null; signal: NodeJS.Signals | null } | null = null

    const onChunk = (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      combined += text
      void appendApiLog(text)
      if (!readyPayload) {
        for (const line of combined.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('{')) continue
          try {
            const parsed = JSON.parse(trimmed) as {
              event?: string
              server_url?: string
              rpc_url?: string
              pid?: number
            }
            if (
              parsed.event === 'difflab-api.ready' &&
              parsed.server_url &&
              parsed.rpc_url &&
              typeof parsed.pid === 'number'
            ) {
              readyPayload = {
                server_url: parsed.server_url,
                rpc_url: parsed.rpc_url,
                pid: parsed.pid,
              }
            }
          } catch {
            // Non-JSON line.
          }
        }
      }
    }

    child.stdout?.on('data', onChunk)
    child.stderr?.on('data', onChunk)
    child.on('exit', (code, signal) => {
      exitInfo = { code, signal }
    })

    let stopped = false
    const stop = async (): Promise<void> => {
      if (stopped) return
      stopped = true
      await terminateChild(child)
    }
    cleanupCallbacks.push(stop)

    const deadline = Date.now() + (options.startupTimeoutMs ?? 15_000)
    while (Date.now() < deadline) {
      const currentExit = exitInfo as { code: number | null; signal: NodeJS.Signals | null } | null
      if (currentExit) {
        throw new Error(
          `difflab-api exited before ready (code=${currentExit.code}, signal=${currentExit.signal}):\n${combined}`,
        )
      }
      if (readyPayload) {
        const currentReady = readyPayload as { server_url: string; rpc_url: string; pid: number }
        if (await checkHealth(currentReady.server_url)) {
          const parsedUrl = new URL(currentReady.server_url)
          return {
            pid: currentReady.pid,
            port: Number(parsedUrl.port),
            serverUrl: currentReady.server_url,
            rpcUrl: currentReady.rpc_url,
            stop,
          }
        }
      }
      await sleep(40)
    }

    await stop()
    throw new Error(`Timed out waiting for difflab-api to become ready:\n${combined}`)
  }

  const startApiExpectingFailure = async (
    options: StartApiOptions = {},
  ): Promise<FailedApiStartup> => {
    const port = options.port ?? (await reserveFreePort())
    const stateDir = options.stateDir ?? difflabHome
    const mode = options.mode ?? 'local'
    const args = [API_ENTRYPOINT, '--port', String(port)]
    if (mode === 'local') {
      args.push('--state-dir', stateDir)
    }
    const env = buildCleanEnv({
      DIFFLAB_HOME: stateDir,
      DIFFLAB_MODE: mode,
      ...options.env,
    })

    const child = spawn(process.execPath, args, {
      cwd: REPO_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let combined = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      combined += text
      void appendApiLog(text)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      combined += text
      void appendApiLog(text)
    })

    const exitResult = await new Promise<{
      exitCode: number | null
      signal: NodeJS.Signals | null
    }>((resolveExit, rejectExit) => {
      const timer = setTimeout(() => {
        void terminateChild(child)
        rejectExit(
          new Error(`Expected difflab-api startup failure, but process stayed alive:\n${combined}`),
        )
      }, options.startupTimeoutMs ?? 10_000)

      child.on('exit', (code, signal) => {
        clearTimeout(timer)
        resolveExit({ exitCode: code, signal })
      })
    })

    await sleep(25)
    return {
      exitCode: exitResult.exitCode,
      signal: exitResult.signal,
      log: await readApiLog(),
    }
  }

  const runCli = async (args: string[], options: RunCliOptions = {}): Promise<CliResult> => {
    const cwd = options.cwd ?? workspaceDir
    const env = buildCleanEnv({
      DIFFLAB_HOME: difflabHome,
      DIFFLAB_DAEMON_LOG_PATH: apiLogPath,
      ...options.env,
    })
    const result = await runSubprocess(process.execPath, [CLI_ENTRYPOINT, ...args], {
      cwd,
      env,
      timeoutMs: options.timeoutMs ?? 20_000,
    })
    await appendCliLog(formatProcessTranscript('difflab', args, result, cwd))
    return result
  }

  const cleanup = async (): Promise<void> => {
    try {
      await stopDaemon(difflabHome)
    } catch {
      // Ignore if stateDir was untouched or deleted by test.
    }
    for (const callback of cleanupCallbacks.reverse()) {
      try {
        await callback()
      } catch {
        // Best-effort cleanup while retaining output artifacts.
      }
    }
  }

  return {
    suite,
    spec,
    slug,
    rootDir,
    difflabHome,
    workspaceDir,
    cliLogPath,
    apiLogPath,
    appendCliLog,
    appendApiLog,
    readApiLog,
    readCliLog,
    startPostgres,
    runApiMigrate,
    startApiServer,
    startApiExpectingFailure,
    runCli,
    cleanup,
  }
}

export async function isTcpPortListening(port: number, host = '127.0.0.1'): Promise<boolean> {
  try {
    const response = await fetch(`http://${host}:${port}/health`, {
      signal: AbortSignal.timeout(300),
    })
    return response.status > 0
  } catch {
    return false
  }
}

export async function reserveFreePort(host = '127.0.0.1'): Promise<number> {
  return await new Promise<number>((resolvePort, rejectPort) => {
    const server = createServer()
    server.once('error', rejectPort)
    server.listen(0, host, () => {
      const address = server.address()
      const assigned = typeof address === 'object' && address ? address.port : 0
      server.close((err) => {
        if (err) rejectPort(err)
        else resolvePort(assigned)
      })
    })
  })
}

export function buildCleanEnv(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = { ...process.env }
  delete base.DIFFLAB_HOME
  delete base.DIFFLAB_MODE
  delete base.DIFFLAB_API_TOKEN
  delete base.DIFFLAB_RPC_URL
  delete base.DIFFLAB_WORKSPACE
  delete base.DIFFLAB_DAEMON_LOG_PATH
  delete base.DATABASE_URL
  delete base.PORT
  base.GIT_CEILING_DIRECTORIES = OUTPUTS_ROOT
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete base[key]
    } else {
      base[key] = value
    }
  }
  return base
}

// Helpers ---------------------------------------------------------------------
function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
}

async function runSubprocess(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
): Promise<CliResult> {
  return await new Promise<CliResult>((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    const timer = setTimeout(() => {
      void terminateChild(child)
      rejectRun(
        new Error(
          `Subprocess timed out after ${options.timeoutMs}ms: ${command} ${args.join(' ')}`,
        ),
      )
    }, options.timeoutMs)

    child.on('error', (err) => {
      clearTimeout(timer)
      rejectRun(err)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolveRun({
        exitCode: code ?? 1,
        stdout,
        stderr,
      })
    })
  })
}

function formatProcessTranscript(
  program: string,
  args: string[],
  result: CliResult,
  cwd?: string,
): string {
  const lines = [
    `=== ${new Date().toISOString()} ===`,
    ...(cwd ? [`cwd: ${cwd}`] : []),
    `$ ${[program, ...args].join(' ')}`,
    `exit_code: ${result.exitCode}`,
  ]
  if (result.stdout) {
    lines.push('--- stdout ---', result.stdout.trimEnd())
  }
  if (result.stderr) {
    lines.push('--- stderr ---', result.stderr.trimEnd())
  }
  lines.push('')
  return `${lines.join('\n')}\n`
}

async function terminateChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  const deadline = Date.now() + 3_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) return
    await sleep(30)
  }
  try {
    child.kill('SIGKILL')
  } catch {
    // Already exited.
  }
}

async function checkHealth(serverUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${serverUrl.replace(/\/$/, '')}/health`, {
      signal: AbortSignal.timeout(500),
    })
    return response.ok
  } catch {
    return false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}
