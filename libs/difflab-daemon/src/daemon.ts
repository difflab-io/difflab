import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { closeSync, existsSync, openSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DifflabConfig, DifflabConfigError } from 'difflab-config'
import lockfile from 'proper-lockfile'
import { lstatOrNull } from 'utils/fsx'
import { getLogger } from 'utils/logx'
import { isProcessAlive, terminateProcess } from 'utils/processx'
import { z } from 'zod'
import { DaemonLifecycleError } from './errors.js'

// Constants -------------------------------------------------------------------
const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
const DAEMON_METADATA_FILE = 'daemon.json'
const DAEMON_LOCK_FILE = 'daemon.lock'
const DEFAULT_STARTUP_TIMEOUT_MS = 15_000
const DEFAULT_STOP_TIMEOUT_MS = 5_000
const POLL_INTERVAL_MS = 50
const logger = getLogger('daemon')

const daemonRecordSchema = z.object({
  pid: z.number().int().positive(),
  server_url: z.string().min(1),
  rpc_url: z.string().min(1),
  started_at: z.string().min(1),
})

// Types -----------------------------------------------------------------------
/** Persisted metadata written to `$DIFFLAB_HOME/daemon.json` by a running local server. */
export type DaemonRecord = z.infer<typeof daemonRecordSchema>

/** Current running status of a local Difflab background daemon. */
export type DaemonStatus =
  { running: false } | { running: true; pid: number; server_url: string; rpc_url: string }

/** Options for configuring a `DifflabDaemon` instance. */
export type DifflabDaemonOptions = {
  stateDir: string
  port?: number
  foreground?: boolean
  logPath?: string
  apiEntry?: string
  command?: string
  args?: string[]
  env?: NodeJS.ProcessEnv
  startupTimeoutMs?: number
}

// API -------------------------------------------------------------------------
/** Manages the lifecycle, locking, health probing, and metadata of the local Difflab RPC daemon. */
export class DifflabDaemon {
  readonly options: DifflabDaemonOptions

  constructor(options: DifflabDaemonOptions) {
    this.options = options
  }

  /** Create a `DifflabDaemon` configured with `options`. */
  static withOptions(options: DifflabDaemonOptions): DifflabDaemon {
    return new DifflabDaemon(options)
  }

  /** Return the path to `daemon.json` inside `stateDir`. */
  static metadataPath(stateDir: string): string {
    return join(stateDir, DAEMON_METADATA_FILE)
  }

  /** Locate the `difflab-api` server script for local daemon spawning. */
  static resolveApiEntry(explicitEntry?: string): string {
    const configured = explicitEntry?.trim() || DifflabConfig.load().apiEntry
    if (configured) return resolve(configured)

    const scriptDir = process.argv[1] ? dirname(resolve(process.argv[1])) : MODULE_DIR
    const candidates = [
      resolve(scriptDir, './api.js'),
      resolve(MODULE_DIR, '../../../apps/difflab-api/src/index.ts'),
      resolve(MODULE_DIR, '../../../apps/difflab-api/dist/index.js'),
      resolve(MODULE_DIR, './api.js'),
    ]
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate
    }
    throw new DifflabConfigError('Unable to locate difflab-api server entrypoint')
  }

  /** Atomically write `daemon.json` metadata inside `stateDir`. */
  static async writeMetadata(stateDir: string, record: DaemonRecord): Promise<void> {
    await ensureSafeStateDir(stateDir)
    const target = DifflabDaemon.metadataPath(stateDir)
    const existing = await lstatOrNull(target)
    if (existing && (existing.isSymbolicLink() || !existing.isFile())) {
      throw new DaemonLifecycleError(`Refusing to overwrite non-regular daemon metadata: ${target}`)
    }
    const temp = join(stateDir, `.${DAEMON_METADATA_FILE}.${process.pid}.${randomUUID()}.tmp`)
    await writeFile(temp, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await rename(temp, target)
  }

  /** Inspect whether a healthy daemon is currently running for `stateDir`. */
  static async status(stateDir: string): Promise<DaemonStatus> {
    const record = await readDaemonRecord(stateDir)
    if (!record) return { running: false }
    if (!isProcessAlive(record.pid) || !(await probeHealth(record.server_url))) {
      return { running: false }
    }
    return {
      running: true,
      pid: record.pid,
      server_url: record.server_url,
      rpc_url: record.rpc_url,
    }
  }

  /** Stop the running daemon for `stateDir` if alive and remove its metadata file. */
  static async stop(
    stateDir: string,
    timeoutMs = DEFAULT_STOP_TIMEOUT_MS,
  ): Promise<{ stopped: boolean; pid?: number }> {
    const dirEntry = await lstatOrNull(stateDir)
    if (!dirEntry) return { stopped: false }
    if (dirEntry.isSymbolicLink() || !dirEntry.isDirectory()) {
      throw new DaemonLifecycleError(`Refusing non-directory daemon state path: ${stateDir}`)
    }
    const release = await lockStateDir(stateDir)
    try {
      const record = await readDaemonRecord(stateDir)
      if (!record) return { stopped: false }
      const alive = isProcessAlive(record.pid)
      if (alive) await terminateProcess(record.pid, timeoutMs)
      await rm(DifflabDaemon.metadataPath(stateDir), { force: true })
      return alive ? { stopped: true, pid: record.pid } : { stopped: false }
    } finally {
      await release()
    }
  }

  /** Return a new `DifflabDaemon` with merged option overrides. */
  withOptions(overrides: Partial<DifflabDaemonOptions>): DifflabDaemon {
    return new DifflabDaemon({ ...this.options, ...overrides })
  }

  /** Start the daemon in foreground or background mode based on options. */
  async run(runOptions?: {
    foreground?: boolean
  }): Promise<Extract<DaemonStatus, { running: true }> | null> {
    const foreground = runOptions?.foreground ?? this.options.foreground ?? false
    if (foreground) {
      await this.runForeground()
      return null
    }
    return await this.runBackground()
  }

  /** Run the server in the foreground, forwarding SIGINT and SIGTERM. */
  async runForeground(): Promise<void> {
    const launch = buildLaunchSpec(this.options)
    await new Promise<void>((resolveRun, rejectRun) => {
      const child = spawn(launch.command, launch.args, { env: launch.env, stdio: 'inherit' })
      const forwardSigint = () => child.kill('SIGINT')
      const forwardSigterm = () => child.kill('SIGTERM')
      process.on('SIGINT', forwardSigint)
      process.on('SIGTERM', forwardSigterm)
      const cleanup = () => {
        process.off('SIGINT', forwardSigint)
        process.off('SIGTERM', forwardSigterm)
      }
      child.on('error', (error) => {
        cleanup()
        rejectRun(error)
      })
      child.on('exit', (code) => {
        cleanup()
        if (code && code !== 0) process.exitCode = code
        resolveRun()
      })
    })
  }

  /** Ensure a healthy detached background daemon is running and return its metadata. */
  async runBackground(): Promise<Extract<DaemonStatus, { running: true }>> {
    const { stateDir } = this.options
    const existing = await DifflabDaemon.status(stateDir)
    if (existing.running) return existing

    await ensureSafeStateDir(stateDir)
    const release = await lockStateDir(stateDir)
    try {
      const rechecked = await DifflabDaemon.status(stateDir)
      if (rechecked.running) return rechecked

      const stale = await readDaemonRecord(stateDir)
      if (stale && isProcessAlive(stale.pid)) {
        await terminateProcess(stale.pid, DEFAULT_STOP_TIMEOUT_MS)
      }
      await rm(DifflabDaemon.metadataPath(stateDir), { force: true })

      const launch = buildLaunchSpec(this.options)
      await mkdir(dirname(launch.logPath), { recursive: true })
      const logFd = openSync(launch.logPath, 'a', 0o600)
      let childPid: number | undefined
      try {
        const child = spawn(launch.command, launch.args, {
          env: launch.env,
          detached: true,
          stdio: ['ignore', logFd, logFd],
        })
        childPid = child.pid
        child.unref()
      } finally {
        closeSync(logFd)
      }

      if (!childPid) {
        throw new DaemonLifecycleError('Failed to spawn background daemon process')
      }

      const deadline = Date.now() + (this.options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS)
      while (Date.now() < deadline) {
        if (!isProcessAlive(childPid)) {
          throw new DaemonLifecycleError(
            `Background daemon exited before becoming healthy; see ${launch.logPath}`,
          )
        }
        const record = await readDaemonRecord(stateDir)
        if (record && record.pid === childPid && (await probeHealth(record.server_url))) {
          logger.info('Daemon started', {
            pid: record.pid,
            server_url: record.server_url,
            rpc_url: record.rpc_url,
          })
          return {
            running: true,
            pid: record.pid,
            server_url: record.server_url,
            rpc_url: record.rpc_url,
          }
        }
        await Bun.sleep(POLL_INTERVAL_MS)
      }

      await terminateProcess(childPid, 1_000)
      throw new DaemonLifecycleError(
        `Timed out waiting for daemon health check; see ${launch.logPath}`,
      )
    } finally {
      await release()
    }
  }

  /** Inspect running status for this daemon's state directory. */
  status(): Promise<DaemonStatus> {
    return DifflabDaemon.status(this.options.stateDir)
  }

  /** Stop the daemon for this daemon's state directory. */
  stop(timeoutMs?: number): Promise<{ stopped: boolean; pid?: number }> {
    return DifflabDaemon.stop(this.options.stateDir, timeoutMs)
  }
}

// Helpers ---------------------------------------------------------------------
function buildLaunchSpec(options: DifflabDaemonOptions): {
  command: string
  args: string[]
  env: NodeJS.ProcessEnv
  logPath: string
} {
  const paths = DifflabConfig.fromRoot(options.stateDir).paths
  const env: NodeJS.ProcessEnv = options.env ?? {
    ...process.env,
    DIFFLAB_HOME: options.stateDir,
    DIFFLAB_MODE: 'local',
  }
  if (!options.env) delete env.DATABASE_URL

  return {
    command: options.command ?? process.execPath,
    args: options.args ?? [
      DifflabDaemon.resolveApiEntry(options.apiEntry),
      '--port',
      String(options.port ?? 0),
      '--state-dir',
      options.stateDir,
    ],
    env,
    logPath: options.logPath ?? paths.daemonLog,
  }
}

function lockStateDir(stateDir: string): Promise<() => Promise<void>> {
  return lockfile.lock(stateDir, {
    lockfilePath: join(stateDir, DAEMON_LOCK_FILE),
    stale: 15_000,
    retries: { retries: 40, minTimeout: 50, maxTimeout: 250 },
  })
}

async function ensureSafeStateDir(stateDir: string): Promise<void> {
  const existing = await lstatOrNull(stateDir)
  if (existing && (existing.isSymbolicLink() || !existing.isDirectory())) {
    throw new DaemonLifecycleError(`Refusing non-directory daemon state path: ${stateDir}`)
  }
  if (!existing) await mkdir(stateDir, { recursive: true, mode: 0o700 })
}

async function readDaemonRecord(stateDir: string): Promise<DaemonRecord | null> {
  const file = DifflabDaemon.metadataPath(stateDir)
  const entry = await lstatOrNull(file)
  if (!entry) return null
  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw new DaemonLifecycleError(`Refusing unsafe daemon metadata file: ${file}`)
  }
  try {
    const parsed = daemonRecordSchema.safeParse(JSON.parse(await readFile(file, 'utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

async function probeHealth(serverUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${serverUrl.replace(/\/$/, '')}/health`, {
      signal: AbortSignal.timeout(800),
    })
    return response.ok
  } catch {
    return false
  }
}
